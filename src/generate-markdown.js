const fs = require('fs');
const path = require('path');

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

function generateMarkdown(articleResult) {
  const title = extractTitleFromPolished(articleResult.content);
  const today = new Date().toISOString().split('T')[0];
  const filename = `${today}-${sanitizeFilename(title)}.md`;
  const filepath = path.join(__dirname, '..', 'articles', filename);

  const frontMatter = [
    '---',
    `title: ${title}`,
    `date: ${today}`,
    `topic: ${articleResult.topic}`,
    `tags: [宠物健康, 科普]`,
    '---',
    '',
  ].join('\n');

  const fullContent = frontMatter + articleResult.content;

  fs.writeFileSync(filepath, fullContent, 'utf-8');
  console.log(`Article saved: ${filepath}`);
  return filepath;
}

module.exports = { generateMarkdown };