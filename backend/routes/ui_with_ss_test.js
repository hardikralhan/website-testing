// routes/ui_test.js
const express   = require('express');
const router    = express.Router();
const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');
const OpenAI    = require('openai');

const openai = new OpenAI();

// Base directory where we’ll keep ALL runs
const BASE_SNIPPETS_DIR = path.join(__dirname, '..', 'public', 'snippets');
if (!fs.existsSync(BASE_SNIPPETS_DIR)) {
  fs.mkdirSync(BASE_SNIPPETS_DIR, { recursive: true });
}

// 1) Screenshot + capture trimmed DOM
async function capturePage(url) {
  const browser = await puppeteer.launch();
  const page    = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });

  const screenshotBuffer = await page.screenshot({ fullPage: true });
  const bodyHTML         = await page.$eval('body', el => el.innerHTML);

  return { browser, page, screenshotBuffer, bodyHTML };
}

// 2) Send screenshot+DOM to OpenAI for UI/UX analysis
async function analyzeWithAI(base64Image, domHTML) {
  const clippedDOM = domHTML.length > 20000
    ? domHTML.slice(0, 20000) + '…'
    : domHTML;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `
You are a UI/UX expert. You have two inputs:
1) A full‑page screenshot (image_url)
2) The page’s HTML <body> contents (below)

Using both, detect:
• Inconsistent fonts  
• Inconsistent colors  
• Inconsistent button styles  
• Poor whitespace usage  

For each issue return exactly:
- type: "inconsistentFonts"|"inconsistentColors"|"inconsistentButtonStyles"|"poorWhitespace"
- description: concise human‑readable
- selector: precise CSS selector to pinpoint the element in the DOM

Output ONLY a JSON array of these objects. Example:

[
  {
    "type": "inconsistentFonts",
    "description": "Headline uses serif instead of sans‑serif.",
    "selector": "h1.page-title"
  },
  ...
]
`
        },
        {
          type: 'text',
          text: `--- DOM PREVIEW ---\n${clippedDOM}\n--- END DOM PREVIEW ---`
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${base64Image}` }
        }
      ]
    }]
  });

  return JSON.parse(resp.choices[0].message.content);
}

// 3) Crop each detected selector into its own snippet
async function cropSnippets(page, issues, runId) {
  const runDir = path.join(BASE_SNIPPETS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  for (let i = 0; i < issues.length; i++) {
    const { selector, type } = issues[i];
    let handle = null;
    try {
      handle = await page.$(selector);
    } catch (e) {
      // invalid selector
    }
    if (!handle) {
      issues[i].snippetUrl = null;
      continue;
    }

    const box = await handle.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
      issues[i].snippetUrl = null;
      continue;
    }

    // Build a unique filename
    const filename = `${runId}_${i}_${type}.png`;
    const outPath  = path.join(runDir, filename);

    await page.screenshot({
      path: outPath,
      clip: {
        x:      Math.round(box.x),
        y:      Math.round(box.y),
        width:  Math.round(box.width),
        height: Math.round(box.height)
      }
    });

    // Return the public URL so front‑end can fetch:
    issues[i].snippetUrl = `/snippets/${runId}/${filename}`;
  }

  return issues;
}

// Main endpoint: POST /api/ui-report
router.post('/ui-ss-report', async (req, res) => {
  const { url } = req.body;
  if (!url || !validator.isURL(url)) {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  // Unique ID for this run
  const runId = uuidv4();
  let browser, page;

  try {
    // 1) capture screenshot + DOM
    const result = await capturePage(url);
    browser = result.browser;
    page    = result.page;

    // 2) ask AI
    const base64 = result.screenshotBuffer.toString('base64');
    const issues = await analyzeWithAI(base64, result.bodyHTML);

    // 3) crop & generate snippet URLs
    await cropSnippets(page, issues.issues, runId);

    // 4) return
    res.json({ url, runId, issues });

  } catch (err) {
    console.error('UI report error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });

  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
