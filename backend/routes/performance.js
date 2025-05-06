// routes/performance-report.js
// -----------------------------
const express = require('express');
const router = express.Router();
const { runLighthouse } = require('../utility/lighthouse');

// Helper to categorize score
function categorizePerformanceScore(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
}

router.post('/performance-report', async (req, res) => {
  const { url, device = 'desktop' } = req.body;
  console.info(`➡️  /performance-report called with url=${url}, device=${device}`);

  if (!url || typeof url !== 'string') {
    console.warn('⚠️  Missing or invalid URL');
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  try {
    // Run Lighthouse with appropriate form factor
    const options = { emulatedFormFactor: device === 'mobile' ? 'mobile' : 'desktop' };
    const perf = await runLighthouse(url, options);

    // Destructure enriched httpRequests
    const { totalCount, details } = perf.issues.httpRequests;

    const threshold = device === 'mobile' ? 30 : 50;
    const excessive = totalCount != null && totalCount > threshold;

    const report = {
      url,
      device,
      performanceScore: {
        score: perf.performanceScore,
        category: categorizePerformanceScore(perf.performanceScore),
        description: 'Higher scores indicate better performance.'
      },
      pageLoadTime: {
        interactive: `${(perf.issues.loadTime.interactive / 1000).toFixed(2)}s`,
        firstContentfulPaint: `${(perf.issues.loadTime.fcp / 1000).toFixed(2)}s`,
        description: 'TTI = Time to Interactive; FCP = First Contentful Paint.'
      },
      unsizedImages: perf.issues.unsizedImages.map(img => ({
        url: img.url,
        snippet: img.snippet,
        recommendation: 'Add width & height attributes to prevent layout shifts.'
      })),
      httpRequests: {
        count: totalCount,
        threshold,
        excessive,
        description: `The page makes ${totalCount} HTTP requests, which is ${excessive ? 'excessive' : 'within limits'} for ${device}.`,
        details: details.map(d => ({
          type: d.type,
          count: d.count,
          transferSize: d.transferSize,
          samples: d.samples
        }))
      },
      renderBlocking: {
        count: perf.issues.renderBlocking.length,
        resources: perf.issues.renderBlocking.map(url => ({
          url,
          recommendation: `Defer or async load this resource.`
        })),
        description: `${perf.issues.renderBlocking.length} render-blocking resources found.`
      },
      caching: {
        status: perf.issues.caching,
        description: perf.issues.caching === 'Caching present'
          ? 'Caching headers are present.'
          : 'No caching detected; consider adding Cache-Control headers.'
      }
    };

    console.info(`✅ Performance report generated for ${url}`);
    res.json(report);

  } catch (err) {
    console.error(`❌ /performance-report error for ${url}:`, err);
    res.status(500).json({ error: `Failed to generate report: ${err.message}` });
  }
});

module.exports = router;
