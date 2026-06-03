const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  requestAccessToken,
  uploadImage,
  uploadThumbMedia,
  addDraft,
  massSend,
} = require('../src/wechat-api');

const PROXY_SECRET = process.env.WECHAT_PROXY_SECRET;
const APPID = process.env.WECHAT_APPID;
const APPSECRET = process.env.WECHAT_APPSECRET;
const PORT = process.env.PORT || 3000;

if (!PROXY_SECRET || !APPID || !APPSECRET) {
  console.error('ERROR: Missing required environment variables:');
  console.error('  WECHAT_PROXY_SECRET, WECHAT_APPID, WECHAT_APPSECRET');
  process.exit(1);
}

function verifyAuth(req) {
  const auth = req.headers['authorization'] || '';
  return auth === `Bearer ${PROXY_SECRET}`;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(text));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

async function handlePublish(body) {
  console.log('\n========== handlePublish 开始 ==========');
  console.log('[输入参数] title:', body.title);
  console.log('[输入参数] publish (是否群发):', body.publish);
  console.log('[输入参数] imageFiles count:', body.imageFiles?.length || 0);

  if (!body.title || !body.content) {
    throw new Error('Missing required fields: title, content');
  }

  // 1. Get access token
  console.log('\n[Step 1] 获取 access_token...');
  const accessToken = await requestAccessToken(APPID, APPSECRET);
  console.log('[Step 1] ✓ access_token 获取成功');

  // 2. Decode base64 images to temp files and upload
  const imageUrlMap = {};
  const tmpFiles = [];
  const imageFiles = body.imageFiles || [];

  if (imageFiles.length > 0) {
    console.log('\n[Step 2] 上传图片...');
    for (const img of imageFiles) {
      const tmpPath = path.join(os.tmpdir(), `wechat-${Date.now()}-${img.filename || 'image'}`);
      fs.writeFileSync(tmpPath, Buffer.from(img.data, 'base64'));
      tmpFiles.push(tmpPath);
      console.log(`  [Step 2] 上传图片: ${img.localPath}`);
      const wechatUrl = await uploadImage(accessToken, tmpPath);
      imageUrlMap[img.localPath] = wechatUrl;
      console.log(`  [Step 2] ✓ 图片上传成功: ${wechatUrl}`);
    }
  } else {
    console.log('\n[Step 2] 无图片需要上传');
  }

  // 3. Replace local image paths with WeChat URLs in content
  let content = body.content;
  for (const [localPath, wechatUrl] of Object.entries(imageUrlMap)) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(escaped, 'g'), wechatUrl);
  }
  console.log('\n[Step 3] 内容图片路径替换完成');

  // 4. Upload thumb media (first image)
  let thumbMediaId = '';
  if (tmpFiles.length > 0) {
    console.log('\n[Step 4] 上传封面图...');
    const thumbResult = await uploadThumbMedia(accessToken, tmpFiles[0]);
    thumbMediaId = thumbResult.mediaId;
    console.log('[Step 4] ✓ 封面图上传成功, thumb_media_id:', thumbMediaId);
  } else {
    console.log('\n[Step 4] 无封面图');
  }

  // 5. Generate digest
  const plainText = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const digest = plainText.substring(0, 100);
  console.log('\n[Step 5] 摘要生成:', digest.substring(0, 50) + '...');

  // 6. Create draft
  console.log('\n[Step 6] 创建草稿...');
  const draftArticle = {
    title: body.title,
    author: body.author || '',
    digest,
    content,
    content_source_url: '',
    thumb_media_id: thumbMediaId,
    need_open_comment: 1,
    only_fans_can_comment: 0,
  };
  console.log('[Step 6] 草稿参数:', JSON.stringify({
    title: draftArticle.title,
    author: draftArticle.author,
    thumb_media_id: draftArticle.thumb_media_id,
    need_open_comment: draftArticle.need_open_comment,
  }));

  const mediaId = await addDraft(accessToken, draftArticle);
  console.log('[Step 6] ✓ 草稿创建成功, media_id:', mediaId);

  // 7. Mass send if requested
  let msgId = null;
  if (body.publish === true) {
    console.log('\n[Step 7] 执行群发...');
    console.log('[Step 7] 群发参数: media_id=' + mediaId + ', is_to_all=true');
    msgId = await massSend(accessToken, mediaId);
    console.log('[Step 7] ✓ 群发完成, msg_id:', JSON.stringify(msgId));
  } else {
    console.log('\n[Step 7] publish=false, 跳过群发');
  }

  // 8. Clean up temp files
  for (const tmpFile of tmpFiles) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
  console.log('\n[Step 8] 临时文件清理完成');

  console.log('\n========== handlePublish 结束 ==========');
  console.log('[返回结果] mediaId:', mediaId);
  console.log('[返回结果] msgId:', JSON.stringify(msgId));

  return { mediaId, msgId };
}

async function handlePublishExisting(body) {
  if (!body.mediaId) {
    throw new Error('Missing required field: mediaId');
  }

  const accessToken = await requestAccessToken(APPID, APPSECRET);
  const msgId = await massSend(accessToken, body.mediaId);
  return { mediaId: body.mediaId, msgId };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return;
  }

  if (!verifyAuth(req)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    let result;

    if (req.url === '/api/publish-wechat-draft') {
      result = await handlePublish(body);
    } else if (req.url === '/api/publish-draft') {
      result = await handlePublishExisting(body);
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, error: 'Not found' }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (err) {
    console.error('Proxy publish error:', err.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`WeChat proxy server listening on port ${PORT}`);
});
