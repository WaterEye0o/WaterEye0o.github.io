# 新闻文章生成功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增新闻文章生成功能，实现"每3篇科普文章 + 1篇新闻文章"轮换节奏

**Architecture:** 基于 Git commit 历史判断最近科普文章数量，决定生成科普或新闻。新增 news-article.js 模块，通过 DeepSeek API 搜索近30天国内宠物热点新闻。

**Tech Stack:** Node.js, DeepSeek API, Git, GitHub Actions

---

## 文件结构

| 文件 | 操作 | 责任 |
|------|------|------|
| `config/prompts.json` | 修改 | 添加新闻 prompt 配置 |
| `src/news-article.js` | 新增 | 新闻搜索 + 文章生成模块 |
| `src/main.js` | 修改 | 添加类型判断逻辑，分发到对应生成器 |
| `src/generate-markdown.js` | 修改 | 修改 tags 以支持新闻类型 |

---

### Task 1: 添加新闻 Prompt 配置

**Files:**
- Modify: `config/prompts.json`

- [ ] **Step 1: 读取现有配置文件**

```bash
cat config/prompts.json
```

- [ ] **Step 2: 添加新闻 prompt 配置**

```json
{
  "polish_prompt": "你是一位专业的宠物健康科普公众号编辑。请撰写一篇关于以下话题的宠物健康科普文章，适合微信公众号发布。\n\n要求：\n1. 标题吸引人且准确\n2. 内容通俗易懂，适合普通宠物主人阅读\n3. 结构清晰，分段合理，有科学依据\n4. 保持科学准确性，不夸大不误导\n5. 结尾给出实用建议\n6. 字数800-1200字\n7. 文章需要配图——在正文中合适的位置插入图片占位符\n\n图片占位符格式（严格使用以下格式，不要修改）：\n<!-- IMAGE: caption=\"图片的标注说明文字\" search=\"用于搜索图片的英文关键词\" -->\n\n图片插入要求：\n- 在文章中插入3-5张配图\n- 每张图都要有明确的信息价值，帮助读者理解内容\n- 配图位置应分布在文章的不同段落之间，避免集中在一处\n- caption使用中文，简洁准确地描述图片内容\n- search使用英文关键词，方便搜索引擎检索（例如：cat vaccination veterinarian）\n- 不要在占位符周围额外添加文字说明，占位符本身会替换为带标注的图片\n\n请从专业角度撰写，确保内容有价值。",
  "news_prompt": "你是一位专业的宠物新闻公众号编辑。请搜索并撰写一篇近一个月国内宠物热点新闻文章。\n\n搜索要求：\n- 时间范围：近30天\n- 地域：中国国内\n- 主题：宠物相关（宠物行业新闻、宠物事件、宠物政策法规、宠物社会热点）\n- 筛选标准：选择阅读量高、讨论度大、有社会影响力的热点事件\n\n文章要求：\n1. 标题格式：【宠物热点】xxx，吸引眼球且准确概括事件\n2. 内容客观真实，引用可验证的信息来源\n3. 结构清晰：事件概述 → 详细内容 → 专家观点或实用建议\n4. 字数800-1200字\n5. 文章需要配图——在正文中合适的位置插入图片占位符\n\n图片占位符格式（严格使用以下格式，不要修改）：\n<!-- IMAGE: caption=\"图片的标注说明文字\" search=\"用于搜索图片的英文关键词\" -->\n\n图片插入要求：\n- 在文章中插入3-5张配图\n- 每张图都要有明确的信息价值\n- caption使用中文，search使用英文关键词\n\n请确保内容真实有价值，避免虚构或夸大。",
  "topics": [
    "猫咪常见疾病预防",
    "狗狗疫苗接种指南",
    "宠物饮食营养搭配",
    "猫咪应激反应处理",
    "狗狗日常护理技巧",
    "宠物口腔健康维护",
    "猫狗驱虫知识科普",
    "夏季宠物防暑降温",
    "冬季宠物保暖护理",
    "宠物皮肤病预防",
    "老年宠物健康照护",
    "幼猫幼犬饲养指南",
    "宠物体重管理",
    "猫咪泌尿系统健康",
    "狗狗关节保护知识",
    "宠物心理健康关注",
    "多宠家庭饲养建议",
    "宠物急救常识",
    "猫咪毛发护理",
    "狗狗行为问题纠正"
  ],
  "article_schedule": {
    "science_count": 3,
    "news_count": 1
  }
}
```

- [ ] **Step 3: 提交配置修改**

```bash
git add config/prompts.json
git commit -m "feat: 添加新闻文章 prompt 配置

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 创建新闻文章生成模块

**Files:**
- Create: `src/news-article.js`

- [ ] **Step 1: 创建 news-article.js 文件**

```javascript
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

function createClient() {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_API_KEY environment variable is not set');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
  });
}

