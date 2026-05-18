const fs = require('fs');
const path = require('path');
const { polishArticle } = require('./polish-article');
const { generateMarkdown } = require('./generate-markdown');
const { publishArticle } = require('./publish-to-wechat');

function getTodayArticlePath() {
  const articlesDir = path.join(__dirname, '..', 'articles');
  const today = new Date().toISOString().split('T')[0];

  if (!fs.existsSync(articlesDir)) {
    return null;
  }

  const files = fs.readdirSync(articlesDir).filter(f => f.startsWith(today) && f.endsWith('.md'));

  if (files.length > 0) {
    return path.join(articlesDir, files[0]);
  }

  return null;
}

async function main() {
  console.log('=== Pet Health Article Generator ===');

  const existingArticle = getTodayArticlePath();

  if (existingArticle) {
    console.log(`Today's article already exists: ${path.basename(existingArticle)}`);

    // 即使文章已存在，仍然发布到微信草稿
    console.log('Step 1: Publishing to WeChat...');
    try {
      await publishArticle(existingArticle);
    } catch (err) {
      console.error(`WeChat publish failed: ${err.message}`);
    }

    console.log('=== Article published to WeChat draft ===');
    process.exit(0);
  }

  console.log('Step 1: Generating article via Kimi...');
  let articleResult;
  try {
    articleResult = await polishArticle();
  } catch (err) {
    console.warn(`First AI API call failed: ${err.message}. Retrying...`);
    try {
      articleResult = await polishArticle();
    } catch (retryErr) {
      console.error(`AI API retry also failed: ${retryErr.message}. Aborting.`);
      process.exit(0);
    }
  }

  console.log('Step 2: Generating Markdown...');
  const filepath = await generateMarkdown(articleResult);

  console.log('Step 3: Publishing to WeChat...');
  try {
    await publishArticle(filepath);
  } catch (err) {
    console.error(`WeChat publish failed: ${err.message}`);
  }

  console.log('=== Article generation completed successfully ===');
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  console.error('No article generated today. Skipping without failing the workflow.');
  process.exit(0);
});