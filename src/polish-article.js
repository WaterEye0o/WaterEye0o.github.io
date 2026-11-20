const fs = require('fs');
const path = require('path');
const { generateArticle } = require('./ai-client');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'prompts.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// 读取已有文章 frontmatter 的 topic，构成"已用过的科普话题"集合（排除 新闻: 前缀）
function loadUsedTopics() {
  const used = new Set();
  const articlesDir = path.join(__dirname, '..', 'articles');
  if (!fs.existsSync(articlesDir)) {
    return used;
  }

  for (const file of fs.readdirSync(articlesDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(articlesDir, file), 'utf-8');
    const topicMatch = content.match(/^topic:\s*(.+)$/m);
    if (!topicMatch) {
      continue;
    }
    const topic = topicMatch[1].trim();
    if (topic && !topic.startsWith('新闻:')) {
      used.add(topic);
    }
  }

  return used;
}

function pickTopic() {
  const topics = readConfig().topics;

  const today = new Date();
  const startIndex = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % topics.length;

  // 从今日哈希索引开始向后找第一个未写过的话题，避免同名文章重复
  const used = loadUsedTopics();
  for (let offset = 0; offset < topics.length; offset++) {
    const candidate = topics[(startIndex + offset) % topics.length];
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  // 全部话题都写过，退回哈希选题
  return topics[startIndex];
}

async function polishArticle() {
  const config = readConfig();
  const topic = pickTopic();

  const promptText = config.polish_prompt;
  const userMessage = `${promptText}\n\n今日话题：${topic}`;

  console.log(`Today's topic: ${topic}`);
  console.log('Calling AI (qodercn) to generate article...');

  const content = await generateArticle({
    systemPrompt: '你是一位专业的宠物健康科普公众号编辑，擅长撰写通俗易懂、科学准确的宠物健康科普文章。\n\n【强制要求】你必须在文章中插入3-5个图片占位符，格式严格如下（不要修改格式）：\n<!-- IMAGE: caption="中文图片描述" search="英文搜索关键词" -->\n\n占位符要分布在文章的不同段落之间，caption用中文，search用英文。',
    userPrompt: userMessage + '\n\n【重要】请在文章中合适的位置插入3-5个图片占位符，格式示例：\n\n<!-- IMAGE: caption="给狗狗测量体温的正确方法" search="dog temperature measurement" -->\n\n占位符必须直接出现在正文中，不要在代码块里。',
  });

  console.log('AI (qodercn) article generation completed successfully');
  return { content, topic };
}

module.exports = { polishArticle };
