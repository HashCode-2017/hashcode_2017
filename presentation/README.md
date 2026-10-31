# Streaming Videos · final presentation (Group D)

An interactive, offline presentation of our Hash Code 2017 "Streaming Videos" solution, built as a website
instead of slides. 18 scenes, 65 clicks, timed to the professor's format:

| Part | Time | Speaker | Scenes |
|---|---|---|---|
| 1 · Algorithmic | 6 min | Daniel (1:00) → Kacem (5:00) | 01–06 · includes the execution example, with no code |
| 2 · Experimental evaluation | 6 min | Dhia (4:00) → Marouane (2:00) | 07–11 · protocol, results with charts, SWOT |
| 3 · Code | 3 min | Marouane | 12–13 · implementation choices of the final submission |
| 4 · Conclusion | 2 min | Daniel | 14–15 |
| 5 · Questions | 10 min | everyone | 16–18 · backup: playground, proofs, complexity |

To swap names or minutes, edit `src/content/team.js`. The title bar, speaker view, timers and team guide all follow.

## 1. Run it

You only need **Node.js 18 or newer**. Nothing to install with npm, no internet: fonts, Three.js and GSAP are in `vendor/` and `fonts/`.

```bash
cd presentation
npm start              # same as: node tools/serve.mjs
```

Open **http://localhost:8080** in **Chrome or Edge**, then press **F** for full screen.

- Another port: `node tools/serve.mjs 3000`
- Slow laptop: **http://localhost:8080/?lite** (no shadows, no antialiasing)
- Jump to a scene and step: `http://localhost:8080/#06.2` (scene 6, step 2)
- Don't double-click `index.html`: browsers block ES modules from `file://`.

**Online (GitHub Pages).** The site is fully static and uses relative paths, so it also works from this subfolder.
An owner of the organisation turns Pages on once (*Settings → Pages → Deploy from a branch → `main` / root*);
the talk is then at `https://hashcode-2017.github.io/hashcode_2017/presentation/`. Keep `npm start` as the offline backup.

## 2. Controls

| Key | Action |
|---|---|
| → · Space · PgDn | next step (clickers send PgDn) |
| ← · PgUp | previous step |
| **S** | speaker view: notes, suggested wording, next step, timer per speaker and for the whole talk. It can drive the main window. |
| B · . | black screen |
| P | projector theme (light, default) / dark theme |
| 1 … 9, or two digits quickly | jump to a scene (`1` `6` = playground) |
| R | restart the current scene |
| F | full screen |
| H · ? | help |

**Two screens:** open the main window on the projector and press **F**. Press **S** and drag the speaker window to the
laptop screen. Keys or clicks in either window move both, one step at a time.

Speaker notes are in `src/content/notes.js` (one array per click; lines starting with `SAY:` are suggested wording).

## 3. What runs live

- **Scene 04** runs our greedy on the statement's example, pop by pop, and computes every number on screen
  (queue, savings per MB, decisions, score 562,500 vs the statement's 462,500).
- **Scene 05**: the exact knapsack fills its table live; the slider changes the cache size.
- **Scene 06** solves the trap instance live (greedy → re-pack → LNS → exact), and shows the recorded output of our real `exact.py` on the same file.
- **Scene 08**: the heat map shows every team's score on hover.
- **Scene 12**: click any box for what that file does.
- **Scene 16** (backup) builds random small instances and runs every layer, with the true optimum.

The browser solver is `src/solver/engine.js`: the same steps as our submission, small enough to run in a browser.
It is checked against the real solvers:

```bash
npm test               # statement scores, greedy decisions, trap results vs the real solvers, talk numbers
npm run solvers        # re-run solution.py, solver.cpp (g++) and exact.py (needs scipy) on models/*.in
```

| File | What it is | Real solvers say |
|---|---|---|
| `models/statement_example.in` | the statement's example, verbatim | greedy 562,500 = proven optimum |
| `models/trap_gadget.in` | `generate.py --model trap --set copies=1 --set k=2 --set size=50 --set count=1000 --set margin=1 --set shuffle=no` | greedy 499,749 · re-pack 499,749 · LNS 998,499 · exact 998,499 (proven) |

## 4. Where every number comes from

All numbers live in two files. Scenes read them; they never type a number themselves.

| File | Content |
|---|---|
| `src/content/facts.js` | the statement, our measured results (README, SOLUTION.md, PIPELINE.md, scores_v1_v2_v3.md), the previous presentation |
| `src/content/tables.js` | exported from the class's shared sheet (tab *Resultats*, 31 Oct) and the professor's local-contest sheet (tabs *Score*, *1re soumission*) |

| From our documents and the class / contest sheets | Ours, for illustration (labelled on screen) |
|---|---|
| statement example, limits and scores · every score, rank and runtime · contest and class tables | the 3D view of the example network · the 10 MB knapsack example (A, B, C) · the trap instance (from our generator) · the playground's random instances |

Note: the class sheet's Google tab still shows our earlier entry (2,639,372). Scene 09 shows our final outputs
(2,655,217), re-scored with our scorer, and says so.

## 5. Documents (`docs/`)

| File | What | Regenerate (with `npm start` running) |
|---|---|---|
| `slides.pdf` | every click as a 16:9 page, the fallback if the laptop fails | `npm run pdf` |
| `speaker-view.pdf` | the speaker view for every click | `npm run speaker-pdf` |
| `team-guide-plain-words.pdf` | run of show, the big picture as a story, glossary, one page per click | `npm run guide` |

The exporters and `npm run shots` (screenshots of every click, with console errors) need Playwright:
`npm i -D playwright && npx playwright install chromium`. To use an installed Chrome instead: `CHROME_PATH=/path/to/chrome npm run pdf`.
Regenerate all three after any change to a scene or a note.

## 6. File map

```
index.html            import map: three, gsap -> vendor/
src/main.js           boot, fonts, 3D, keys, theme, speaker link
src/router.js         scenes x steps, URL hash #SS.K
src/speaker.js        speaker window (?view=speaker)
src/scenes/sNN.js     one file per scene; index.js gives the order
src/engines/          net3d.js (3D network + pipeline floors), netsvg.js (2D network), charts.js, dom.js
src/solver/engine.js  the live solver
src/content/          facts.js, tables.js, notes.js, team.js, guide.js
models/               the two stage instances + recorded real solver output
tools/                serve, exporters, screenshots, run-solvers
tests/                npm test
docs/                 generated PDFs
```

## 7. On the day

Open the site (online and local), reload both windows right before starting so the timers reset, keep the PDFs on a USB stick.

## Licences

Fonts: Barlow and Barlow Condensed, IBM Plex Mono, JetBrains Mono (SIL Open Font License), Latin Modern Roman (GUST Font License); licence files in `fonts/`.
Three.js (MIT, `vendor/three/LICENSE`). GSAP (GreenSock standard licence, https://gsap.com/standard-license).
