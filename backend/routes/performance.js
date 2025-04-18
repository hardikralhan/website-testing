const express = require('express');
const router = express.Router();
const { runLighthouse } = require('../utility/lighthouse');

// Helper function to categorize performance score
function categorizePerformanceScore(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
}

// Performance Report Endpoint
router.post('/performance-report', async (req, res) => {
    const { url, device = 'desktop' } = req.body;

    // Validate input
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'A valid URL is required' });
    }

    try {
        // Configure Lighthouse options based on device
        const options = {
            emulatedFormFactor: device === 'mobile' ? 'mobile' : 'desktop',
        };

        // Run Lighthouse analysis
        const perf = await runLighthouse(url, options);

        // Format the report
        const report = {
            url,
            device,
            performanceScore: {
                score: perf.performanceScore,
                category: categorizePerformanceScore(perf.performanceScore),
                description: 'The performance score indicates how well the page performs. Higher scores are better, with "Excellent" being the top tier.'
            },
            pageLoadTime: {
                interactive: `${(perf.issues.loadTime.interactive / 1000).toFixed(2)}s`,
                firstContentfulPaint: `${(perf.issues.loadTime.fcp / 1000).toFixed(2)}s`,
                description: 'Time to Interactive (TTI) is when the page becomes fully interactive. First Contentful Paint (FCP) is when the first content appears. Shorter times improve user experience.'
            },
            unsizedImages: perf.issues.unsizedImages?.map(img => ({
                url: img.url || 'Unknown image',
                snippet: img.snippet ? img.snippet : 'Unknown',
                recommendation: 'Add width and height attributes to prevent layout shifts.'
            })) || [],
            httpRequests: {
                count: perf.issues.httpRequests.reduce((acc, item) => acc + item.requestCount, 0),
                details: perf.issues.httpRequests.map(item => ({
                    type: item.resourceType,
                    count: item.requestCount,
                })),
                threshold: device === 'mobile' ? 30 : 50,
                excessive: perf.issues.httpRequests.reduce((acc, item) => acc + item.requestCount, 0) > (device === 'mobile' ? 30 : 50),
                description: `The page makes ${perf.issues.httpRequests.reduce((acc, item) => acc + item.requestCount, 0)} HTTP requests, which is ${perf.issues.httpRequests.reduce((acc, item) => acc + item.requestCount, 0) > (device === 'mobile' ? 30 : 50) ? 'excessive' : 'within limits'} for ${device}. Excessive requests can slow down page load times.`
            },
            renderBlocking: {
                count: perf.issues.renderBlocking.length,
                resources: perf.issues.renderBlocking.map(file => ({
                    url: file,
                    recommendation: `Defer or async load ${file} to prevent blocking the main thread.`
                })),
                description: `${perf.issues.renderBlocking.length} render-blocking resources were found. These delay page content rendering, increasing load time.`
            },
            caching: {
                status: perf.issues.caching,
                description: perf.issues.caching === 'No caching detected'
                    ? 'No caching headers detected. Implement caching to improve repeat visit load times.'
                    : 'Caching headers are present, reducing load times for repeat visits.'
            }
        };

        // Send the formatted report
        res.json(report);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: `Failed to generate report: ${error.message}` });
    }
  });

module.exports = router; // Export the router