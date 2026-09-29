// Functional smoke test: search flow + console error check on the homepage.
// Usage: node smoke.mjs http://127.0.0.1:3000/
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:3000/';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
};

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
check('title renders', (await page.title()).includes('KVideo'));
check('search input visible', await page.locator('input').first().isVisible());
check('navbar brand visible', await page.locator('text=KVideo').first().isVisible());

await page.fill('input', '测试');
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
check('search updates URL', page.url().includes('q=%E6%B5%8B%E8%AF%95'));

await page.goto(BASE, { waitUntil: 'networkidle' });
check('no console errors', errors.length === 0);
if (errors.length) console.log(errors.slice(0, 5));

await browser.close();
process.exit(failed ? 1 : 0);
