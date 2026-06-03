const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const {
  requestAccessToken,
  uploadImage,
  uploadThumbMedia,
  addDraft,
} = require('./wechat-api');

function parseArticle(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let frontmatter = {};
  let body = content;

  if (frontmatterMatch) {
    const fmText = frontmatterMatch[1];
    body = content.substring(frontmatterMatch[0].length);

    for (const line of fmText.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        frontmatter[key] = value;
      }
    }
  }

  // Extract local image paths from body
  const imgRegex = /<img[^>]+src="(\/images\/[^"]+)"[^>]*>/g;
  const localImages = [];
  let match;
  while ((match = imgRegex.exec(body)) !== null) {
    localImages.push(match[1]);
  }

  // Remove H1 title from body (title is sent separately)
  body = body.replace(/^#\s+.+?\n+/, '');

  return {
    title: frontmatter.title || '',
    topic: frontmatter.topic || '',
    date: frontmatter.date || '',
    body,
    localImages: [...new Set(localImages)],
  };
}

function applyInlineFormatting(text) {
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/\*(.+?)\*/g, '<i>$1</i>');
  // WeChat 编辑器会在样式边界处分段；把紧跟加粗的中文标点吞进 <b> 里，避免换行
  text = text.replace(/<\/b>([：:；，。、！？])/g, '$1</b>');
  // 在 </b> 和中文字符之间插入零宽空格，尝试阻止 WeChat 在样式边界强制换行
  text = text.replace(/<\/b>([^<\s])/g, '</b>&#8203;$1');
  return text;
}

// 活泼可爱风格的样式配置
const STYLE_CONFIG = {
  // 全局容器样式
  container: 'style="padding: 20px 15px; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif; color: #333; line-height: 1.8; letter-spacing: 0.5px;"',
  // 标题样式 - 活泼可爱风格
  h2: 'style="font-size: 18px; font-weight: bold; color: #ff6b6b; background: linear-gradient(90deg, #fff5f5 0%, #ffe4e4 100%); padding: 12px 15px; margin: 25px 0 15px 0; border-radius: 10px; border-left: 4px solid #ff6b6b; box-shadow: 0 2px 8px rgba(255,107,107,0.1);"',
  h3: 'style="font-size: 16px; font-weight: bold; color: #ffa94d; background: linear-gradient(90deg, #fff9f0 0%, #ffecb3 100%); padding: 10px 12px; margin: 20px 0 12px 0; border-radius: 8px; border-left: 3px solid #ffa94d;"',
  h4: 'style="font-size: 15px; font-weight: bold; color: #69db7c; padding: 8px 10px; margin: 15px 0 10px 0; border-radius: 6px; background: #f0fff4;"',
  // 段落样式
  p: 'style="font-size: 15px; line-height: 1.8; margin: 12px 0; text-align: justify; color: #444;"',
  // 图片样式
  img: 'style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 15px 0;"',
  // 图片说明样式
  caption: 'style="text-align: center; color: #888; font-size: 13px; margin-top: 8px; padding: 5px; background: #f8f9fa; border-radius: 6px;"',
  // 列表样式
  ul: 'style="margin: 15px 0; padding-left: 20px; list-style-type: none;"',
  ol: 'style="margin: 15px 0; padding-left: 20px; list-style-type: none;"',
  li: 'style="margin: 8px 0; padding-left: 15px; position: relative; font-size: 15px; line-height: 1.7;"',
  // 引用样式
  quote: 'style="background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%); padding: 15px 20px; margin: 15px 0; border-radius: 10px; font-style: italic; color: #666; border-left: 4px solid #7c4dff;"',
};

