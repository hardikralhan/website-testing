const express   = require('express');
const router    = express.Router();
const puppeteer = require('puppeteer');
const cheerio   = require('cheerio');
const axios     = require('axios');

// API endpoint to check grammar
router.post('/grammar-check', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    // 1. scrape only visible text blocks
    const blocks = await extractTextBlocks(url);

    // 2. grammar‐check each block
    const issues = [];
    for (let block of blocks) {
      const matches = await checkGrammar(block);
      for (let m of matches) {
        // highlight the error in the block text for clarity:
        const start = block.indexOf(m.phrase);
        const end   = start + m.phrase.length;
        const snippet = [
          block.slice(Math.max(0, start-20), start),
          '**' + block.slice(start, end) + '**',
          block.slice(end, end+20)
        ].join('');
        issues.push({
          context: snippet.trim(),
          suggestion: m.suggestion,
          message: m.message
        });
      }
    }

    // 3. respond
    if (issues.length === 0) {
      return res.json({ message: 'No grammar or typo issues detected.' });
    }
    res.json({ url, issues });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate grammar report' });
  }
});

/**
 * Launch Puppeteer, drop scripts/styles/nav/header/footer,
 * and return an array of visible text blocks (p, headings, li).
 */
async function extractTextBlocks(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const html    = await page.content();
  await browser.close();

  const $ = cheerio.load(html);
  // remove non‐content
  $('script, style, nav, header, footer, form').remove();

  // collect blocks
  const blocks = [];
  $('p, h1, h2, h3, h4, h5, h6, li').each((i, el) => {
    let t = $(el).text().trim().replace(/\s+/g, ' ');
    if (t.length > 20) blocks.push(t);
  });
  return blocks;
}

/**
 * Chunk the block if needed, hit LT’s HTTP API,
 * and return a flat array of matches for that block.
 */
async function checkGrammar(text) {
  const LT_URL = 'https://api.languagetool.org/v2/check';
  // Our blocks should be small (one paragraph), so no chunking here.
  const res = await axios.post(
    LT_URL,
    new URLSearchParams({ text, language: 'en-US' }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
  );

  if (!res.data.matches) return [];
  return res.data.matches.map(m => ({
    phrase:     m.context.text,             // the snippet around the error
    suggestion: m.replacements[0]?.value || 'No suggestion',
    message:    m.message
  }));
}

module.exports = router;
