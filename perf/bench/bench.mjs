import { chromium } from 'playwright-core';

const URL = process.argv[2] || 'http://127.0.0.1:3000/';
const RUNS = Number(process.argv[3]) || 10;
const PROFILE = process.argv[4] || 'fast4g';

// Fast 4G: 20ms RTT, 4Mbps down, 3Mbps up
const THROTTLE = {
  offline: false,
  latency: 20,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
};

const READY = `document.querySelector('input') && document.querySelector('input').offsetParent !== null`;

async function measureOnce(browser) {
  const context = await browser.newContext();
  await context.route('**/*', async (route) => {
    await new Promise((r) => setTimeout(r, THROTTLE.latency / 2));
    await route.continue();
  });
  const page = await context.newPage();
  await page.addInitScript(`
    window.__flash = { ready: null, lcp: null, longtask: 0, bytes: 0, requests: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__flash.lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__flash.longtask += e.duration; })
      .observe({ type: 'longtask', buffered: true });
    const tick = () => {
      if (window.__flash.ready === null && (${READY})) window.__flash.ready = performance.now();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  `);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', THROTTLE);
  const start = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // wait for ready
  await page.waitForFunction('window.__flash && window.__flash.ready !== null', null, { timeout: 90000 });
  const ready = await page.evaluate('window.__flash.ready');
  const lcp = await page.evaluate('window.__flash.lcp');
  const longtask = await page.evaluate('window.__flash.longtask');
  const timing = await page.evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    return {
      ttfb: nav ? nav.responseStart : 0,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
      requests: res.length + 1,
      transferBytes: res.reduce((a, r) => a + (r.transferSize || 0), 0),
    };
  })()`);
  await context.close();
  return { ready, lcp, longtask, ...timing, wall: Date.now() - start };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});
const samples = [];
for (let i = 0; i < RUNS; i++) {
  const s = await measureOnce(browser);
  samples.push(s);
  console.error(`run ${i + 1}: ready=${s.ready.toFixed(0)}ms lcp=${s.lcp ? s.lcp.toFixed(0) : '-'}ms req=${s.requests} bytes=${s.transferBytes}`);
}
await browser.close();

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
const readies = samples.map((s) => s.ready);
const summary = {
  url: URL,
  runs: RUNS,
  profile: PROFILE,
  ready_p50: pct(readies, 50),
  ready_p75: pct(readies, 75),
  ready_p95: pct(readies, 95),
  lcp_p75: pct(samples.map((s) => s.lcp || 0), 75),
  longtask_p75: pct(samples.map((s) => s.longtask), 75),
  requests_p75: pct(samples.map((s) => s.requests), 75),
  bytes_p75: pct(samples.map((s) => s.transferBytes), 75),
  samples,
};
console.log(JSON.stringify(summary, null, 2));
