const express = require('express');
const router = express.Router();
const axios = require('axios');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');

// Utility function to render HTML from EJS template for PDF
async function generateHtml(results, url) {
  const templatePath = path.resolve(__dirname, '../views/pdf_report.ejs');
  return await ejs.renderFile(templatePath, { results, url }, { async: true });
}

router.post('/pdf-report', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpoints = [
      { name: 'accessibility', path: '/api/accessibility-report' },
      { name: 'grammar',       path: '/api/grammar-check'       },
      { name: 'seo',           path: '/api/seo/seo-report'      },
      { name: 'performance',   path: '/api/performance/performance-report' },
      { name: 'ui',            path: '/api/ui/ui-report'        },
      { name: 'mobile',        path: '/api/mobile/generate-report' }
    ];

    // 1. Fetch all endpoints in parallel
    const responses = await Promise.all(
      endpoints.map(ep =>
        axios.post(baseUrl + ep.path, { url }).then(r => ({ name: ep.name, data: r.data }))
      )
    );
    const results = responses.reduce((acc, { name, data }) => {
      acc[name] = data;
      return acc;
    }, {});

    // 2. Render EJS → HTML
    const htmlContent = await generateHtml(results, url);

    // 3. Launch Puppeteer, generate PDF buffer
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
    await browser.close();

    // 4. Send as binary blob
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="site-audit-report.pdf"`,
        'Content-Length': pdfBuffer.length
      })
      .status(200)
      .send(pdfBuffer);

  } catch (err) {
    console.error('Error generating PDF report:', err);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

module.exports = router;
