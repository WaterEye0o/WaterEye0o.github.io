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