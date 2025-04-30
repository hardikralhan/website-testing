const express = require('express');
const router = express.Router();
const axios = require('axios');
const puppeteer = require('puppeteer');

// Utility functions to generate HTML for PDF
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

function generateHtml(data) {
  const url = data.accessibility?.url || '';
  let html = `
<html>
  <head>
    <meta charset='utf-8'>
    <title>Combined Test Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1, h2 { color: #333; }
      pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow: auto; }
      section { margin-bottom: 40px; }
    </style>
  </head>
  <body>
    <h1>Combined Test Report for ${escapeHtml(url)}</h1>
`;
  for (const [key, value] of Object.entries(data)) {
    html += `
    <section>
      <h2>${capitalize(key)} Test</h2>
      <pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>
    </section>
`;
  }
  html += `
  </body>
</html>
`;
  return html;
}

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
    }
    const htmlContent = generateHtml(results);
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