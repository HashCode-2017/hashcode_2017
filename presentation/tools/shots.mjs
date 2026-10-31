// Screenshot every build step (for checking the layout) and report console errors.
//   npm start   (terminal 1)
//   npm run shots -- [outDir] [light|dark] [fromScene] [toScene]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, BASE } from './browser.mjs';

const [out = 'shots', theme = 'light', from = '1', to = '99'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(`${BASE}?export&theme=${theme}#01.0`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const scenes = await page.evaluate(() => window.__router.scenes.map(s => ({ id: s.id, steps: s.steps })));
const list = [];
for (const [si, s] of scenes.entries()) {
  if (si + 1 < Number(from) || si + 1 > Number(to)) continue;
  for (let k = 0; k < s.steps; k++) {
    const before = errors.length;
    await page.evaluate(([i, j]) => window.__router.go(i, j, { instant: true }), [si, k]);
    await page.waitForTimeout(1300);
    const file = `${out}/${s.id}-${k}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
    list.push(file);
    if (errors.length > before) console.log(`${s.id}.${k}:`, errors.slice(before).join(' | '));
  }
}
await browser.close();
writeFileSync(`${out}/list.txt`, list.join('\n'));
console.log(`${list.length} screenshots, ${errors.length} errors`);
