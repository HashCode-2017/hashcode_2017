// Export every build step of every scene as one PDF page (16:9), as a slide-deck fallback.
//   npm start      (terminal 1: serves the site on :8080)
//   npm run pdf    (terminal 2)      Options: node tools/export-pdf.mjs [out.pdf] [light|dark]
import { writeFileSync } from 'node:fs';
import { launch, BASE } from './browser.mjs';
import { pdfFromJpegs } from './pdf.mjs';

const [out = 'docs/slides.pdf', theme = 'light'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(240000);
page.on('pageerror', e => console.warn('page error:', e.message));
await page.goto(`${BASE}?export&theme=${theme}#01.0`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

const scenes = await page.evaluate(() => window.__router.scenes.map(s => ({ id: s.id, steps: s.steps })));
const imgs = [];
for (const [si, s] of scenes.entries()) {
  for (let k = 0; k < s.steps; k++) {
    await page.evaluate(([i, j]) => window.__router.go(i, j, { instant: true }), [si, k]);
    await page.waitForTimeout(1500);
    imgs.push({ img: await page.screenshot({ type: 'jpeg', quality: 78 }), width: 1920, height: 1080, scale: 0.5 });
    process.stdout.write(`${s.id}.${k} `);
  }
}
await browser.close();
writeFileSync(out, pdfFromJpegs(imgs));
console.log(`\n${imgs.length} pages -> ${out}`);
