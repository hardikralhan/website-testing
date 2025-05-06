// utility/lighthouse.js
// ---------------------
const puppeteer = require('puppeteer');

async function runLighthouse(url, options = {}) {
  let browser;
  try {
    console.info(`⏳ Starting Lighthouse run for ${url}`);
    // Dynamic import of Lighthouse default export
    const { default: lighthouse } = await import('lighthouse');

    // Launch headless Chrome
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const wsEndpoint = browser.wsEndpoint();
    const port = new URL(wsEndpoint).port;

    // Lighthouse options
    const lhOptions = {
      port,
      output: 'json',
      onlyCategories: ['performance'],
      emulatedFormFactor: 'desktop',
      ...options
    };

    // Run Lighthouse
    const runnerResult = await lighthouse(url, lhOptions);
    const lhr = runnerResult.lhr;
    console.info(`✅ Lighthouse completed for ${url} (score: ${lhr.categories.performance.score * 100})`);

    const audits = lhr.audits;

    // Basic metrics
    const performanceScore = Math.round(lhr.categories.performance.score * 100);
    const loadTime = {
      interactive: audits['interactive']?.numericValue || 0,
      fcp: audits['first-contentful-paint']?.numericValue || 0
    };

    // Unsized images
    const unsizedImages = (audits['unsized-images']?.details?.items || []).map(i => ({
      url: i.url,
      snippet: i.node?.snippet || 'N/A'
    }));

    // Network requests: raw + summary
    const networkItems = audits['network-requests']?.details?.items || [];
    const summaryItems = audits['resource-summary']?.details?.items || [];

    // Group raw requests by type
    const requestsByType = networkItems.reduce((acc, req) => {
      const type = req.resourceType || 'other';
      acc[type] = acc[type] || [];
      acc[type].push(req);
      return acc;
    }, {});

    // Build enriched httpRequests object
    const httpRequests = { totalCount: null, details: [] };
    for (const item of summaryItems) {
      let { resourceType: type, requestCount, transferSize } = item;
      if (type === 'total') {
        httpRequests.totalCount = requestCount;
        continue;
      }
      const rawType = item.resourceType;       // e.g. "script"
      type = rawType.charAt(0).toUpperCase() + rawType.slice(1);  // "Script"

      const samples = (requestsByType[type] || [])
        .slice(0, 5)
        .map(r => ({
          url: r.url,
          size: r.transferSize
        }));
      httpRequests.details.push({ type, count: requestCount, transferSize, samples });
    }

    // Render-blocking resources
    const renderBlocking = (audits['render-blocking-resources']?.details?.items || [])
      .map(r => r.url);

    // Caching
    const caching = audits['uses-long-cache-ttl']?.score === 0
      ? 'No caching detected'
      : 'Caching present';

    return {
      performanceScore,
      issues: {
        loadTime,
        unsizedImages,
        httpRequests,
        renderBlocking,
        caching
      }
    };
  } catch (err) {
    console.error(`❌ Lighthouse error for ${url}:`, err);
    throw new Error(`Lighthouse failed: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.info(`🔒 Closed browser for ${url}`);
    }
  }
}

module.exports = { runLighthouse };
