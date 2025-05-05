const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const fs = require('fs');
const {getRemediationFromOpenAI} = require('../utility/accessibility_remidy');
const {getWcagName} = require('../utility/constant');

router.post('/accessibility-report', async (req, res) => {
    console.log('Started accessibility report');
    
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
        if (!results || !results.violations || !results.passes) {
            throw new Error('Axe-core did not return expected results');
        }

        // Process violations with WCAG guidelines and remediation steps
        const violations = await Promise.all(results.violations.map(async (v) => {
            const remediation = await getRemediationFromOpenAI(v.id, v.description);
            return {
                id: v.id,
                description: v.description,
                impact: v.impact,
                wcag: v.tags
                    .filter(tag => tag.startsWith('wcag'))
                    .map(tag => getWcagName(tag)), 
                remediation: remediation,
                helpUrl: v.helpUrl, 
                nodes: v.nodes.map(node => ({
                    target: node.target,
                    html: node.html,
                    failureSummary: node.failureSummary
                }))
            };
        }));

        // Process passes (positive findings)
        const passes = results.passes.map(p => ({
            id: p.id,
            description: p.description,
            // impact: p.impact,
            // wcag: p.tags
            //     .filter(tag => tag.startsWith('wcag'))
            //     .map(tag => getWcagName(tag)), 
            // helpUrl: p.helpUrl, 
            // nodes: p.nodes.map(node => ({
            //     target: node.target
            // }))
        }));

        // Send the enhanced report as JSON
        res.json({
            url: url,
            violations: violations,
            passes: passes
        });
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