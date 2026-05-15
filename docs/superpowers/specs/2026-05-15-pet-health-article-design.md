# Pet Health Article Auto-Generation Design

## Overview

Automate daily generation of pet health science articles for WeChat Official Account using GitHub Actions. The system fetches content from RSS sources, polishes it via Kimi (Moonshot AI) API, and stores the resulting Markdown articles in the repository. Manual publishing to WeChat Official Account.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            GitHub Action (Daily Trigger)         │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ 1.Fetch  │───▶│ 2.Kimi  │───▶│ 3.Commit │   │
│  │  RSS     │    │ Polish   │    │ Article  │   │
│  └──────────┘    └──────────┘    └──────────┘   │
│                                                  │
│  Secrets: MOONSHOT_API_KEY                      │
└─────────────────────────────────────────────────┘
                         │
                         ▼
        articles/YYYY-MM-DD-title.md
                         │
                         ▼
              Manual publish to WeChat OA
```

## Tech Stack

- **Runtime**: Node.js 20
- **RSS Parsing**: `rss-parser` npm package
- **AI Polishing**: Kimi (Moonshot AI) API, via `openai` npm package with custom base URL (`https://api.moonshot.cn/v1`)
- **Schedule**: GitHub Actions cron, daily at UTC 6:00 (Beijing 14:00)

## Project Structure

```
.github/
  workflows/
    daily-article.yml          # GitHub Action workflow config

src/
  fetch-rss.js                 # Fetch pet health RSS data
  polish-article.js            # Call Kimi API to polish article
  generate-markdown.js         # Generate Markdown file
  main.js                      # Main entry, orchestrates 3 steps

articles/
  YYYY-MM-DD-title.md          # Generated WeChat OA articles

config/
  rss-sources.json             # RSS source config (primary + fallbacks)
  prompts.json                 # Kimi polish prompt template

package.json                   # Node.js dependencies
```

## Component Design

### fetch-rss.js

- Uses `rss-parser` to parse RSS feeds
- Randomly selects from configured sources, prioritizing Xiaohongshu
- Extracts title and content summary from the latest pet health article
- Falls back to next source if primary fails

### polish-article.js

- Calls Kimi (Moonshot AI) API using OpenAI-compatible interface
- Sends polish prompt + original content
- Returns polished WeChat OA-style article
- Uses `openai` npm package with base URL `https://api.moonshot.cn/v1` and model `moonshot-v1-8k`

### generate-markdown.js

- Writes polished content to `articles/YYYY-MM-DD-title.md`
- Includes front matter: title, date, source, source_url, tags
- Sanitizes title for filename (replaces special chars)

### main.js

- Orchestrates the full pipeline: fetch -> polish -> generate
- Checks for duplicate articles (same source_url already exists in articles/)
- Checks if today's date already has an article to avoid duplicates
- Handles errors gracefully: logs warnings, exits without committing on failure
- Returns exit code 0 on success, non-zero on failure (prevents commit step)

## GitHub Action Workflow

```yaml
name: Daily Pet Health Article

on:
  schedule:
    - cron: '0 6 * * *'    # UTC 6:00 = Beijing 14:00
  workflow_dispatch:          # Manual trigger support

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

## Error Handling

- **RSS fetch failure**: Try all configured fallback sources. All fail = skip day, no commit, log warning
- **Kimi API failure**: Retry 1 time. Still fail = skip day, no commit
- **Article already exists**: Check if today's date file exists or source_url is duplicated, skip to avoid repeats
- **Network timeout**: 30-second timeout per HTTP request
- **Commit step**: Only runs if main.js exits with code 0; uses `git diff --staged --quiet` to avoid empty commits

## Configuration

### rss-sources.json

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

### prompts.json

```json
{
  "polish_prompt": "你是一位专业的宠物健康科普公众号编辑。请将以下原始内容润色改写为一篇适合微信公众号发布的科普文章。要求：1.标题吸引人且准确；2.内容通俗易懂，适合普通宠物主人阅读；3.结构清晰，分段合理；4.保持科学准确性，不夸大不误导；5.结尾给出实用建议；6.字数800-1200字。原始内容如下："
}
```

## Generated Article Format

```markdown
---
title: 猫咪呕吐的5种常见原因，铲屎官必看！
date: 2026-05-15
source: RSSHub-小红书宠物
source_url: https://xiaohongshu.com/xxx/xxx
tags: [宠物健康, 猫咪, 科普]
---

# 猫咪呕吐的5种常见原因，铲屎官必看！

（Polished WeChat OA-style content...）

## 实用建议

（Practical advice section...）
```

## Deduplication

- Each article's front matter records `source_url` (original article URL)
- Before generating, main.js scans existing articles in `articles/` directory
- If source_url already exists or today's date already has a file, skip generation
- This prevents duplicate polishing of the same source article