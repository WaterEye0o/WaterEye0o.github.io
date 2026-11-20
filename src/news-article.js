const fs = require('fs');
const path = require('path');
const { generateArticle } = require('./ai-client');

async function generateNewsArticle() {
  const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const userMessage = config.news_prompt;

  console.log('Today\'s article type: 新闻');
  console.log('Calling AI (qodercn) to search and generate news article...');

  const content = await generateArticle({
    systemPrompt: '你是一位专业的宠物新闻公众号编辑，擅长搜索热点新闻并撰写客观、有价值的公众号文章。你必须在文章中插入3-5个图片占位符，格式严格如下：\n<!-- IMAGE: caption="中文图片描述" search="英文搜索关键词" -->\n\n占位符要分布在文章的不同段落之间，caption用中文，search用英文。',
    userPrompt: userMessage + '\n\n【重要】请在文章中合适的位置插入3-5个图片占位符，格式示例：\n\n<!-- IMAGE: caption="宠物食品包装召回公告" search="pet food recall notice" -->\n\n占位符必须直接出现在正文中，不要在代码块里。',
  });

  // 从标题中提取新闻主题。标题可能带 # 前缀，或被 「」『』《》""/** 等符号包裹
  // （历史数据里出现过 「【宠物热点】xxx」，旧正则识别不了会退化成 新闻:未知话题）
  let topic = '新闻:未知话题';
  const HOT_TAG = '【宠物热点】';
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    // 只认标题行：# 开头（含被包裹符包裹的情况），或行首就是【宠物热点】
    const isTitleLine =
      (/^#{1,6}\s/.test(line) || line.startsWith(HOT_TAG) || /^[「『《〈"'\*]/.test(line)) &&
      line.includes(HOT_TAG);
    if (!isTitleLine) {
      continue;
    }
    const idx = line.indexOf(HOT_TAG);
    let title = line.substring(idx).replace(/[」』》〉"'\*]+\s*$/, '').trim();
    if (title.length > HOT_TAG.length) {
      topic = `新闻:${title.substring(HOT_TAG.length)}`;
    }
    break;
  }

  console.log('AI (qodercn) news article generation completed successfully');
  console.log(`News topic: ${topic}`);

  return { content, topic };
}

module.exports = { generateNewsArticle };
