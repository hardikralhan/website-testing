const express   = require('express');
const router    = express.Router();
const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');
const validator = require('validator');
const sharp     = require('sharp');
const { v4: uuidv4 } = require('uuid');
const OpenAI    = require('openai');

const openai = new OpenAI();

// Base directory for all runs
const PUBLIC_SNIPPETS = path.join(__dirname, '..', 'public', 'snippets');

router.post('/ui-ss-report', async (req, res) => {
  const { url } = req.body;
  if (!url || !validator.isURL(url)) {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  // 1️⃣ Generate a fresh runId and its folder
  const runId = uuidv4();
  const runDir = path.join(PUBLIC_SNIPPETS, runId);
  fs.mkdirSync(runDir, { recursive: true });

  let browser, page;
  const screenshotPath = path.join(runDir, 'fullpage.png');

  try {
    // --- CAPTURE the page + DOM ---
    browser = await puppeteer.launch();
    page    = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });

    // screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // only <body>
    const bodyHTML = await page.$eval('body', el => el.innerHTML);

    // encode
    const base64 = fs.readFileSync(screenshotPath, 'base64');

    // --- CALL THE AI ---
    const clipped = bodyHTML.length > 20000
      ? bodyHTML.slice(0, 20000) + '…'
      : bodyHTML;

    const aiResp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `
You are a UI/UX expert. You have two inputs:
1) A full‑page screenshot (image_url)
2) The page’s <body> HTML (below)

Detect all occurrences of:
• Inconsistent fonts
• Inconsistent colors
• Inconsistent button styles
• Poor whitespace usage

For each issue return exactly:
- type: "inconsistentFonts"|"inconsistentColors"|"inconsistentButtonStyles"|"poorWhitespace"
- description: brief human‑readable
- selector: precise CSS selector pinpointing the element

Output ONLY a JSON array. Example:
[
  {
    "type":"inconsistentFonts",
    "description":"Headline uses serif instead of sans",
    "selector":"h1.page-title"
  },
  …
]
`
        },
        {
          type: 'text',
          text: `--- DOM PREVIEW (truncated) ---\n${clipped}\n--- END PREVIEW ---`
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${base64}` }
        }
      ]
      }]
    });

    let issues = JSON.parse(aiResp.choices[0].message.content);
    issues = issues.issues

    // --- CROP each issue via its selector ---
    for (let i = 0; i < issues.length; i++) {
      const { selector, type } = issues[i];
      const handle = await page.$(selector);
      if (!handle) {
        issues[i].snippetUrl = null;
        continue;
      }
      const box = await handle.boundingBox();
      if (!box || box.width === 0 || box.height === 0) {
        issues[i].snippetUrl = null;
        continue;
      }

      const filename = `snippet_${i}_${type}.png`;
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

      // 4️⃣ Build the public URL
      issues[i].snippetUrl = `${req.protocol}://${req.get('host')}`
        + `/snippets/${runId}/${filename}`;
    }

    // --- RETURN everything ---
    res.json({ url, runId, issues });

  } catch (err) {
    console.error('UI report error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });

  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
