// utility/crawler.js
// ------------------
const puppeteer = require('puppeteer');
const { URL } = require('url');

/**
 * Crawl a site breadth-first, collecting all unique same-origin links.
 *
 * @param {string} startUrl   The entry point URL (e.g. 'https://example.com')
 * @param {number} maxPages   Maximum pages to crawl (default: 50)
 * @returns {Promise<string[]>} Array of unique URLs found
 */
async function getAllLinks(startUrl, maxPages = 50) {
  console.info(`🔍 Starting crawl at ${startUrl}, up to ${maxPages} pages`);

  let browser;
  const visited      = new Set();
  const toVisitQueue = [startUrl];
  const collected    = new Set();

  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const origin = new URL(startUrl).origin;

    while (toVisitQueue.length > 0 && visited.size < maxPages) {
      const url = toVisitQueue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      console.info(`➡️  Visiting (${visited.size}/${maxPages}): ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (navErr) {
        console.error(`❌ Navigation error for ${url}:`, navErr.message);
        continue;
      }

      let links = [];
      try {
        links = await page.$$eval('a[href]', anchors =>
          anchors.map(a => a.href)
        );
      } catch (evalErr) {
        console.error(`❌ Link extraction error on ${url}:`, evalErr.message);
        continue;
      }

      for (const link of links) {
        try {
          const normalized = new URL(link, url).href;
          if (!normalized.startsWith(origin)) {
            console.debug(`   ↪️  Skipping external link: ${normalized}`);
            continue;
          }

          if (!collected.has(normalized)) {
            collected.add(normalized);
            if (!visited.has(normalized) && (visited.size + toVisitQueue.length) < maxPages) {
              toVisitQueue.push(normalized);
              console.debug(`   ↪️  Queued for visit: ${normalized}`);
            }
          }
        } catch (urlErr) {
          console.warn(`⚠️  Invalid URL skipped: ${link}`);
        }
      }
    }

    console.info(`✅ Crawl complete. ${collected.size} unique links found.`);
    return Array.from(collected);

  } catch (err) {
    console.error('❌ Unexpected crawler error:', err);
    throw err;

  } finally {
    if (browser) {
      await browser.close();
      console.info('🔒 Browser closed');
    }
  }
}

module.exports = { getAllLinks };
