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