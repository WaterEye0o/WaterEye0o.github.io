# Pet Health Article Auto-Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js pipeline that fetches pet health RSS content, polishes it via Kimi API, and stores Markdown articles in the repo, triggered daily by GitHub Actions.

**Architecture:** Three-step pipeline (fetch -> polish -> generate) orchestrated by main.js, configured by JSON files, running in GitHub Actions with auto-commit of generated articles.

**Tech Stack:** Node.js 20, rss-parser, openai (Kimi/Moonshot), GitHub Actions

---

## File Structure

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies: rss-parser, openai |
| `config/rss-sources.json` | RSS feed URLs (primary + 2 fallbacks) |
| `config/prompts.json` | Kimi polish prompt template |
| `src/fetch-rss.js` | Fetch & parse RSS feeds, return latest article data |
| `src/polish-article.js` | Call Kimi API to rewrite article into OA style |
| `src/generate-markdown.js` | Write polished content as Markdown with front matter |
| `src/main.js` | Orchestrate pipeline, dedup check, error handling |
| `.github/workflows/daily-article.yml` | GitHub Action: daily cron + manual trigger |
| `articles/.gitkeep` | Ensure articles directory exists in git |

---

### Task 1: Initialize Node.js project and install dependencies

**Files:**
- Create: `package.json`
- Create: `articles/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pet-health-article-generator",
  "version": "1.0.0",
  "description": "Auto-generate pet health WeChat OA articles from RSS sources via Kimi AI",
  "main": "src/main.js",
  "scripts": {
    "start": "node src/main.js"
  },
  "dependencies": {
    "rss-parser": "^3.13.0",
    "openai": "^4.78.0"
  }
}
```

- [ ] **Step 2: Create articles directory with .gitkeep**

```bash
mkdir -p articles
touch articles/.gitkeep
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json articles/.gitkeep
git commit -m "feat: initialize Node.js project with rss-parser and openai dependencies"
```

---

### Task 2: Create configuration files

**Files:**
- Create: `config/rss-sources.json`
- Create: `config/prompts.json`

- [ ] **Step 1: Create rss-sources.json**

```json
{
  "sources": [
    {
      "name": "RSSHub-小红书宠物",
      "url": "https://rsshub.app/xiaohongshu/search/宠物健康科普"
    },
    {
      "name": "RSSHub-知乎宠物",
      "url": "https://rsshub.app/zhihu/search/宠物健康"
    },
    {
      "name": "RSSHub-今日头条宠物",
      "url": "https://rsshub.app/toutiao/search/宠物健康科普"
    }
  ]
}
```

- [ ] **Step 2: Create prompts.json**

```json
{
  "polish_prompt": "你是一位专业的宠物健康科普公众号编辑。请将以下原始内容润色改写为一篇适合微信公众号发布的科普文章。要求：1.标题吸引人且准确；2.内容通俗易懂，适合普通宠物主人阅读；3.结构清晰，分段合理；4.保持科学准确性，不夸大不误导；5.结尾给出实用建议；6.字数800-1200字。原始内容如下："
}
```

- [ ] **Step 3: Commit**

```bash
git add config/rss-sources.json config/prompts.json
git commit -m "feat: add RSS sources and Kimi prompt configuration"
```

---

### Task 3: Implement fetch-rss.js

**Files:**
- Create: `src/fetch-rss.js`

- [ ] **Step 1: Create src directory**

```bash
mkdir -p src
```

- [ ] **Step 2: Write fetch-rss.js**

```javascript
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 30000 });

async function fetchRSS() {
  const configPath = path.join(__dirname, '..', 'config', 'rss-sources.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  for (const source of config.sources) {
    try {
      console.log(`Fetching from: ${source.name} (${source.url})`);
      const feed = await parser.parseURL(source.url);

      if (feed.items && feed.items.length > 0) {
        const item = feed.items[0];
        console.log(`Got article: "${item.title}" from ${source.name}`);
        return {
          title: item.title || '',
          content: item.contentSnippet || item.content || '',
          sourceUrl: item.link || '',
          sourceName: source.name,
        };
      }

      console.log(`No items found in ${source.name}, trying next source...`);
    } catch (err) {
      console.warn(`Failed to fetch from ${source.name}: ${err.message}`);
    }
  }

  throw new Error('All RSS sources failed. No article fetched today.');
}

module.exports = { fetchRSS };
```

- [ ] **Step 3: Commit**

```bash
git add src/fetch-rss.js
git commit -m "feat: add RSS fetch module with fallback sources"
```

---

### Task 4: Implement polish-article.js

**Files:**
- Create: `src/polish-article.js`

- [ ] **Step 1: Write polish-article.js**

```javascript
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

function createClient() {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY environment variable is not set');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.moonshot.cn/v1',
  });
}

async function polishArticle(articleData) {
  const client = createClient();
  const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const promptText = config.polish_prompt;
  const userMessage = `${promptText}\n\n标题：${articleData.title}\n内容：${articleData.content}`;

  console.log('Calling Kimi API to polish article...');
  const response = await client.chat.completions.create({
    model: 'moonshot-v1-8k',
    messages: [
      { role: 'system', content: '你是一位专业的宠物健康科普公众号编辑，擅长将专业内容转化为通俗易懂的科普文章。' },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const polishedContent = response.choices[0].message.content;
  console.log('Kimi API polishing completed successfully');
  return polishedContent;
}

module.exports = { polishArticle };
```

- [ ] **Step 2: Commit**

```bash
git add src/polish-article.js
git commit -m "feat: add Kimi API polishing module"
```

---

### Task 5: Implement generate-markdown.js

**Files:**
- Create: `src/generate-markdown.js`

- [ ] **Step 1: Write generate-markdown.js**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/generate-markdown.js
git commit -m "feat: add Markdown generation module with front matter"
```

---

### Task 6: Implement main.js orchestrator

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Write main.js**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: add main orchestrator with dedup check and retry logic"
```

---

### Task 7: Create GitHub Action workflow

**Files:**
- Create: `.github/workflows/daily-article.yml`

- [ ] **Step 1: Create workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write daily-article.yml**

```yaml
name: Daily Pet Health Article

on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  generate-article:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - run: node src/main.js
        env:
          MOONSHOT_API_KEY: ${{ secrets.MOONSHOT_API_KEY }}

      - name: Commit new article
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add articles/
          git diff --staged --quiet || git commit -m "自动生成宠物健康文章 $(date +%Y-%m-%d)"
          git push
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily-article.yml
git commit -m "feat: add GitHub Action workflow for daily article generation"
```

---

### Task 8: Add .gitignore for node_modules

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write .gitignore**

```
node_modules/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore for node_modules"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- RSS fetching with fallback → Task 3 ✓
- Kimi API polishing → Task 4 ✓
- Markdown generation with front matter → Task 5 ✓
- Main orchestrator with dedup + retry → Task 6 ✓
- GitHub Action daily cron + manual trigger → Task 7 ✓
- Configuration files → Task 2 ✓
- Project initialization → Task 1 ✓
- .gitignore → Task 8 ✓
- 30s timeout → Task 3 (Parser timeout option) ✓
- Error handling (all sources fail, Kimi retry) → Task 3, Task 6 ✓

**2. Placeholder scan:** No TBD, TODO, or vague steps found.

**3. Type consistency:**
- `articleData` shape: `{ title, content, sourceUrl, sourceName }` defined in Task 3, consumed consistently in Tasks 4, 5, 6 ✓
- `polishedContent` is a string, used consistently ✓
- `generateMarkdown` returns filepath, not used elsewhere (main.js only calls it, no further processing needed) ✓