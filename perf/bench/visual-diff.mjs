// Visual regression: screenshot the same pages on two servers at two widths
// and report the percentage of differing pixels.
// Usage: node visual-diff.mjs <urlA> <urlB> <outDir>
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const URL_A = process.argv[2];
const URL_B = process.argv[3];
const OUT = process.argv[4] || '/tmp/kvideo-visual';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});

async function shoot(url, name, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input', { timeout: 60000 });
  await page.waitForTimeout(1200);
  const path = `${OUT}/${name}-${viewport.name}.png`;
  await page.screenshot({ path });
  await context.close();
  return path;
}

async function diffRatio(pathA, pathB) {
  const a = await sharp(pathA).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(pathB).raw().toBuffer({ resolveWithObject: true });
  const w = Math.min(a.info.width, b.info.width);
  const h = Math.min(a.info.height, b.info.height);
  let diff = 0;
  const channels = a.info.channels;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.info.width + x) * channels;
      const ib = (y * b.info.width + x) * channels;
      let delta = 0;
      for (let c = 0; c < Math.min(channels, b.info.channels); c++) {
        delta += Math.abs(a.data[ia + c] - b.data[ib + c]);
      }
      if (delta / channels > 16) diff++;
    }
  }
  return diff / (w * h);
}

for (const viewport of VIEWPORTS) {
  const a = await shoot(URL_A, 'baseline', viewport);
  const b = await shoot(URL_B, 'optimized', viewport);
  const ratio = await diffRatio(a, b);
  console.log(`${viewport.name}: differing pixels ${(ratio * 100).toFixed(2)}% (A=${a} B=${b})`);
}

await browser.close();
