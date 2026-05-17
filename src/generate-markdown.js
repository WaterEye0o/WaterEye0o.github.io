const fs = require('fs');
const path = require('path');
const { processImagesInArticle } = require('./search-images');

function sanitizeFilename(title) {
  return title
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

function extractTitleFromPolished(polishedContent) {
  const lines = polishedContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') && trimmed.length > 2) {
      return trimmed.substring(2);
    }
  }
  return 'untitled';
}

async function generateMarkdown(articleResult) {
  const title = extractTitleFromPolished(articleResult.content);
  const today = new Date().toISOString().split('T')[0];
  const slug = sanitizeFilename(title);
  const filename = `${today}-${slug}.md`;
  const filepath = path.join(__dirname, '..', 'articles', filename);

  console.log('Step 3: Searching and downloading images...');
  const contentWithImages = await processImagesInArticle(articleResult.content, slug);

  const frontMatter = [
    '---',
    `title: ${title}`,
    `date: ${today}`,
    `topic: ${articleResult.topic}`,
    `tags: [宠物健康, 科普]`,
    '---',
    '',
  ].join('\n');

  const fullContent = frontMatter + contentWithImages;

  fs.writeFileSync(filepath, fullContent, 'utf-8');
  console.log(`Article saved: ${filepath}`);

  // Sync to Hexo source directory
  const hexoPostsDir = path.join(__dirname, '..', 'source', '_posts');
  const hexoImagesDir = path.join(__dirname, '..', 'source', 'images');
  if (!fs.existsSync(hexoPostsDir)) {
    fs.mkdirSync(hexoPostsDir, { recursive: true });
  }
  const hexoFilepath = path.join(hexoPostsDir, filename);
  fs.writeFileSync(hexoFilepath, fullContent, 'utf-8');
  console.log(`Article synced to Hexo: ${hexoFilepath}`);

  // Sync images to Hexo source
  const imagesDir = path.join(__dirname, '..', 'images', 'articles', slug);
  const hexoArticleImagesDir = path.join(hexoImagesDir, 'articles', slug);
  if (fs.existsSync(imagesDir)) {
    if (!fs.existsSync(hexoArticleImagesDir)) {
      fs.mkdirSync(hexoArticleImagesDir, { recursive: true });
    }
    for (const file of fs.readdirSync(imagesDir)) {
      fs.copyFileSync(
        path.join(imagesDir, file),
        path.join(hexoArticleImagesDir, file)
      );
    }
    console.log(`Images synced to Hexo: ${hexoArticleImagesDir}`);
  }

  return filepath;
}

module.exports = { generateMarkdown };
