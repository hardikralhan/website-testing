const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const fs = require('fs');

router.post('/accessibility-report', async (req, res) => {
    console.log("started accessibility report");
    
    const { url } = req.body;

    // Check if URL is provided
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let browser;
    try {
        // Launch browser
        browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Navigate to URL and wait for network idle
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Inject axe-core
        await page.addScriptTag({ path: require.resolve('axe-core') });

        // Run axe-core
        const results = await page.evaluate(() => {
            return axe.run(document);
        });

        // Validate results
        if (!results || !results.violations) {
            throw new Error('Axe-core did not return expected results');
        }

        // Optional: Uncomment and adjust for a formatted report
        /*
        const colorContrast = results.violations.filter(v => v.id === 'color-contrast');
        const ariaViolations = results.violations.filter(v => v.id === 'aria-required-attr');

        let report = `# Accessibility Report for ${url}\n\n`;
        report += `## Summary\n`;
        report += `- Poor Color Contrast Issues: ${colorContrast.length}\n`;
        report += `- Missing ARIA Attributes Issues: ${ariaViolations.length}\n\n`;

        if (colorContrast.length > 0) {
            report += `## Poor Color Contrast\n`;
            colorContrast.forEach((v, i) => {
                const node = v.nodes[0];
                report += `### Issue ${i + 1}: Hard-to-Read Text\n`;
                report += `- **Location**: \`${node.target.join(' ')}\`\n`;
                report += `- **What’s Wrong**: ${node.failureSummary}\n`;
                report += `- **Why It Matters**: Visually impaired users may struggle.\n`;
                report += `- **Fix**: Adjust text or background colors.\n\n`;
            });
        }

        if (ariaViolations.length > 0) {
            report += `## Missing ARIA Attributes\n`;
            ariaViolations.forEach((v, i) => {
                const node = v.nodes[0];
                report += `### Issue ${i + 1}: Missing Attribute\n`;
                report += `- **Location**: \`${node.target.join(' ')}\`\n`;
                report += `- **What’s Wrong**: ${node.failureSummary}\n`;
                report += `- **Why It Matters**: Screen readers may misinterpret this.\n`;
                report += `- **Fix**: Add the required ARIA attribute.\n\n`;
            });
        }
        */

        // Send raw violations as JSON (or modify to send `report` if desired)
        res.json({ url: url, violations: results.violations });
    } catch (error) {
        console.error('Accessibility report error:', error);
        res.status(500).json({ error: `Failed to generate report: ${error.message}` });
    } finally {
        // Ensure browser is closed even if an error occurs
        if (browser) {
            await browser.close();
        }
    }
});

module.exports = router;