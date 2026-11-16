// Checks the scoring engine and chain detector against the examples in docs/formula-score-00.md.
// Run: bun tools/test-scoring.js
const assert = require('assert');
const Scoring = require('../scoring.js');
const Chains = require('../chains.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };
const place = (id, cell, digit, t) => ({ id, cell, digit, row: (cell / 9) | 0, col: cell % 9, block: (((cell / 27) | 0) * 3) + (((cell % 9) / 3) | 0), t });

/** Feeds placements through detector + scoring like the game does; returns chain awards. */
function play(s, cs, list, windowMs) {
  const out = [];
  for (const p of list) {
    Scoring.apply(s, { type: 'NUMBER_PLACED', id: p.id, cell: p.cell });
    const r = Chains.observe(cs, p, { windowMs, min: 3 });
    out.push(r ? Scoring.apply(s, { type: 'CHAIN_EXTENDED', ...r }) : []);
  }
  return out;
}

test('§11.5 chain bonus example: Hard, 4 block placements of 100 → 640', () => {
  assert.strictEqual(Scoring.chainValue(400, 4, 'block', 4), 640);
});

test('§8.2 row + block placement pays 300 + 500 + 200 double clear', () => {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  Scoring.apply(s, { type: 'NUMBER_PLACED', id: 1, cell: 0 });
  const a = Scoring.apply(s, { type: 'REGION_COMPLETED', regions: ['r0', 'b0'] });
  assert.deepStrictEqual(a.map((x) => x.pts), [300, 500, 200]);
});

test('§8.2 triple clear pays +400', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const a = Scoring.apply(s, { type: 'REGION_COMPLETED', regions: ['r0', 'c0', 'b0'] });
  assert.deepStrictEqual(a.map((x) => x.pts), [300, 300, 500, 400]);
});

test('§6.6 cells and regions are credited once per attempt', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  Scoring.apply(s, { type: 'NUMBER_PLACED', id: 1, cell: 5 });
  assert.strictEqual(Scoring.apply(s, { type: 'NUMBER_PLACED', id: 2, cell: 5 }).length, 0);
  Scoring.apply(s, { type: 'REGION_COMPLETED', regions: ['r0'] });
  const again = Scoring.apply(s, { type: 'REGION_COMPLETED', regions: ['r0', 'c5'] });
  assert.deepStrictEqual(again.map((x) => x.pts), [300]); // only the new column, no double clear
  assert.strictEqual(s.placementPts, 50);
});

test('§14 time bonus: max at half par, zero at twice par, linear between', () => {
  assert.strictEqual(Scoring.timeBonus(4, 540), 5000);
  assert.strictEqual(Scoring.timeBonus(4, 100), 5000);
  assert.strictEqual(Scoring.timeBonus(4, 2160), 0);
  assert.strictEqual(Scoring.timeBonus(4, 1080), 3333);
});

test('§10.1 Hard block chain within 13 s pays incrementally (3 → 4 placements)', () => {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  const cs = Chains.create();
  // Cells 0, 1, 2 share row 0 and block 0 → Time + Line + Block = Hybrid. Cell 9 is block 0 only.
  const awards = play(s, cs, [place(1, 0, 1, 0), place(2, 1, 2, 4000), place(3, 2, 3, 9000), place(4, 9, 4, 13000)], 15000);
  assert.deepStrictEqual(awards[0], []);
  assert.deepStrictEqual(awards[1], []);
  // 3 × 50 = 150 × (1.3 × 1.2 − 1) × 2.0 = 168, Hybrid +20% = 33 → 201
  assert.strictEqual(awards[2][0].pts, 201);
  // 4 × 50 = 200 × (1.5 × 1.2 − 1) × 2.0 = 320, no longer Hybrid → pays 320 − 201
  assert.strictEqual(awards[3][0].pts, 119);
  assert.strictEqual(s.chainEarned, 320);
  assert.strictEqual(s.chain.length, 4);
});

