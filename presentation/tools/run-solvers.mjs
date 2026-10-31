// Re-run the team's real solvers on the two small instances used on stage and save their output
// in models/output/ (scene 06 shows it; `npm test` checks the live solver against it).
//   npm run solvers        needs python3 (+ scipy for exact.py) and g++
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const repo = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'sv-'));
const bin = join(tmp, 'solver');
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: join(here, 'models'), encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); };

execFileSync('g++', ['-O2', '-std=c++17', '-o', bin, join(repo, 'solver.cpp')]);
for (const name of ['statement_example', 'trap_gadget']) {
  const out = join(tmp, name + '.out');
  const greedy = run('python3', [join(repo, 'solution.py'), name + '.in', out]);
  const parts = [
    `$ python solution.py ${name}.in ${name}.out`, greedy.slice(greedy.indexOf('=== STORED')).trimEnd(), '',
    `$ solver ${name}.in ${name}.out --repack`, run(bin, [name + '.in', out, '--repack']).trimEnd(), '',
    `$ solver ${name}.in ${name}.out --lns 3`, run(bin, [name + '.in', out, '--lns', '3']).split('\n').filter(l => !/^ {2}lns: \d+ iterations/.test(l)).join('\n').trimEnd(), '',
    `$ python exact.py ${name}.in ${name}.out --time-limit 30`, run('python3', [join(repo, 'exact.py'), name + '.in', out, '--time-limit', '30']).trimEnd(),
  ];
  writeFileSync(join(here, 'models/output', name + '.txt'), parts.join('\n') + '\n');
  console.log('saved models/output/' + name + '.txt');
}
