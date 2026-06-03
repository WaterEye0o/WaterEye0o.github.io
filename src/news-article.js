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