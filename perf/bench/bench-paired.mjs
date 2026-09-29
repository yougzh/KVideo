// Paired A/B benchmark: alternates A,B,A,B... per the flash skill protocol.
// Usage: node bench-paired.mjs <urlA> <urlB> [runs] [warmup]
import { chromium } from 'playwright-core';

const URL_A = process.argv[2];
const URL_B = process.argv[3];
const RUNS = Number(process.argv[4]) || 10;
const WARMUP = Number(process.argv[5]) || 1;

const THROTTLE = {
  offline: false,
  latency: 20,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
};

const READY = `document.querySelector('input') && document.querySelector('input').offsetParent !== null`;

async function measureOnce(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(`
    window.__flash = { ready: null, longtask: 0 };
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
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__flash && window.__flash.ready !== null', null, { timeout: 90000 });
  const ready = await page.evaluate('window.__flash.ready');
  const longtask = await page.evaluate('window.__flash.longtask');
  const timing = await page.evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    return {
      ttfb: nav ? nav.responseStart : 0,
      dcl: nav ? nav.domContentLoadedEventEnd : 0,
      requests: res.length + 1,
      bytes: res.reduce((a, r) => a + (r.transferSize || 0), 0),
    };
  })()`);
  await context.close();
  return { ready, longtask, ...timing };
}

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});

for (let i = 0; i < WARMUP; i++) {
  await measureOnce(browser, URL_A);
  await measureOnce(browser, URL_B);
}

const samplesA = [];
const samplesB = [];
for (let i = 0; i < RUNS; i++) {
  const a = await measureOnce(browser, URL_A);
  const b = await measureOnce(browser, URL_B);
  samplesA.push(a);
  samplesB.push(b);
  console.log(`pair ${i + 1}: A=${a.ready.toFixed(0)}ms B=${b.ready.toFixed(0)}ms`);
}
await browser.close();

const summary = {
  urlA: URL_A,
  urlB: URL_B,
  runs: RUNS,
  A_ready: { p50: pct(samplesA.map(s => s.ready), 50), p75: pct(samplesA.map(s => s.ready), 75), p95: pct(samplesA.map(s => s.ready), 95) },
  B_ready: { p50: pct(samplesB.map(s => s.ready), 50), p75: pct(samplesB.map(s => s.ready), 75), p95: pct(samplesB.map(s => s.ready), 95) },
  A_bytes_p75: pct(samplesA.map(s => s.bytes), 75),
  B_bytes_p75: pct(samplesB.map(s => s.bytes), 75),
  A_requests_p75: pct(samplesA.map(s => s.requests), 75),
  B_requests_p75: pct(samplesB.map(s => s.requests), 75),
  reduction_p75: `${(((pct(samplesA.map(s => s.ready), 75) - pct(samplesB.map(s => s.ready), 75)) / pct(samplesA.map(s => s.ready), 75)) * 100).toFixed(1)}%`,
  samplesA,
  samplesB,
};
console.log(JSON.stringify(summary, null, 2));
