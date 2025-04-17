const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const OpenAI = require("openai");
const validator = require('validator');

const openai = new OpenAI();

// Function to take a full-page screenshot
async function takeFullPageScreenshot(url, outputPath) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, {
        waitUntil: 'networkidle0'
    });
    await page.screenshot({
        path: outputPath,
        fullPage: true
    });
    await browser.close();
}

// Function to send the image to the OpenAI API and get the analysis
async function analyzeImageWithAI(imagePath) {
    const base64Image = fs.readFileSync(imagePath, "base64");
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" }, // Enforce JSON output
        messages: [{
            role: "user",
            content: [{
                type: "text",
                text: `Analyze this webpage image for UI/UX consistency issues and provide the results in a JSON object with the following structure:

{
  "inconsistentFonts": [
    {
      "text": "<specific text>",
      "location": "<section of the page>",
      "description": "<how it differs from the expected design>"
    },
    ...
  ],
  "inconsistentColors": [
    {
      "element": "<affected element>",
      "location": "<section of the page>",
      "description": "<color discrepancy>",
      "affectedText": "<specific text if applicable, otherwise null>"
    },
    ...
  ],
  "inconsistentButtonStyles": [
    {
      "button": "<button name or description>",
      "location": "<section of the page>",
      "description": "<style difference>"
    },
    ...
  ],
  "poorWhitespace": [
    {
      "section": "<section of the page>",
      "description": "<impact on readability or aesthetics>"
    },
    ...
  ]
}

Focus on the entire visible webpage and analyze these aspects:
1. Inconsistent Fonts: Identify any text with a different font style, size, or family. Include the exact text, its location, and how it differs.
2. Inconsistent Colors: Note elements (e.g., buttons, links, text) with mismatched colors. Specify the element, its location, the color issue, and any affected text (or null if none).
3. Inconsistent Button Styles: List buttons with varying shapes, sizes, colors, or padding. Provide the button description, location, and style difference.
4. Poor Use of Whitespace: Highlight sections where layout is too cluttered or sparse, noting the section and its impact.

For each issue, provide precise details based on the image analysis. Do not suggest that the user check anything—include all necessary information (e.g., exact text, specific locations) in the response. Ensure the output is a valid JSON object.`
            },
            {
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${base64Image}`,
                },
            }],
        }],
    });
    return JSON.parse(response.choices[0].message.content); // Return parsed JSON object
}

// Main function to generate the UI/UX report
async function generateUIUXReport(url) {
    const screenshotPath = path.join(__dirname, 'screenshot.png');
    try {
        await takeFullPageScreenshot(url, screenshotPath);
        const report = await analyzeImageWithAI(screenshotPath);
        return report;
    } catch (error) {
        throw error;
    } finally {
        if (fs.existsSync(screenshotPath)) {
            fs.unlinkSync(screenshotPath);
        }
    }
}

// API endpoint to analyze a URL
router.post('/ui-report', async (req, res) => {
    const { url } = req.body;
    if (!url || !validator.isURL(url)) {
        return res.status(400).json({ error: 'A valid URL is required' });
    }
    try {
        const report = await generateUIUXReport(url);
        res.json({ report });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while generating the report' });
    }
});

module.exports = router; // Export the router