function convertContentToHtml(body, imageUrlMap) {
  let content = body;
  for (const [localPath, wechatUrl] of Object.entries(imageUrlMap)) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(escaped, 'g'), wechatUrl);
  }

  const lines = content.split('\n');
  const htmlLines = [];

  // 添加全局容器开始
  htmlLines.push(`<div ${STYLE_CONFIG.container}>`);

  let inList = false;
  let listType = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Skip horizontal rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; listType = null; }
      continue;
    }

    // Extract image + caption from figure blocks
    if (trimmed.startsWith('<figure')) {
      const figureLines = [];
      while (i < lines.length && !lines[i].trim().startsWith('</figure>')) {
        figureLines.push(lines[i]);
        i++;
      }
      const figureBlock = figureLines.join('\n');
      const imgMatch = figureBlock.match(/<img[^>]+>/);
      if (imgMatch) {
        // 给图片添加样式
        let imgTag = imgMatch[0];
        if (!imgTag.includes('style=')) {
          imgTag = imgTag.replace('<img', `<img ${STYLE_CONFIG.img}`);
        }
        htmlLines.push(imgTag);
      }
      const captionMatch = figureBlock.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/);
      if (captionMatch) {
        let caption = captionMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<small>[\s\S]*?<\/small>/gi, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (caption) {
          htmlLines.push(`<p ${STYLE_CONFIG.caption}>${caption}</p>`);
        }
      }
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; listType = null; }
      continue;
    }
    if (trimmed.startsWith('</figure>')) continue;
    if (trimmed.startsWith('<figcaption')) {
      while (i < lines.length && !lines[i].trim().startsWith('</figcaption>')) i++;
      continue;
    }
    if (trimmed.startsWith('</figcaption>')) continue;
    if (trimmed.startsWith('<small>')) continue;
    if (trimmed.startsWith('</small>')) continue;

    // Headings - 活泼可爱风格
    if (line.startsWith('#### ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h4 ${STYLE_CONFIG.h4}>${applyInlineFormatting(line.substring(5))}</h4>`);
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h3 ${STYLE_CONFIG.h3}>${applyInlineFormatting(line.substring(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h2 ${STYLE_CONFIG.h2}>${applyInlineFormatting(line.substring(3))}</h2>`);
      continue;
    }

    // Blockquote - 添加活泼样式
    if (line.startsWith('> ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<blockquote ${STYLE_CONFIG.quote}>${applyInlineFormatting(line.substring(2))}</blockquote>`);
      continue;
    }

    // Unordered list - 添加可爱的小圆点
    if (line.startsWith('- ')) {
      if (!inList || listType !== 'ul') {
        if (inList) htmlLines.push(`</${listType}>`);
        htmlLines.push(`<ul ${STYLE_CONFIG.ul}>`);
        inList = true;
        listType = 'ul';
      }
      htmlLines.push(`<li ${STYLE_CONFIG.li}><span style="color: #ff6b6b; font-size: 16px; margin-right: 8px;">●</span>${applyInlineFormatting(line.substring(2))}</li>`);
      continue;
    }

    // Ordered list - 添加可爱的数字
    if (/^\d+\.\s/.test(line)) {
      if (!inList || listType !== 'ol') {
        if (inList) htmlLines.push(`</${listType}>`);
        htmlLines.push(`<ol ${STYLE_CONFIG.ol}>`);
        inList = true;
        listType = 'ol';
      }
      const numMatch = line.match(/^(\d+)\./);
      const num = numMatch ? numMatch[1] : '1';
      const text = line.replace(/^\d+\.\s/, '');
      htmlLines.push(`<li ${STYLE_CONFIG.li}><span style="background: linear-gradient(135deg, #ffa94d, #ff6b6b); color: #fff; font-weight: bold; font-size: 12px; padding: 2px 8px; border-radius: 10px; margin-right: 10px;">${num}</span>${applyInlineFormatting(text)}</li>`);
      continue;
    }

    // Empty line — close any open list, but don't output <br/>
    if (trimmed === '') {
      if (inList) {
        htmlLines.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      continue;
    }

    // Non-empty, non-list line ends any active list
    if (inList) {
      htmlLines.push(`</${listType}>`);
      inList = false;
      listType = null;
    }

    // HTML tags (img, etc.) pass through without wrapping
    if (trimmed.startsWith('<')) {
      // 给独立图片添加样式
      if (trimmed.startsWith('<img') && !trimmed.includes('style=')) {
        htmlLines.push(trimmed.replace('<img', `<img ${STYLE_CONFIG.img}`));
      } else {
        htmlLines.push(trimmed);
      }
    } else {
      htmlLines.push(`<p ${STYLE_CONFIG.p}>${applyInlineFormatting(line)}</p>`);
    }
  }

  if (inList) {
    htmlLines.push(`</${listType}>`);
  }

  // 关闭全局容器
  htmlLines.push('</div>');

  return htmlLines.join('\n');
}

async function publishViaProxy(articlePath) {
  console.log('\n========== publishViaProxy 开始 ==========');
  const proxyUrl = process.env.WECHAT_PROXY_URL;
  const proxySecret = process.env.WECHAT_PROXY_SECRET;
  console.log('[代理URL]', proxyUrl);

  if (!proxySecret) {
    throw new Error('WECHAT_PROXY_SECRET is required when using WECHAT_PROXY_URL');
  }

  const article = parseArticle(articlePath);
  console.log('[文章标题]', article.title);
  console.log('[图片数量]', article.localImages.length);

  const imageFiles = [];
  for (const relativePath of article.localImages) {
    const localPath = path.join(__dirname, '..', relativePath);
    if (!fs.existsSync(localPath)) {
      console.warn('[警告] 图片不存在:', localPath);
      continue;
    }
    const data = fs.readFileSync(localPath).toString('base64');
    imageFiles.push({
      localPath: relativePath,
      filename: path.basename(localPath),
      data,
    });
    console.log('[图片准备]', relativePath);
  }

  const content = convertContentToHtml(article.body, {});

  const payload = {
    title: article.title,
    content,
    author: process.env.WECHAT_AUTHOR || '',
    imageFiles,
    publish: process.env.WECHAT_DIRECT_PUBLISH === 'true',
  };
  console.log('\n[发送请求参数]');
  console.log('  title:', payload.title);
  console.log('  author:', payload.author);
  console.log('  imageFiles count:', payload.imageFiles.length);
  console.log('  publish (是否群发):', payload.publish);
  console.log('  WECHAT_DIRECT_PUBLISH 环境变量:', process.env.WECHAT_DIRECT_PUBLISH);

  const postData = JSON.stringify(payload);
  const url = new URL(proxyUrl);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${proxySecret}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    console.log('\n[HTTP请求]', options.hostname + ':' + options.port + options.path);

    const req = client.request(options, (res) => {
      console.log('[HTTP响应状态码]', res.statusCode);
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        console.log('[HTTP响应内容]', text);
        try {
          const data = JSON.parse(text);
          if (!data.success) {
            console.log('[错误] 代理返回失败:', data.error);
            reject(new Error(data.error || 'Proxy publish failed'));
          } else {
            console.log('\n========== publishViaProxy 成功 ==========');
            console.log('[结果] mediaId:', data.mediaId);
            console.log('[结果] msgId:', JSON.stringify(data.msgId));
            resolve(data);
          }
        } catch (e) {
          console.log('[错误] 解析响应失败:', text);
          reject(new Error(`Invalid proxy response: ${text}`));
        }
      });
    });

    req.on('error', (err) => {
      console.log('[错误] HTTP请求失败:', err.message);
      reject(err);
    });
    req.write(postData);
    req.end();
  });
}

