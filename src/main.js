const fs = require('fs');
const path = require('path');
const { polishArticle } = require('./polish-article');
const { generateMarkdown } = require('./generate-markdown');

function checkTodayArticle() {
  const articlesDir = path.join(__dirname, '..', 'articles');
  const today = new Date().toISOString().split('T')[0];

  if (!fs.existsSync(articlesDir)) {
    return false;
  }

  const files = fs.readdirSync(articlesDir).filter(f => f.startsWith(today) && f.endsWith('.md'));

  if (files.length > 0) {
    console.log(`Today's article already exists: ${files[0]}`);
    return true;
  }

  return false;
}

async function main() {
  console.log('=== Pet Health Article Generator ===');

  if (checkTodayArticle()) {
    console.log('Today\'s article already generated. Skipping.');
    process.exit(0);
  }

  console.log('Step 1: Generating article via Kimi...');
  let articleResult;
  try {
    articleResult = await polishArticle();
  } catch (err) {
    console.warn(`First Kimi API call failed: ${err.message}. Retrying...`);
    try {
      articleResult = await polishArticle();
    } catch (retryErr) {
      console.error(`Kimi API retry also failed: ${retryErr.message}. Aborting.`);
      process.exit(0);
    }
  }

  console.log('Step 2: Generating Markdown...');
  generateMarkdown(articleResult);

  console.log('=== Article generation completed successfully ===');
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  console.error('No article generated today. Skipping without failing the workflow.');
  process.exit(0);
});