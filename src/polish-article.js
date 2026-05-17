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

function pickTopic() {
  const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const topics = config.topics;

  const today = new Date();
  const dayIndex = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % topics.length;
  return topics[dayIndex];
}

async function polishArticle() {
  const client = createClient();
  const configPath = path.join(__dirname, '..', 'config', 'prompts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const topic = pickTopic();
  const promptText = config.polish_prompt;
  const userMessage = `${promptText}\n\n今日话题：${topic}`;

  console.log(`Today's topic: ${topic}`);
  console.log('Calling DeepSeek API to generate article...');
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: '你是一位专业的宠物健康科普公众号编辑，擅长撰写通俗易懂、科学准确的宠物健康科普文章。\n\n【强制要求】你必须在文章中插入3-5个图片占位符，格式严格如下（不要修改格式）：\n<!-- IMAGE: caption="中文图片描述" search="英文搜索关键词" -->\n\n占位符要分布在文章的不同段落之间，caption用中文，search用英文。',
      },
      { role: 'user', content: userMessage + '\n\n【重要】请在文章中合适的位置插入3-5个图片占位符，格式示例：\n\n<!-- IMAGE: caption="给狗狗测量体温的正确方法" search="dog temperature measurement" -->\n\n占位符必须直接出现在正文中，不要在代码块里。' },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content;
  console.log('DeepSeek API article generation completed successfully');
  return { content, topic };
}

module.exports = { polishArticle };