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
      const { resourceType: rawType, requestCount, transferSize } = item;
    
      // Handle the overall total count
      if (rawType === 'total') {
        httpRequests.totalCount = requestCount;
        continue;
      }
    
      // Capitalize for display
      const type = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    
      // Convert bytes → KB and append “ KB”
      const transferSizeKB = (transferSize / 1024).toFixed(2) + ' KB';
    
      // Grab up to 5 sample URLs, converting each transferSize
      const samples = (requestsByType[type] || [])
        .map(r => ({
          url: r.url,
          sizeKB: (r.transferSize / 1024).toFixed(2) + ' KB'
        }));
    
      httpRequests.details.push({
        type,
        count: samples.size(),
        transferSizeKB,    // e.g. "345.67 KB"
        samples            // each { url, sizeKB: "45.23 KB" }
      });
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
