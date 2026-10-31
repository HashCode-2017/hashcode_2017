// The plain-words team guide: one A4 page per build step (screenshot + what you see + in plain words).
//   npm start  (terminal 1)   npm run guide  (terminal 2)
import { writeFileSync, readFileSync } from 'node:fs';
import { launch, BASE } from './browser.mjs';
import { NOTES } from '../src/content/notes.js';
import { SLOTS, SECTIONS } from '../src/content/team.js';
import { TALK } from '../src/content/facts.js';
import { STORY, GLOSSARY, WORDS } from '../src/content/guide.js';

const [out = 'docs/team-guide-plain-words.pdf'] = process.argv.slice(2);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 / 3 }); // 1280 px pictures are plenty on A4
page.setDefaultTimeout(240000);
await page.goto(`${BASE}?export#01.0`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const scenes = await page.evaluate(() => window.__router.scenes.map(s => ({ id: s.id, steps: s.steps, title: s.title, part: s.part, minutes: s.minutes })));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gloss = Object.fromEntries(GLOSSARY);
const pages = [];
let n = 0;
for (const [si, s] of scenes.entries()) {
  for (let k = 0; k < s.steps; k++) {
    await page.evaluate(([i, j]) => window.__router.go(i, j, { instant: true }), [si, k]);
    await page.waitForTimeout(1300);
    const img = (await page.screenshot({ type: 'jpeg', quality: 72 })).toString('base64');
    const notes = NOTES[s.id]?.[k] ?? [];
    const see = notes.filter(l => !l.startsWith('SAY:') && !l.startsWith('HANDOVER') && !l.startsWith('If asked'));
    const say = notes.filter(l => l.startsWith('SAY:')).map(l => l.slice(4).trim());
    const extra = notes.filter(l => l.startsWith('HANDOVER') || l.startsWith('If asked'));
    const slot = SLOTS[s.part];
    const word = k === 0 && WORDS[s.id] ? `<div class="word"><b>Word to know · ${esc(WORDS[s.id])}</b> ${esc(gloss[WORDS[s.id]] || '')}</div>` : '';
    pages.push(`<section class="page step"><header><span class="no">${String(si + 1).padStart(2, '0')}.${k + 1}</span><span class="t">${esc(s.title)}</span><span class="who">${SECTIONS[slot.section].name} · ${esc(slot.name)}</span></header>
      <img src="data:image/jpeg;base64,${img}">
      <h4>What you see</h4><p>${see.map(esc).join(' ') || '—'}</p>
      ${say.length ? `<h4>In plain words</h4>${say.map(t => `<p class="say">${esc(t)}</p>`).join('')}` : ''}
      ${extra.length ? `<p class="extra">${extra.map(esc).join(' · ')}</p>` : ''}
      ${word}<footer>${esc(TALK.cite)} · page ${n + 6}</footer></section>`);
    n++;
    process.stdout.write(`${s.id}.${k} `);
  }
}

// run of show
const rows = []; let last = null;
for (const [si, s] of scenes.entries()) {
  const slot = SLOTS[s.part];
  rows.push(`<tr${slot.name !== last ? ' class="new"' : ''}><td>${String(si + 1).padStart(2, '0')}</td><td>${esc(s.title)}</td><td>${SECTIONS[slot.section].short}</td><td>${esc(slot.name)}</td><td>${s.minutes ? s.minutes + ' min' : 'backup'}</td><td>${s.steps}</td></tr>`);
  last = slot.name;
}
const fonts = readFileSync(new URL('../fonts/fonts.css', import.meta.url), 'utf8').replace(/url\('([^']+)'\)/g, (m, f) => `url('${BASE}fonts/${f}')`);
const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(TALK.title)} · Team guide</title><style>${fonts}
@page { size: A4; margin: 0; }
body { margin: 0; font-family: 'Barlow', sans-serif; color: #17191d; }
.page { width: 210mm; height: 297mm; padding: 16mm 16mm 14mm; box-sizing: border-box; position: relative; page-break-after: always; overflow: hidden; }
h1 { font-family: 'Barlow Condensed'; font-weight: 700; font-size: 54pt; text-transform: uppercase; line-height: .9; margin: 30mm 0 6mm; }
h2 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 22pt; text-transform: uppercase; margin: 0 0 4mm; border-bottom: 2px solid #c4581c; padding-bottom: 2mm; }
h4 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 13pt; text-transform: uppercase; letter-spacing: .08em; color: #c4581c; margin: 5mm 0 1mm; }
p { font-size: 12.5pt; line-height: 1.5; margin: 0 0 2.5mm; }
.say { border-left: 3px solid #a3771f; padding-left: 3mm; }
.extra { color: #7b8088; font-size: 10pt; }
.word { margin-top: 4mm; background: #efe2c3; padding: 3mm 4mm; font-size: 10.5pt; }
header { display: flex; gap: 4mm; align-items: baseline; border-bottom: 1px solid #c9c4b9; padding-bottom: 2mm; margin-bottom: 4mm; }
header .no { background: #c4581c; color: #fff; font-family: 'Barlow Condensed'; font-weight: 700; padding: 1mm 2mm; }
header .t { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 16pt; text-transform: uppercase; }
header .who { margin-left: auto; color: #7b8088; font-size: 10pt; text-transform: uppercase; letter-spacing: .06em; }
img { width: 100%; border: 1px solid #c9c4b9; }
footer { position: absolute; left: 16mm; right: 16mm; bottom: 8mm; font-size: 8.5pt; color: #7b8088; border-top: 1px solid #dedad0; padding-top: 2mm; }
table { border-collapse: collapse; width: 100%; font-size: 10.5pt; } td, th { padding: 1.6mm 2mm; border-bottom: 1px solid #dedad0; text-align: left; } th { font-family: 'Barlow Condensed'; text-transform: uppercase; letter-spacing: .06em; color: #7b8088; }
tr.new td { border-top: 2px solid #17191d; }
dl { font-size: 10.5pt; line-height: 1.4; margin: 0; } dt { font-weight: 600; margin-top: 2mm; } dd { margin: 0 0 0 0; color: #474c53; }
.kbd { font-family: 'IBM Plex Mono'; border: 1px solid #c9c4b9; padding: 0 1.5mm; }
</style></head><body>
<section class="page"><div style="font-family:'Barlow Condensed';letter-spacing:.14em;text-transform:uppercase;color:#7b8088">${esc(TALK.contest)}</div>
<h1>${esc(TALK.title)}<br><span style="font-size:24pt;color:#c4581c">Team guide, in plain words</span></h1>
<p style="font-size:14pt">${esc(TALK.group)} · ${TALK.members.join(' · ')}</p><p>${esc(TALK.course)}</p>
<h4 style="margin-top:14mm">How to read this guide</h4>
<p>One page per click of the talk. Each page shows the screen, what appears on it, and what to say in simple words. Lines in a bar are suggested wording, not a script to learn by heart. Numbers on screen always come from our files, never typed by hand.</p>
<h4>On the day</h4><p>Open the site, press <span class="kbd">F</span> for full screen and <span class="kbd">S</span> for the speaker view (notes, timers, next step). Clicker or <span class="kbd">→</span> moves one step. <span class="kbd">B</span> blacks the screen. If the laptop fails, the slides PDF has every step.</p>
<footer>${esc(TALK.cite)} · page 1</footer></section>
<section class="page"><h2>Run of show</h2><p>17 minutes of talk in the professor's four parts, then 10 minutes of questions.</p>
<table><tr><th>#</th><th>Scene</th><th>Part</th><th>Speaker</th><th>Time</th><th>Clicks</th></tr>${rows.join('')}</table>
<footer>${esc(TALK.cite)} · page 2</footer></section>
<section class="page"><h2>The big picture, as a story</h2>${STORY.map(p => `<p style="font-size:12.5pt">${esc(p)}</p>`).join('')}
<footer>${esc(TALK.cite)} · page 3</footer></section>
<section class="page"><h2>Words we use (1/2)</h2><dl>${GLOSSARY.slice(0, 13).map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl><footer>${esc(TALK.cite)} · page 4</footer></section>
<section class="page"><h2>Words we use (2/2)</h2><dl>${GLOSSARY.slice(13).map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl><footer>${esc(TALK.cite)} · page 5</footer></section>
${pages.join('\n')}</body></html>`;

const doc = await browser.newPage();
await doc.goto(BASE + 'fonts/fonts.css'); // same origin as the fonts
await doc.setContent(html, { waitUntil: 'networkidle' });
await doc.evaluate(() => document.fonts.ready);
// no page may overflow onto its footer
const over = await doc.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
  const foot = p.querySelector('footer')?.getBoundingClientRect().top ?? p.getBoundingClientRect().bottom;
  const last = [...p.children].filter(c => c.tagName !== 'FOOTER').reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom), 0);
  return last > foot - 2 ? i + 1 : null;
}).filter(Boolean));
if (over.length) console.warn('\nOVERFLOW on pages:', over.join(', '));
writeFileSync(out, await doc.pdf({ format: 'A4', printBackground: true }));
await browser.close();
console.log(`\n${pages.length + 5} pages -> ${out}`);
