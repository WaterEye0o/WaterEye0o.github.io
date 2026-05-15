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
  console.log('Calling Kimi API to generate article...');
  const response = await client.chat.completions.create({
    model: 'moonshot-v1-8k',
    messages: [
      { role: 'system', content: '你是一位专业的宠物健康科普公众号编辑，擅长撰写通俗易懂、科学准确的宠物健康科普文章。' },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content;
  console.log('Kimi API article generation completed successfully');
  return { content, topic };
}

module.exports = { polishArticle };