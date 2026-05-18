const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  requestAccessToken,
  uploadImage,
  uploadThumbMedia,
  addDraft,
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
  if (!body.title || !body.content) {
    throw new Error('Missing required fields: title, content');
  }

  // 1. Get access token
  const accessToken = await requestAccessToken(APPID, APPSECRET);

  // 2. Decode base64 images to temp files and upload
  const imageUrlMap = {};
  const tmpFiles = [];
  const imageFiles = body.imageFiles || [];

  if (imageFiles.length > 0) {
    for (const img of imageFiles) {
      const tmpPath = path.join(os.tmpdir(), `wechat-${Date.now()}-${img.filename || 'image'}`);
      fs.writeFileSync(tmpPath, Buffer.from(img.data, 'base64'));
      tmpFiles.push(tmpPath);

      const wechatUrl = await uploadImage(accessToken, tmpPath);
      imageUrlMap[img.localPath] = wechatUrl;
    }
  }

  // 3. Replace local image paths with WeChat URLs in content
  let content = body.content;
  for (const [localPath, wechatUrl] of Object.entries(imageUrlMap)) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(escaped, 'g'), wechatUrl);
  }

  // 4. Upload thumb media (first image)
  let thumbMediaId = '';
  if (tmpFiles.length > 0) {
    const thumbResult = await uploadThumbMedia(accessToken, tmpFiles[0]);
    thumbMediaId = thumbResult.mediaId;
  }

  // 5. Generate digest
  const plainText = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const digest = plainText.substring(0, 100);

  // 6. Create draft
  const draftArticle = {
    title: body.title,
    author: body.author || '',
    digest,
    content,
    content_source_url: '',
    thumb_media_id: thumbMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };

  const mediaId = await addDraft(accessToken, draftArticle);

  // 7. Clean up temp files
  for (const tmpFile of tmpFiles) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }

  return mediaId;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST' || req.url !== '/api/publish-wechat-draft') {
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
    const mediaId = await handlePublish(body);
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, mediaId }));
  } catch (err) {
    console.error('Proxy publish error:', err.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`WeChat proxy server listening on port ${PORT}`);
});
