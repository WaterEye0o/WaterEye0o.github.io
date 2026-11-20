const fs = require('fs');
const path = require('path');
const { processImagesInArticle } = require('./search-images');

function sanitizeFilename(title) {
  return title
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

// 成对出现的标题包裹符号：模型常把标题写成 「【宠物热点】xxx」 这类形式。
// 注意不包含【】，否则会把标题前缀本身剥掉。
const WRAP_PAIRS = [
  ['「', '」'], ['『', '』'], ['《', '》'], ['〈', '〉'],
  ['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"],
];

// 反复剥掉行首行尾的包裹符号（书名号/引号/Markdown 加粗/行内代码）
function unwrapTitle(text) {
  let result = text.trim();
  let changed = true;

  while (changed && result.length > 0) {
    changed = false;

    for (const [open, close] of WRAP_PAIRS) {
      if (result.startsWith(open) && result.endsWith(close) && result.length > open.length + close.length) {
        result = result.substring(open.length, result.length - close.length).trim();
        changed = true;
      }
    }

    if (result.length > 4 && result.startsWith('**') && result.endsWith('**')) {
      result = result.substring(2, result.length - 2).trim();
      changed = true;
    } else if (result.length > 2 && (result.startsWith('*') || result.startsWith('`')) && (result.endsWith('*') || result.endsWith('`'))) {
      result = result.substring(1, result.length - 1).trim();
      changed = true;
    }
  }

  return result;
}

function extractTitleFromPolished(polishedContent) {
  const lines = polishedContent.split('\n');
  for (const line of lines) {
    const unwrapped = unwrapTitle(line);
    if (!unwrapped) {
      continue;
    }

    // 格式1: # xxx（标准 markdown 标题，标题文字本身可能再被 「」 或 ** 包裹）
    const heading = unwrapped.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      const title = unwrapTitle(heading[1]);
      if (title.length > 1) {
        return title;
      }
    }

    // 格式2: 【宠物热点】xxx（新闻文章可能没有 # 前缀）
    if (unwrapped.startsWith('【宠物热点】') && unwrapped.length > 8) {
      const head = '【宠物热点】';
      const tail = unwrapTitle(unwrapped.substring(head.length));
      return tail ? `${head}${tail}` : unwrapped;
    }
  }

  console.warn(`Failed to extract title from article, falling back to "untitled". First line: ${JSON.stringify((lines[0] || '').trim().substring(0, 60))}`);
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

  // 根据 topic 类型设置不同的 tags
  const tags = articleResult.topic.startsWith('新闻:')
    ? '[宠物热点, 新闻]'
    : '[宠物健康, 科普]';

  const frontMatter = [
    '---',
    `title: ${title}`,
    `date: ${today}`,
    `topic: ${articleResult.topic}`,
    `tags: ${tags}`,
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