test('§10.2 sliding window: expired placements drop out, no double payout', () => {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  const cs = Chains.create();
  const awards = play(s, cs, [
    place(1, 0, 1, 0), place(2, 1, 2, 4000), place(3, 2, 3, 9000), place(4, 9, 4, 13000),
    place(5, 10, 5, 20000), // t=0 and t=4000 expire; 9000..20000 still a 3-chain in block 0
  ], 15000);
  assert.deepStrictEqual(awards[4], []); // a shorter overlapping sequence earns nothing new
  assert.strictEqual(s.chainEarned, 320);
});

test('§10.3 a mistake ends the run; the next qualifying chain is a new run', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  play(s, cs, [place(1, 0, 1, 0), place(2, 40, 2, 1000), place(3, 80, 3, 2000)], 30000);
  const first = s.chainEarned;
  assert.ok(first > 0);
  Scoring.apply(s, { type: 'MISTAKE' });
  Chains.reset(cs);
  play(s, cs, [place(4, 3, 4, 3000), place(5, 43, 5, 4000)], 30000);
  assert.strictEqual(s.chainEarned, first); // two placements after the reset don't qualify
  play(s, cs, [place(6, 70, 6, 5000)], 30000);
  assert.strictEqual(s.chainEarned, first * 2);
  assert.strictEqual(s.stats.chains, 2);
});

test('§9 number chain: same digit 3 times beats a plain time chain', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  const awards = play(s, cs, [place(1, 0, 7, 0), place(2, 40, 7, 1000), place(3, 80, 7, 2000)], 30000);
  assert.match(awards[2][0].label, /^Number Chain/);
  assert.strictEqual(awards[2][0].pts, Scoring.chainValue(150, 3, 'number', 1));
});

test('§5.4 Zen: no chain bonus, score ×0.5', () => {
  const s = Scoring.create({ tier: 1, mode: 'zen' });
  const cs = Chains.create();
  play(s, cs, [place(1, 0, 1, 0), place(2, 1, 2, 100), place(3, 2, 3, 200)], 30000);
  assert.strictEqual(s.chainEarned, 0);
  assert.strictEqual(Scoring.live(s), 75);
});

test('§12.3 chain bonus capped at 35% of raw score', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  s.chainEarned = 1e6;
  Scoring.apply(s, { type: 'PUZZLE_COMPLETED', elapsed: 10000 }); // no time bonus
  const f = s.final;
  assert.strictEqual(f.completion, 1000);
  assert.strictEqual(f.chain, Math.floor((1000 * 35) / 65));
  assert.ok(f.chain / f.raw <= 0.35);
  assert.strictEqual(f.chainEarned, 1e6);
});

test('§7.2 / §15 penalties: 2 mistakes, 1 hint, assist → ×0.8 × 0.8 × 0.8', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  for (const type of ['MISTAKE', 'MISTAKE', 'HINT_USED', 'ASSIST_ENABLED', 'ASSIST_ENABLED']) Scoring.apply(s, { type });
  Scoring.apply(s, { type: 'PUZZLE_COMPLETED', elapsed: 10000 });
  assert.strictEqual(s.final.total, Math.floor(1000 * 0.512));
});

test('§24.4 replay of the event log reproduces the score', () => {
  const init = { tier: 3, mode: 'classic' };
  const s = Scoring.create(init);
  const cs = Chains.create();
  const log = [];
  const rec = (ev) => { log.push(ev); Scoring.apply(s, ev); };
  [place(1, 0, 1, 0), place(2, 1, 2, 2000), place(3, 2, 3, 3000)].forEach((p) => {
    rec({ type: 'NUMBER_PLACED', id: p.id, cell: p.cell });
    const r = Chains.observe(cs, p, { windowMs: 20000, min: 3 });
    if (r) rec({ type: 'CHAIN_EXTENDED', ...r });
  });
  rec({ type: 'REGION_COMPLETED', regions: ['r0'] });
  rec({ type: 'PUZZLE_COMPLETED', elapsed: 500 });
  assert.deepStrictEqual(Scoring.replay(init, log).final, s.final);
});

console.log(`\n${passed} passed`);