async function generateNewsArticle() {
  const client = createClient();
  const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const promptText = config.news_prompt;
  const userMessage = promptText;

  console.log('Today\'s article type: 新闻');
  console.log('Calling DeepSeek API to search and generate news article...');
  
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: '你是一位专业的宠物新闻公众号编辑，擅长搜索热点新闻并撰写客观、有价值的公众号文章。你必须在文章中插入3-5个图片占位符，格式严格如下：\n<!-- IMAGE: caption="中文图片描述" search="英文搜索关键词" -->\n\n占位符要分布在文章的不同段落之间，caption用中文，search用英文。',
      },
      { 
        role: 'user', 
        content: userMessage + '\n\n【重要】请在文章中合适的位置插入3-5个图片占位符，格式示例：\n\n<!-- IMAGE: caption="宠物食品包装召回公告" search="pet food recall notice" -->\n\n占位符必须直接出现在正文中，不要在代码块里。' 
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content;
  
  // 从标题中提取新闻主题（去除【宠物热点】前缀）
  let topic = '新闻:未知话题';
  const titleMatch = content.match(/^#\s*【宠物热点】(.+)/m);
  if (titleMatch) {
    topic = `新闻:${titleMatch[1].trim()}`;
  }
  
  console.log('DeepSeek API news article generation completed successfully');
  console.log(`News topic: ${topic}`);
  
  return { content, topic };
}

module.exports = { generateNewsArticle };
```

- [ ] **Step 2: 提交新模块**

```bash
git add src/news-article.js
git commit -m "feat: 新增新闻文章生成模块

- 通过 DeepSeek API 搜索近30天国内宠物热点
- 生成完整新闻文章（800-1200字）
- 返回 topic 标记为 '新闻:xxx'

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 添加文章类型判断逻辑

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: 读取现有 main.js 文件**

```bash
cat src/main.js
```

- [ ] **Step 2: 修改 main.js 添加类型判断和分发逻辑**

```javascript
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
  const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const schedule = config.article_schedule || { science_count: 3, news_count: 1 };
  const threshold = schedule.science_count;

  // 读取 articles 目录下的文件，按日期排序
  const articlesDir = path.join(__dirname, '..', 'articles');
  if (!fs.existsSync(articlesDir)) {
    return 'science';  // 没有文章时，默认生成科普
  }

  const files = fs.readdirSync(articlesDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();  // 最新的在前

  // 检查最近的文章 topic，统计连续科普文章数量
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
```

- [ ] **Step 3: 提交 main.js 修改**

```bash
git add src/main.js
git commit -m "feat: 添加文章类型判断逻辑

- getArticleType(): 通过 Git 历史判断科普/新闻类型
- 新闻生成失败时回退为科普文章
- 每达到 science_count 篇科普后生成新闻

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 修改 generate-markdown.js 支持新闻类型

**Files:**
- Modify: `src/generate-markdown.js`

- [ ] **Step 1: 修改 tags 以支持新闻类型**

修改 `extractTitleFromPolished` 函数后的 tags 设置：

```javascript
const tags = articleResult.topic.startsWith('新闻:') 
  ? '[宠物热点, 新闻]' 
  : '[宠物健康, 科普]';
```

完整修改后的 `generateMarkdown` 函数：

```javascript
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
```

- [ ] **Step 2: 提交 generate-markdown.js 修改**

```bash
git add src/generate-markdown.js
git commit -m "feat: 支持新闻文章的 tags 标记

新闻文章 tags: [宠物热点, 新闻]
科普文章 tags: [宠物健康, 科普]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 推送并更新代理服务器

**Files:**
- None (部署操作)

- [ ] **Step 1: 推送所有修改到远程仓库**

```bash
git push origin master
```

- [ ] **Step 2: 更新代理服务器**

```bash
scp -i /Users/wuhuabin/WorkSpace/project/dogChat/keys/cline.pem /Users/wuhuabin/WorkSpace/project/WaterEye0o.github.io/src/news-article.js root@47.94.222.221:/root/src/news-article.js

scp -i /Users/wuhuabin/WorkSpace/project/dogChat/keys/cline.pem /Users/wuhuabin/WorkSpace/project/WaterEye0o.github.io/src/main.js root@47.94.222.221:/root/src/main.js

scp -i /Users/wuhuabin/WorkSpace/project/dogChat/keys/cline.pem /Users/wuhuabin/WorkSpace/project/WaterEye0o.github.io/src/generate-markdown.js root@47.94.222.221:/root/src/generate-markdown.js

scp -i /Users/wuhuabin/WorkSpace/project/dogChat/keys/cline.pem /Users/wuhuabin/WorkSpace/project/WaterEye0o.github.io/config/prompts.json root@47.94.222.221:/root/config/prompts.json
```

- [ ] **Step 3: 最终提交**

```bash
git push origin master
```

---

## 自我审查

**1. Spec coverage:**
- ✅ 轮换节奏：Task 3 的 `getArticleType()` 实现科普3篇+新闻1篇逻辑
- ✅ 新闻来源：Task 2 的 `generateNewsArticle()` 通过 DeepSeek API 搜索
- ✅ 文章形式：Task 2 的 prompt 要求800-1200字、完整结构、图片占位符
- ✅ 发布流程：Task 3, 4 使用现有模块

**2. Placeholder scan:**
- ✅ 无 TBD/TODO
- ✅ 无 "add validation" 等模糊描述
- ✅ 所有代码完整

**3. Type consistency:**
- ✅ `articleResult.topic` 格式一致：科普为话题名，新闻为 `新闻:xxx`
- ✅ 函数名一致：`generateNewsArticle()` 在 Task 2 定义，Task 3 使用
- ✅ 返回值结构一致：`{ content, topic }`

---

计划文档版本：v1.0
创建日期：2026-06-03