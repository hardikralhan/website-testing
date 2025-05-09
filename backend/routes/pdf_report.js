// routes/pdf-report.js
// --------------------
const express   = require('express');
const router    = express.Router();
const axios     = require('axios');
const puppeteer = require('puppeteer');
const ejs       = require('ejs');
const path      = require('path');
const { getAllLinks } = require('../utility/allLinks');
const nodemailer = require('nodemailer');
const validator = require('validator');
require('dotenv').config();  

// Configure SMTP transporter; ensure the following env vars are set:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, optionally SMTP_SECURE ('true' or 'false'), SMTP_FROM
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
// console.log(transporter);


// Utility to render HTML from EJS
async function generateHtml(allResults, startUrl) {
  const templatePath = path.resolve(__dirname, '../views/pdf_report.ejs');
  return await ejs.renderFile(templatePath, { allResults, startUrl }, { async: true });
}

router.post('/pdf-report', async (req, res) => {
  const { url: startUrl, email } = req.body;
  if (!startUrl || typeof startUrl !== 'string') {
    return res.status(400).json({ error: 'Valid start URL is required' });
  }
  if (typeof email !== 'string' || !validator.isEmail(email)) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }

  console.info(`➡️  Generating PDF report for site crawl starting at ${startUrl}`);

  // 1️⃣ Crawl site for links
  let allLinks;
  try {
    // allLinks = await getAllLinks(startUrl);
    // allLinks = ['https://www.digitalavenues.com/', 'https://www.digitalavenues.com/our-work']
    allLinks = ['https://www.digitalavenues.com/']
    console.info(`ℹ️  Found ${allLinks.length} unique links to report on`);
  } catch (crawlErr) {
    console.error('❌ Site crawl failed:', crawlErr);
    return res.status(500).json({ error: 'Failed to crawl site for links' });
  }

  // 2️⃣ Define your API endpoints
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const endpoints = [
    { name: 'accessibility', path: '/api/accessibility-report' },
    { name: 'grammar',       path: '/api/grammar-check'       },
    { name: 'seo',           path: '/api/seo/seo-report'      },
    { name: 'performance',   path: '/api/performance/performance-report' },
    { name: 'ui',            path: '/api/ui/ui-report'        },
    { name: 'mobile',        path: '/api/mobile/generate-report' }
  ];

  // 3️⃣ Fetch results for each link
  const allResults = {};  
  for (const link of allLinks) {
    console.info(`   ↪️  Fetching reports for ${link}`);
    const linkResults = {};

    for (const ep of endpoints) {
      try {
        const { data } = await axios.post(
          baseUrl + ep.path,
          { url: link },
          { timeout: 2 * 60 * 1000 }  // 2m timeout per API
        );
        linkResults[ep.name] = data;
        console.debug(`      • ${ep.name} OK`);
      } catch (err) {
        console.error(`      • ${ep.name} FAILED for ${link}:`, err.message);
        linkResults[ep.name] = { error: `Failed to fetch ${ep.name}` };
      }
    }

    allResults[link] = linkResults;
  }

  // 4️⃣ Render the combined HTML
  let htmlContent;
  try {
    htmlContent = await generateHtml(allResults, startUrl);
    console.info('ℹ️  HTML content rendered, launching Puppeteer for PDF');
  } catch (renderErr) {
    console.error('❌ EJS render failed:', renderErr);
    return res.status(500).json({ error: 'Failed to render PDF template' });
  }

  // 5️⃣ Generate PDF
  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
    console.info('✅ PDF buffer generated');

    // 6️⃣ Send via email if email provided, otherwise send as binary
    if (email) {
      if (typeof email !== 'string' || !validator.isEmail(email)) {
        return res.status(400).json({ error: 'Valid email address is required' });
      }
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Site Audit PDF Report',
          text: 'Please find the site audit report attached.',
          attachments: [
            { filename: 'site-audit-report.pdf', content: pdfBuffer }
          ]
        });
        console.info('📧 Email sent to', email);
        return res.json({ message: `PDF report emailed to ${email}` });
      } catch (emailErr) {
        console.error('❌ Email send failed:', emailErr);
        return res.status(500).json({ error: 'Failed to send email' });
      }
    }
    // 6️⃣ Send as binary
    // Send via email if requested
    if (email) {
      if (typeof email !== 'string' || !validator.isEmail(email)) {
        return res.status(400).json({ error: 'Valid email address is required' });
      }
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Site Audit PDF Report',
          text: 'Please find the site audit report attached.',
          attachments: [{ filename: 'site-audit-report.pdf', content: pdfBuffer }]
        });
        console.info('📧 Email sent to', email);
        return res.json({ message: `PDF report emailed to ${email}` });
      } catch (emailErr) {
        console.error('❌ Email send failed:', emailErr);
        return res.status(500).json({ error: 'Failed to send email' });
      }
    }

    // Send PDF inline if no email requested
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="site-audit-report.pdf"`,
        'Content-Length': pdfBuffer.length
      })
      .send(pdfBuffer);

  } catch (pdfErr) {
    console.error('❌ PDF generation failed:', pdfErr);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  } finally {
    if (browser) {
      await browser.close();
      console.info('🔒 Puppeteer browser closed');
    }
  }
});

module.exports = router;
