const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const { crawlWebsite } = require('../utility/crawler'); // Adjust path as necessary

async function generateSEOReport(url) {
    try {
        const pages = await crawlWebsite(url);
        const page = pages[0];
        const $ = cheerio.load(page.content);

        const report = {
            url: url,
            meta: {
                title: $('title').text() || 'Missing title tag',
                description: $('meta[name="description"]').attr('content') || 'Missing meta description'
            },
            headings: {
                h1: { count: $('h1').length, details: [] },
                h2: { count: $('h2').length, details: [] },
                h3: { count: $('h3').length, details: [] },
                h4: { count: $('h4').length, details: [] },
                h5: { count: $('h5').length, details: [] },
                h6: { count: $('h6').length, details: [] },
                structureIssues: []
            },
            images: {
                total: $('img').length,
                missingAlt: [],
                emptyAlt: []
            },
            canonical: {
                count: $('link[rel="canonical"]').length,
                href: $('link[rel="canonical"]').attr('href') || 'No canonical tag found'
            },
            structuredData: {
                present: $('script[type="application/ld+json"]').length > 0,
                details: $('script[type="application/ld+json"]').map((i, el) => $(el).html()).get()
            },
            links: {
                total: $('a[href]').length,
                broken: []
            }
        };

        $('h1, h2, h3, h4, h5, h6').each((index, element) => {
            const tag = element.tagName.toLowerCase();
            const text = $(element).text().trim();
            report.headings[tag].details.push({
                position: index + 1,
                text: text || '(Empty heading)'
            });
        });

        const headings = $('h1, h2, h3, h4, h5, h6').toArray();
        let prevLevel = 0;
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName[1]);
            if (index === 0 && level !== 1) {
                report.headings.structureIssues.push('First heading is not H1');
            }
            if (level > prevLevel + 1) {
                report.headings.structureIssues.push(`Heading level jumped from H${prevLevel} to H${level} at position ${index + 1}`);
            }
            prevLevel = level;
        });

        $('img').each((i, img) => {
            const src = $(img).attr('src') || 'unknown source';
            const alt = $(img).attr('alt');
            if (!alt) {
                report.images.missingAlt.push(`Image ${i + 1} at ${src}`);
            } else if (alt.trim() === '') {
                report.images.emptyAlt.push(`Image ${i + 1} at ${src}`);
            }
        });

        const links = $('a[href]').map((i, el) => $(el).attr('href')).get();
        for (const link of links) {
            try {
                if (link.startsWith('http')) {
                    const response = await axios.head(link, { timeout: 5000 });
                    if (response.status >= 400) {
                        report.links.broken.push(link);
                    }
                }
            } catch (error) {
                report.links.broken.push(`${link} (Error: ${error.message})`);
            }
        }

        return report;
    } catch (error) {
        console.error(`Error generating SEO report for ${url}: ${error.message}`);
        throw error;
    }
}

router.post('/seo-report', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const report = await generateSEOReport(url);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: `Failed to generate SEO report: ${error.message}` });
    }
});

module.exports = router;