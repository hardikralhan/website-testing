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
    // 1) scrape text
    const text = await extractTextFromUrl(url);

    // 2) check grammar via LT HTTP API
    const grammarReport = await checkGrammar(text);

    // 3) format & respond
    const report = grammarReport.length
      ? { issues: grammarReport }
      : { message: 'No grammar or typo issues detected.' };

    res.json(report);
  } catch (err) {
    console.error('Error generating grammar report:', err);
    res.status(500).json({ error: 'Failed to generate grammar report' });
  }
});

// Extract text from a webpage using Puppeteer + Cheerio
async function extractTextFromUrl(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const html    = await page.content();
  await browser.close();

  const $    = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return text;
}

// Check grammar by POSTing to the LanguageTool API
async function checkGrammar(text) {
  const LT_URL = 'https://api.languagetool.org/v2/check';
  const MAX    = 18000;         // chunk size (characters)
  let allMatches = [];

  // chunk the text to avoid LT’s ~20 000-char limit
  for (let i = 0; i < text.length; i += MAX) {
    const slice = text.slice(i, i + MAX);
    const res   = await axios.post(
      LT_URL,
      new URLSearchParams({
        text: slice,
        language: 'en-US'
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
    );

    if (res.data && Array.isArray(res.data.matches)) {
      allMatches = allMatches.concat(res.data.matches);
    }
  }

  // map LT’s matches into your desired shape
  return allMatches.map(m => ({
    phrase:     m.context.text,
    suggestion: m.replacements[0]?.value || 'No suggestion',
    message:    m.message
  }));
}

module.exports = router;
