const express = require('express');
const router = express.Router();
const axios = require('axios');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const { glob } = require('fs');

// Utility function to render HTML from EJS template for PDF
async function generateHtml(results, url) {
  const templatePath = path.resolve(__dirname, '../views/pdf_report.ejs');
  return await ejs.renderFile(templatePath, { results, url }, { async: true });
}

let glabalResults = {};

// API endpoint to generate PDF report for all tests
router.post('/pdf-report', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpoints = [
      { name: 'accessibility', path: '/api/accessibility-report' },
      { name: 'grammar', path: '/api/grammar-check' },
      { name: 'seo', path: '/api/seo/seo-report' },
      { name: 'performance', path: '/api/performance/performance-report' },
      { name: 'ui', path: '/api/ui/ui-report' },
      { name: 'mobile', path: '/api/mobile/generate-report' },
    ];
    const results = {};
    for (const ep of endpoints) {
      const response = await axios.post(baseUrl + ep.path, { url });
      results[ep.name] = response.data;
      glabalResults[ep.name] = response.data; // Store results globally
    }
    const htmlContent = await generateHtml(results, url);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // Send PDF response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=combined-report.pdf',
    });
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF report:', error);
    return res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

module.exports = router;