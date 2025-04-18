const express = require('express');
const router = express.Router();
const { runLighthouse } = require('../utility/lighthouse');

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
        performanceScore: perf.performanceScore,
        pageLoadTime: {
          interactive: `${perf.issues.loadTime.interactive}ms`,
          firstContentfulPaint: `${perf.issues.loadTime.fcp}ms`,
          description: 'Time to interactive (TTI) and First Contentful Paint (FCP)',
          recommendation: 'Optimize images, minify JS/CSS, and use browser caching to reduce load time.',
        },
        unoptimizedImages: perf.issues.unoptimizedImages.map(img => ({
          url: img.url,
          size: `${img.size} bytes`,
          recommendation: `Compress ${img.url} using tools like TinyPNG or ImageOptim.`,
        })),
        httpRequests: {
          count: perf.issues.httpRequests.reduce((acc, item) => acc + item.requestCount, 0),
          details: perf.issues.httpRequests.map(item => ({
            type: item.resourceType,
            count: item.requestCount,
          })),
          threshold: device === 'mobile' ? 30 : 50,
          excessive: perf.issues.httpRequests.reduce((acc, item) => acc + item.requestCount, 0) > (device === 'mobile' ? 30 : 50),
          recommendation: 'Combine files, remove unused scripts/styles, or use lazy loading to reduce requests.',
        },
        renderBlocking: perf.issues.renderBlocking.map(file => ({
          url: file,
          recommendation: `Defer or async load ${file} to prevent blocking the main thread.`,
        })),
        caching: {
          status: perf.issues.caching,
          recommendation: perf.issues.caching === 'No caching detected'
            ? 'Add caching headers (e.g., Cache-Control) to static assets.'
            : 'Caching is implemented well.',
        },
        ...(device === 'mobile' && {
          tapTargets: perf.issues.tapTargets.map(target => ({
            node: target.node?.snippet || 'Unknown element',
            size: target.size,
            recommendation: 'Increase tap target size for better mobile usability.',
          })),
        }),
      };
  
      // Send the formatted report
      res.json(report);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: `Failed to generate report: ${error.message}` });
    }
  });

module.exports = router; // Export the router