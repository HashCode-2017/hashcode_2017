// Export the speaker view (key S) for every build step, one PDF page per step.
//   npm start  (terminal 1)   npm run speaker-pdf  (terminal 2)
// The clock is frozen while exporting, so the timers read 0:00.
import { writeFileSync } from 'node:fs';
import { launch, BASE } from './browser.mjs';
import { pdfFromJpegs } from './pdf.mjs';

const [out = 'docs/speaker-view.pdf'] = process.argv.slice(2);
const browser = await launch(['--disable-popup-blocking']);
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => { const t = 1793000000000; Date.now = () => t; });
const main = await ctx.newPage();
main.setDefaultTimeout(240000);
main.on('pageerror', e => console.warn('main:', e.message));
await main.goto(`${BASE}?export#01.0`);
await main.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

const [sp] = await Promise.all([ctx.waitForEvent('page'), main.keyboard.press('s')]);
await sp.setViewportSize({ width: 1280, height: 760 });
sp.on('pageerror', e => console.warn('speaker:', e.message));
await sp.waitForLoadState();

const scenes = await main.evaluate(() => window.__router.scenes.map(s => ({ id: s.id, steps: s.steps, title: s.title })));
const shots = [];
for (const [si, s] of scenes.entries()) {
  for (let k = 0; k < s.steps; k++) {
    await main.evaluate(([i, j]) => window.__router.go(i, j, { instant: true }), [si, k]);
    const want = `Step ${k + 1} of ${s.steps}`;
    await sp.waitForFunction(([w, t]) => document.body.textContent.includes(w) && document.body.textContent.includes(t), [want, s.title], { timeout: 30000 });
    await sp.waitForTimeout(150);
    const img = await sp.screenshot({ type: 'jpeg', quality: 90, fullPage: true });
    const { width, height } = await sp.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    shots.push({ img, width, height, scale: 0.75 });
    process.stdout.write(`${s.id}.${k} `);
  }
}
await browser.close();
writeFileSync(out, pdfFromJpegs(shots));
console.log(`\n${shots.length} pages -> ${out}`);
