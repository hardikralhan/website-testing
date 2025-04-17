const puppeteer = require('puppeteer');

async function crawlWebsite(startUrl, maxPages = 50) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const visited = new Set();
  const toVisit = [startUrl];
  const results = [];

  while (toVisit.length > 0 && results.length < maxPages) {
    const url = toVisit.pop();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const links = await page.$$eval('a[href]', (anchors, startUrl) =>
        anchors.map(a => a.href).filter(href => href.startsWith(startUrl)),
        startUrl
      );
      toVisit.push(...links.filter(link => !visited.has(link)));
      results.push({ url, content: await page.content() });
      //   console.log(results)
      return results // to be deleted later
      
    } catch (err) {
      console.error(`Failed to crawl ${url}:`, err);
    }
  }

  await browser.close();
  return results;
}

module.exports = { crawlWebsite };