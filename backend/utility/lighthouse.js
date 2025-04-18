// const lighthouse = require('lighthouse').default;
const puppeteer = require('puppeteer');

async function runLighthouse(url, options = {}) {
  let browser;
  try {

    const lighthouse = await import('lighthouse');
    // Launch headless browser
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Default Lighthouse options
    const defaultOptions = {
      port: new URL(await browser.wsEndpoint()).port,
      output: 'json',
      onlyCategories: ['performance'],
      emulatedFormFactor: 'desktop', // Default to desktop
    };

    // Merge user options with defaults
    const lhOptions = { ...defaultOptions, ...options };

    // Run Lighthouse
    const runnerResult = await lighthouse.default(url, lhOptions);
    const audits = runnerResult.lhr.audits;

    // Extract performance metrics
    const performanceScore = runnerResult.lhr.categories.performance.score * 100;
    const issues = {
      loadTime: {
        interactive: audits['interactive']?.numericValue || 0,
        fcp: audits['first-contentful-paint']?.numericValue || 0, // Added FCP
      },
      unsizedImages: audits['unsized-images']?.details?.items.map(item => ({
        url: item.url,
        snippet: item.node.snippet,
      })) || [],
      httpRequests: audits['resource-summary']?.details?.items || [],
      renderBlocking: audits['render-blocking-resources']?.details?.items.map(item => item.url) || [],
      caching: audits['uses-long-cache-ttl']?.score === 0 ? 'No caching detected' : 'Caching present'
    };

    await browser.close();
    return { performanceScore, issues };
  } catch (error) {
    if (browser) await browser.close();
    throw new Error(`Lighthouse failed: ${error.message}`);
  }
}

module.exports = { runLighthouse };