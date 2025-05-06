// utility/lighthouse.js
// ---------------------
const puppeteer = require('puppeteer');

async function runLighthouse(url, options = {}) {
  let browser;
  try {
    console.info(`⏳ Starting Lighthouse run for ${url}`);
    // Dynamically import Lighthouse
    const { default: lighthouse } = await import('lighthouse');

    // Launch Chrome
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox','--disable-setuid-sandbox']
    });
    const port = new URL(browser.wsEndpoint()).port;

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

    // RAW network requests
    const networkItems = audits['network-requests']?.details?.items || [];

    // Group them by resourceType
    const requestsByType = networkItems.reduce((acc, req) => {
      const type = req.resourceType || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(req);
      return acc;
    }, {});

    // Build httpRequests from grouped data
    const httpRequests = {
      totalCount: networkItems.length,
      details: Object.entries(requestsByType).map(([rawType, items]) => {
        // Capitalize first letter
        const type = rawType.charAt(0).toUpperCase() + rawType.slice(1);

        // Count is simply the array length
        const count = items.length;

        // Sum of transfer sizes (in KB, two decimals)
        const transferSizeKB = (
          items.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024
        ).toFixed(2) + ' KB';

        // Up to 5 sample URLs
        const samples = items.map(r => ({
          url: r.url,
          sizeKB: (r.transferSize / 1024).toFixed(2) + ' KB'
        }));

        return { type, count, transferSizeKB, samples };
      })
    };

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
