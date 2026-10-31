// npm test — checks the live solver against the statement and against the real solvers' recorded output,
// and checks that the numbers shown in the talk add up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../src/solver/engine.js';
import { STATEMENT, PIPELINE, GOOGLE, VERSIONS } from '../src/content/facts.js';
import { CONTEST, SHEET } from '../src/content/tables.js';

const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const recorded = (name, label) => {
  const txt = file(`models/output/${name}.txt`);
  const pick = re => Number((txt.match(re) || [])[1]?.replace(/,/g, ''));
  return { greedy: pick(/score: ([\d,]+)/), repack: pick(/re-pack: (\d+)/), lns: pick(/lns \+ re-pack: (\d+)/), exact: pick(/upper bound ([\d,]+)/) }[label];
};

test('statement example: the file in models/ is the statement verbatim', () => {
  assert.equal(file('models/statement_example.in').trim(), STATEMENT.exampleIn.trim());
});

test("statement example: the statement's own submission scores 462,500", () => {
  const inst = S.parse(STATEMENT.exampleIn);
  const placed = STATEMENT.exampleSubmission.map(a => new Set(a));
  assert.equal(S.score(inst, placed), STATEMENT.exampleSubmissionScore);
});

test('statement example: greedy pops, decisions and final score (562,500, same as solution.py)', () => {
  const inst = S.parse(STATEMENT.exampleIn);
  const g = S.greedy(inst);
  assert.deepEqual(g.trace.queue.map(q => [q.c, q.v, q.key]), [[0, 3, 45000], [2, 3, 40000], [1, 3, 35000], [0, 1, 18000], [2, 1, 16000], [1, 1, 14000]]);
  assert.deepEqual(g.trace.pops.map(p => p.decision), ['place', 'drop', 'drop', 'place', 'drop', 'drop']);
  assert.equal(g.score, 562500);
  assert.equal(g.score, recorded('statement_example', 'greedy'));
  assert.equal(S.optimum(inst).score, recorded('statement_example', 'exact'));
});

test('trap gadget: greedy, re-pack, LNS and exact match the real solvers', () => {
  const inst = S.parse(file('models/trap_gadget.in'));
  const g = S.greedy(inst);
  assert.equal(g.score, recorded('trap_gadget', 'greedy'));
  const p = S.clonePlacement(g.placed);
  assert.equal(S.repack(inst, p).score, recorded('trap_gadget', 'repack'));
  assert.equal(S.lns(inst, p, { steps: 60 }).score, recorded('trap_gadget', 'lns'));
  assert.equal(S.optimum(inst).score, recorded('trap_gadget', 'exact'));
});

test('ratio trap: ratio fill 600, exact knapsack 900', () => {
  const items = [{ v: 'A', w: 6, val: 600 }, { v: 'B', w: 5, val: 450 }, { v: 'C', w: 5, val: 450 }];
  assert.equal(S.ratioFill(items, 10).best, 600);
  assert.equal(S.knapsack(items, 10).best, 900);
});

test('no step ever lowers the score, and every result fits (random small instances)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const inst = S.randomInstance({ seed, V: 7, E: 3, C: 2, X: 80 });
    const g = S.greedy(inst); const p = S.clonePlacement(g.placed);
    const r = S.repack(inst, p).score; const l = S.lns(inst, p, { steps: 40, seed }).score;
    const o = S.optimum(inst);
    assert.ok(S.valid(inst, p));
    assert.ok(r >= g.score && l >= r, `seed ${seed}`);
    if (o) assert.ok(o.score >= l, `optimum below LNS on seed ${seed}`);
  }
});

test('talk numbers add up', () => {
  const sum = a => a.reduce((s, x) => s + x, 0);
  assert.equal(sum(GOOGLE.rows.map(r => r.v3)), GOOGLE.v3Total);
  assert.equal(sum(GOOGLE.rows.map(r => r.final)), GOOGLE.finalTotal);
  assert.equal(PIPELINE.classAfter - PIPELINE.classBefore, PIPELINE.classGain);
  assert.equal(SHEET.classTotals.D, PIPELINE.classAfter);
  assert.equal(SHEET.classRank.D, PIPELINE.rankAfter);
  assert.equal(sum(CONTEST.scores.D), 22875014);
  assert.equal(sum(CONTEST.vbs), 22878134);
  assert.ok(VERSIONS.rows[2].total < VERSIONS.vbs);
});
