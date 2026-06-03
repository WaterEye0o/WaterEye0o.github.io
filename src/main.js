const fs = require('fs');
const path = require('path');
const { polishArticle } = require('./polish-article');
const { generateNewsArticle } = require('./news-article');
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

/**
 * 通过 Git 历史判断最近科普文章数量，决定今日文章类型
 * @returns {'science' | 'news'} 文章类型
 */
function getArticleType() {
  let threshold;
  try {
    const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const schedule = config.article_schedule || { science_count: 3, news_count: 1 };
    threshold = schedule.science_count;
  } catch (err) {
    console.warn(`Failed to read article schedule config: ${err.message}. Using default threshold=3.`);
    threshold = 3;
  }

  // 读取 articles 目录下的文件，按日期排序
  const articlesDir = path.join(__dirname, '..', 'articles');
  if (!fs.existsSync(articlesDir)) {
    return 'science';  // 没有文章时，默认生成科普
  }

  const files = fs.readdirSync(articlesDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();  // 最新的在前

  // 检查最近的文章的 topic，统计连续科普文章数量
  let consecutiveScienceCount = 0;
  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // 从 frontmatter 提取 topic
    const topicMatch = content.match(/^topic:\s*(.+)$/m);
    if (topicMatch) {
      const topic = topicMatch[1].trim();
      if (topic.startsWith('新闻:')) {
        // 遇到新闻，中断计数
        break;
      } else {
        consecutiveScienceCount++;
        if (consecutiveScienceCount >= threshold) {
          // 已达到科普数量阈值，今日生成新闻
          return 'news';
        }
      }
    } else {
      // 没有 topic 字段，假设是科普文章
      consecutiveScienceCount++;
      if (consecutiveScienceCount >= threshold) {
        return 'news';
      }
    }
  }

  // 未达到阈值，生成科普
  return 'science';
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

  // 判断今日文章类型
  const articleType = getArticleType();
  console.log(`Article type decision: ${articleType}`);

  console.log('Step 1: Generating article...');
  let articleResult;

  if (articleType === 'news') {
    // 生成新闻文章
    try {
      articleResult = await generateNewsArticle();
    } catch (err) {
      console.warn(`News generation failed: ${err.message}. Falling back to science article.`);
      try {
        articleResult = await polishArticle();
      } catch (retryErr) {
        console.error(`Fallback science generation also failed: ${retryErr.message}. Aborting.`);
        process.exit(0);
      }
    }
  } else {
    // 生成科普文章
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