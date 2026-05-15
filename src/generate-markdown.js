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

function generateMarkdown(articleData, polishedContent) {
  const title = extractTitleFromPolished(polishedContent);
  const today = new Date().toISOString().split('T')[0];
  const filename = `${today}-${sanitizeFilename(title)}.md`;
  const filepath = path.join(__dirname, '..', 'articles', filename);

  const frontMatter = [
    '---',
    `title: ${title}`,
    `date: ${today}`,
    `source: ${articleData.sourceName}`,
    `source_url: ${articleData.sourceUrl}`,
    `tags: [宠物健康, 科普]`,
    '---',
    '',
  ].join('\n');

  const fullContent = frontMatter + polishedContent;

  fs.writeFileSync(filepath, fullContent, 'utf-8');
  console.log(`Article saved: ${filepath}`);
  return filepath;
}

module.exports = { generateMarkdown };