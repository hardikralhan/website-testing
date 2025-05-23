// routes/grammar-check.js
// ------------------------
const express   = require('express');
const router    = express.Router();
const puppeteer = require('puppeteer');
const cheerio   = require('cheerio');
const axios     = require('axios');

router.post('/grammar-check', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required' });
  }
  console.info(`➡️  Grammar check requested for ${url}`);

  try {
    // 1. scrape only visible text blocks (including div and span)
    const blocks = await extractTextBlocks(url);
    console.info(`   ↪️  Extracted ${blocks.length} text blocks`);

    // 2. grammar‐check each block
    const rawIssues = [];
    for (const block of blocks) {
      let matches = [];
      try {
        matches = await checkGrammar(block);
      } catch (e) {
        console.error('   ❌ Grammar API error:', e.message);
        continue;
      }

      for (const m of matches) {
        const idx = block.indexOf(m.phrase);
        if (idx < 0) continue;

        const before    = block.slice(Math.max(0, idx - 30), idx).trimEnd();
        const errorText = block.slice(idx, idx + m.phrase.length);
        const after     = block
          .slice(idx + m.phrase.length, idx + m.phrase.length + 30)
          .trimStart();

        // Use **bold** markers only (no HTML tags)
        const context = [before, `**${errorText}**`, after]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        rawIssues.push({
          context,
          suggestion: m.suggestion,
          message:    m.message
        });
      }
    }

    // 3. de-duplicate by context
    const seen = new Set();
    const issues = rawIssues.filter(issue => {
      if (seen.has(issue.context)) return false;
      seen.add(issue.context);
      return true;
    });

    // 4. respond
    if (!issues.length) {
      console.info('✅ No grammar issues detected');
      return res.json({ message: 'No grammar or typo issues detected.' });
    }
    console.warn(`⚠️  Detected ${issues.length} unique issues (filtered from ${rawIssues.length})`);
    return res.json({ url, issues });

  } catch (err) {
    console.error('❌ /grammar-check failed:', err);
    return res.status(500).json({ error: 'Failed to generate grammar report' });
  }
});

/**
 * Scrape the page at `url`, remove non-content elements,
 * replace <br> with newlines, and return an array of text blocks.
 * Includes text from div and span tags as separate blocks.
 */
async function extractTextBlocks(url) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);
    // Remove boilerplate
    $('script, style, nav, header, footer, form').remove();
    // Turn <br> into newline
    $('br').replaceWith('\n');

    const blocks = [];
    // include div, span, p, headings, li
    $('div, span, p, h1, h2, h3, h4, h5, h6, li').each((_, el) => {
      // split into text nodes & spans
      $(el).contents().each((_, node) => {
        let text = '';
        if (node.type === 'text') {
          text = node.data;
        } else if (node.type === 'tag' && node.name === 'span') {
          text = $(node).text();
        } else {
          return;
        }
        // split on newline and normalize
        text.split('\n').forEach(line => {
          const t = line
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // split camelCase
            .replace(/\s+/g, ' ')
            .trim();
          if (t.length > 20) blocks.push(t);
        });
      });
    });

    return blocks;
  } catch (err) {
    console.error('❌ extractTextBlocks error:', err);
    if (browser) await browser.close();
    throw err;
  }
}

/**
 * Call LanguageTool API to check grammar on a single text block.
 * Returns an array of match objects: { phrase, suggestion, message }.
 */
async function checkGrammar(text) {
  const LT_URL = 'https://api.languagetool.org/v2/check';
  const params = new URLSearchParams({ text, language: 'en-US' }).toString();
  const resp = await axios.post(LT_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  });
  const matches = resp.data.matches || [];
  return matches.map(m => ({
    phrase:     m.context.text,
    suggestion: m.replacements[0]?.value || 'No suggestion',
    message:    m.message
  }));
}

module.exports = router;
