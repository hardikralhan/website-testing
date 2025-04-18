const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const fs = require('fs');
const OpenAI = require("openai");
const openai = new OpenAI();

// Function to capture a full-page screenshot using Puppeteer
async function captureScreenshot(url, device) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const deviceSettings = {
        'iPhone X': {
            name: 'iPhone X',
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
            viewport: { width: 375, height: 812, isMobile: true, hasTouch: true }
        },
        'Galaxy S9': {
            name: 'Galaxy S9',
            userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G960F Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.137 Mobile Safari/537.36',
            viewport: { width: 360, height: 740, isMobile: true, hasTouch: true }
        }
    };

    if (deviceSettings[device]) {
        const settings = deviceSettings[device];
        await page.setUserAgent(settings.userAgent);
        await page.setViewport(settings.viewport);
    } else {
        throw new Error(`Device "${device}" is not supported.`);
    }

    await page.goto(url, { waitUntil: 'networkidle0' });
    const screenshotPath = `screenshot-${device}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await browser.close();
    return screenshotPath;
}

// Function to convert the screenshot to base64
function getBase64Image(screenshotPath) {
    const imageBuffer = fs.readFileSync(screenshotPath);
    return imageBuffer.toString('base64');
}

// Function to analyze the screenshot with OpenAI and return a JSON response
async function analyzeWithAI(base64Image) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "user",
            content: [{
                type: "text",
                text: `Analyze the provided mobile webpage screenshot for responsiveness issues, overlapping elements, cut-off content, and tap target problems. Return a JSON object with the following structure:

{
  "responsivenessIssues": [
    {
      "description": "<brief description of the issue>",
      "location": "<section or element where the issue occurs>",
      "affectedElements": "<specific text, images, or elements affected>"
    },
    ...
  ],
  "overlappingElements": [
    {
      "description": "<brief description of the overlapping issue>",
      "location": "<section or element where the overlap occurs>",
      "affectedElements": "<specific text, images, or elements that overlap>"
    },
    ...
  ],
  "cutOffContent": [
    {
      "description": "<brief description of the cut-off content>",
      "location": "<section or element where the content is cut off>",
      "affectedElements": "<specific text, images, or elements that are cut off>"
    },
    ...
  ],
  "tapTargetIssues": [
    {
      "description": "<brief description of the tap target issue (too small or too close)>",
      "location": "<section or element where the tap target issue occurs>",
      "affectedElements": "<specific buttons, links, or interactive elements>"
    },
    ...
  ]
}

Ensure the analysis is comprehensive and self-contained, based entirely on the image provided. Do not suggest any further checks.`
            }, {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64Image}` },
            }],
        }],
        response_format: { type: "json_object" } // Enforce JSON response
    });
    return JSON.parse(response.choices[0].message.content);
}

// API endpoint to generate the report
router.post('/generate-report', async (req, res) => {
    const { url, device = 'iPhone X' } = req.body;
    if (!url || !device) {
        return res.status(400).json({ error: 'URL and device are required' });
    }

    try {
        // Step 1: Capture the screenshot
        const screenshotPath = await captureScreenshot(url, device);
        
        // Step 2: Convert the screenshot to base64
        const base64Image = getBase64Image(screenshotPath);
        
        // Step 3: Analyze the screenshot with OpenAI
        const analysis = await analyzeWithAI(base64Image);
        analysis.url = url; // Include the URL in the analysis response
        
        // Step 4: Clean up the screenshot file
        fs.unlinkSync(screenshotPath);
        
        // Step 5: Send the JSON response
        res.json(analysis);
    } catch (error) {
        console.error(`Error generating report: ${error.message}`);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

module.exports = router;