const fs = require('fs');
const path = require('path');
const { fetchRSS } = require('./fetch-rss');
const { polishArticle } = require('./polish-article');
const { generateMarkdown } = require('./generate-markdown');

function checkDuplicate(sourceUrl) {
  const articlesDir = path.join(__dirname, '..', 'articles');

  if (!fs.existsSync(articlesDir)) {
    return false;
  }

  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(articlesDir, file), 'utf-8');
    if (content.includes(`source_url: ${sourceUrl}`)) {
      console.log(`Duplicate found: source_url ${sourceUrl} already in ${file}`);
      return true;
    }
  }

  return false;
}

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

  console.log('Step 1: Fetching RSS...');
  const articleData = await fetchRSS();

  if (checkDuplicate(articleData.sourceUrl)) {
    console.log('Source article already processed. Skipping.');
    process.exit(0);
  }

  console.log('Step 2: Polishing article via Kimi...');
  let polishedContent;
  try {
    polishedContent = await polishArticle(articleData);
  } catch (err) {
    console.warn(`First Kimi API call failed: ${err.message}. Retrying...`);
    try {
      polishedContent = await polishArticle(articleData);
    } catch (retryErr) {
      console.error(`Kimi API retry also failed: ${retryErr.message}. Aborting.`);
      process.exit(1);
    }
  }

  console.log('Step 3: Generating Markdown...');
  generateMarkdown(articleData, polishedContent);

  console.log('=== Article generation completed successfully ===');
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});