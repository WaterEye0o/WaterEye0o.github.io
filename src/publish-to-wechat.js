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
  text = text.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight:bold;">$1</span>');
  text = text.replace(/\*(.+?)\*/g, '<span style="font-style:italic;">$1</span>');
  return text;
}

function convertContentToHtml(body, imageUrlMap) {
  let content = body;
  for (const [localPath, wechatUrl] of Object.entries(imageUrlMap)) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(escaped, 'g'), wechatUrl);
  }

  const lines = content.split('\n');
  const htmlLines = [];
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
        htmlLines.push(imgMatch[0]);
      }
      const captionMatch = figureBlock.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/);
      if (captionMatch) {
        let caption = captionMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<small>[\s\S]*?<\/small>/gi, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (caption) {
          htmlLines.push(`<p style="text-align:center;color:#888;font-size:14px;margin-top:8px;">${caption}</p>`);
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

    // Headings
    if (line.startsWith('#### ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h4>${applyInlineFormatting(line.substring(5))}</h4>`);
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h3>${applyInlineFormatting(line.substring(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<h2>${applyInlineFormatting(line.substring(3))}</h2>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (inList) { htmlLines.push(`</${listType}>`); inList = false; }
      htmlLines.push(`<p>${applyInlineFormatting(line.substring(2))}</p>`);
      continue;
    }

    // Unordered list
    if (line.startsWith('- ')) {
      if (!inList || listType !== 'ul') {
        if (inList) htmlLines.push(`</${listType}>`);
        htmlLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      htmlLines.push(`<li>${applyInlineFormatting(line.substring(2))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      if (!inList || listType !== 'ol') {
        if (inList) htmlLines.push(`</${listType}>`);
        htmlLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const text = line.replace(/^\d+\.\s/, '');
      htmlLines.push(`<li>${applyInlineFormatting(text)}</li>`);
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
      htmlLines.push(trimmed);
    } else {
      htmlLines.push(`<p>${applyInlineFormatting(line)}</p>`);
    }
  }

  if (inList) {
    htmlLines.push(`</${listType}>`);
  }

  return htmlLines.join('');
}

async function publishViaProxy(articlePath) {
  const proxyUrl = process.env.WECHAT_PROXY_URL;
  const proxySecret = process.env.WECHAT_PROXY_SECRET;

  if (!proxySecret) {
    throw new Error('WECHAT_PROXY_SECRET is required when using WECHAT_PROXY_URL');
  }

  const article = parseArticle(articlePath);
  console.log(`  Title: ${article.title}`);
  console.log(`  Images: ${article.localImages.length}`);

  const imageFiles = [];
  for (const relativePath of article.localImages) {
    const localPath = path.join(__dirname, '..', relativePath);
    if (!fs.existsSync(localPath)) {
      console.warn(`    Image not found: ${localPath}`);
      continue;
    }
    const data = fs.readFileSync(localPath).toString('base64');
    imageFiles.push({
      localPath: relativePath,
      filename: path.basename(localPath),
      data,
    });
  }

  const content = convertContentToHtml(article.body, {});

  const payload = {
    title: article.title,
    content,
    author: process.env.WECHAT_AUTHOR || '',
    imageFiles,
    publish: process.env.WECHAT_DIRECT_PUBLISH === 'true',
  };

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

    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        try {
          const data = JSON.parse(text);
          if (!data.success) {
            reject(new Error(data.error || 'Proxy publish failed'));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error(`Invalid proxy response: ${text}`));
        }
      });
    });

    req.on('error', reject);
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
    if (result.publishId) {
      console.log(`  ✓ Article published: ${result.publishId}`);
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