async function publishArticle(articlePath) {
  const proxyUrl = process.env.WECHAT_PROXY_URL;

  if (proxyUrl) {
    console.log('Publishing to WeChat via proxy...');
    const result = await publishViaProxy(articlePath);
    console.log(`  ✓ Draft created via proxy: ${result.mediaId}`);
    if (result.msgId) {
      console.log(`  ✓ Article mass sent: msg_id=${result.msgId.msgId}, msg_data_id=${result.msgId.msgDataId}`);
    }
    return;
  }

  const appId = process.env.WECHAT_APPID;
  const appSecret = process.env.WECHAT_APPSECRET;

  if (!appId || !appSecret) {
    console.warn('WeChat publishing skipped: WECHAT_APPID or WECHAT_APPSECRET not set');
    return;
  }

  console.log('Publishing to WeChat draft...');

  // Step 1: Parse article
  const article = parseArticle(articlePath);
  console.log(`  Title: ${article.title}`);
  console.log(`  Images: ${article.localImages.length}`);

  // Step 2: Get access token
  console.log('  Requesting access token...');
  const accessToken = await requestAccessToken(appId, appSecret);
  console.log('  ✓ Access token obtained');

  // Step 3: Upload body images
  const imageUrlMap = {};
  if (article.localImages.length > 0) {
    console.log('  Uploading images to WeChat...');
    for (const relativePath of article.localImages) {
      const localPath = path.join(__dirname, '..', relativePath);
      console.log(`    Uploading ${relativePath}...`);
      const wechatUrl = await uploadImage(accessToken, localPath);
      imageUrlMap[relativePath] = wechatUrl;
      console.log('    ✓ Uploaded');
    }
  }

  // Step 4: Upload thumb media (use first image)
  let thumbMediaId = '';
  if (article.localImages.length > 0) {
    const firstLocalPath = path.join(__dirname, '..', article.localImages[0]);
    console.log('  Uploading thumb media...');
    const thumbResult = await uploadThumbMedia(accessToken, firstLocalPath);
    thumbMediaId = thumbResult.mediaId;
    console.log('  ✓ Thumb media uploaded');
  }

  // Step 5: Convert content to HTML
  const content = convertContentToHtml(article.body, imageUrlMap);

  // Step 6: Generate digest (first 100 chars of plain text)
  const plainText = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const digest = plainText.substring(0, 100);

  // Step 7: Create draft
  const draftArticle = {
    title: article.title,
    author: process.env.WECHAT_AUTHOR || '',
    digest,
    content,
    content_source_url: '',
    thumb_media_id: thumbMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };

  console.log('  Creating draft...');
  const mediaId = await addDraft(accessToken, draftArticle);
  console.log(`  ✓ Draft created successfully: ${mediaId}`);
}

module.exports = {
  publishArticle,
  parseArticle,
  convertContentToHtml,
};
