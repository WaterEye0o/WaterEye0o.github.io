const https = require('https');
const fs = require('fs');
const path = require('path');

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpGet(res.headers.location, options));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ statusCode: res.statusCode, headers: res.headers, buffer, text: buffer.toString('utf-8') });
      });
    });
    req.on('error', reject);
    req.setTimeout(options.timeout || 30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// ==================== Unsplash API (Primary) ====================

async function searchImagesUnsplash(keyword, limit = 5) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new Error('UNSPLASH_ACCESS_KEY not set');
  }

  const encodedKeyword = encodeURIComponent(keyword);
  const url = `https://api.unsplash.com/search/photos?query=${encodedKeyword}&per_page=${limit}&orientation=landscape`;

  const response = await httpGet(url, {
    headers: {
      'Authorization': `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
    timeout: 30000,
  });

  if (response.statusCode !== 200) {
    throw new Error(`Unsplash API returned ${response.statusCode}: ${response.text.substring(0, 200)}`);
  }

  const data = JSON.parse(response.text);
  return (data.results || []).map((r) => ({
    image: r.urls?.regular || r.urls?.small,
    thumbnail: r.urls?.small,
    title: r.alt_description || r.description || keyword,
    source: r.links?.html || `https://unsplash.com/photos/${r.id}`,
    width: r.width,
    height: r.height,
    author: r.user?.name || 'Unknown',
    authorUrl: r.user?.links?.html,
    provider: 'unsplash',
  }));
}

// ==================== DuckDuckGo (Fallback) ====================

async function getVqdToken(keyword) {
  const encodedKeyword = encodeURIComponent(keyword);
  const url = `https://duckduckgo.com/?q=${encodedKeyword}&iax=images&ia=images`;

  const response = await httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 30000,
  });

  const vqdMatch = response.text.match(/vqd=([\d-]+)/);
  if (!vqdMatch) {
    throw new Error('Failed to extract vqd token from DuckDuckGo');
  }
  return vqdMatch[1];
}

async function searchImagesDuckDuckGo(keyword, limit = 5) {
  const vqd = await getVqdToken(keyword);
  const encodedKeyword = encodeURIComponent(keyword);
  const url = `https://duckduckgo.com/i.js?q=${encodedKeyword}&o=json&s=0&vqd=${vqd}`;

  const response = await httpGet(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://duckduckgo.com/',
    },
    timeout: 30000,
  });

  if (response.statusCode !== 200) {
    throw new Error(`DuckDuckGo image search returned ${response.statusCode}`);
  }

  const data = JSON.parse(response.text);
  return (data.results || []).slice(0, limit).map((r) => ({
    image: r.image,
    title: r.title,
    source: r.url,
    width: r.width,
    height: r.height,
    author: null,
    authorUrl: null,
    provider: 'duckduckgo',
  }));
}

// ==================== Unified Search ====================

async function searchImages(keyword, limit = 5) {
  // Try Unsplash first
  try {
    const results = await searchImagesUnsplash(keyword, limit);
    if (results.length > 0) {
      console.log(`  Unsplash found ${results.length} images for "${keyword}"`);
      return results;
    }
  } catch (err) {
    console.warn(`  Unsplash search failed: ${err.message}`);
  }

  // Fallback to DuckDuckGo
  try {
    const results = await searchImagesDuckDuckGo(keyword, limit);
    if (results.length > 0) {
      console.log(`  DuckDuckGo found ${results.length} images for "${keyword}"`);
      return results;
    }
  } catch (err) {
    console.warn(`  DuckDuckGo search failed: ${err.message}`);
  }

  console.warn(`  No images found for "${keyword}" from any source`);
  return [];
}

// ==================== Download & Process ====================

async function downloadImage(imageUrl, outputPath) {
  try {
    const response = await httpGet(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      timeout: 60000,
    });

    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    // Validate it's actually an image
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Not an image: ${contentType}`);
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, response.buffer);
    return true;
  } catch (err) {
    console.warn(`    Failed to download image: ${err.message}`);
    return false;
  }
}

function parseImagePlaceholders(content) {
  const regex = /<!--\s*IMAGE:\s*caption="([^"]+)"\s+search="([^"]+)"\s*-->/g;
  const placeholders = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    placeholders.push({
      fullMatch: match[0],
      caption: match[1],
      searchKeyword: match[2],
    });
  }
  return placeholders;
}

function getImageExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    if (ext && ext.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return ext.toLowerCase();
    }
  } catch {
    // ignore
  }
  return '.jpg';
}

async function processImagesInArticle(content, articleSlug) {
  const placeholders = parseImagePlaceholders(content);
  if (placeholders.length === 0) {
    return content;
  }

  console.log(`Found ${placeholders.length} image placeholder(s) in article`);

  const imagesDir = path.join(__dirname, '..', 'images', 'articles', articleSlug);
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  let processedContent = content;
  let imageIndex = 1;

  for (const placeholder of placeholders) {
    console.log(`\n[${imageIndex}/${placeholders.length}] Searching: "${placeholder.searchKeyword}"`);
    const results = await searchImages(placeholder.searchKeyword, 5);

    if (results.length === 0) {
      console.warn(`  Skipping: no images found`);
      processedContent = processedContent.replace(placeholder.fullMatch, '');
      continue;
    }

    let downloaded = false;

    for (const result of results) {
      const ext = getImageExtension(result.image);
      const filename = `img-${String(imageIndex).padStart(2, '0')}${ext}`;
      const outputPath = path.join(imagesDir, filename);

      console.log(`  Trying: ${result.image.substring(0, 80)}...`);
      if (await downloadImage(result.image, outputPath)) {
        downloaded = true;

        const relativePath = `/images/articles/${articleSlug}/${filename}`;

        // Build attribution line
        let attribution = '';
        if (result.provider === 'unsplash' && result.author) {
          attribution = `图片来源: [${result.author}](${result.authorUrl || result.source}) @ Unsplash`;
        } else if (result.source) {
          attribution = `图片来源: [查看原图](${result.source})`;
        }

        const imageMarkdown = [
          '',
          `<figure style="margin: 1.5em 0; text-align: center;">`,
          `  <img src="${relativePath}" alt="${placeholder.caption}" loading="lazy" style="max-width: 100%; border-radius: 8px;" />`,
          `  <figcaption style="margin-top: 0.5em; color: #666; font-size: 0.9em;">`,
          `    ${placeholder.caption}`,
          attribution ? ` <br/><small>${attribution}</small>` : '',
          `  </figcaption>`,
          `</figure>`,
          '',
        ].join('\n');

        processedContent = processedContent.replace(placeholder.fullMatch, imageMarkdown);
        console.log(`  ✓ Downloaded and inserted: ${filename}`);
        imageIndex++;
        break;
      }
    }

    if (!downloaded) {
      console.warn(`  Skipping: all download attempts failed`);
      processedContent = processedContent.replace(placeholder.fullMatch, '');
    }
  }

  return processedContent;
}

module.exports = {
  searchImages,
  downloadImage,
  parseImagePlaceholders,
  processImagesInArticle,
};
