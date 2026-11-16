// Checks the scoring engine and chain detector against the examples in docs/formula-score-00.md.
// Run: bun run test
import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as Chains from './chains.ts';
import type { ChainState, Placement } from './chains.ts';
import type { Award, GameEvent, ModeId } from './events.ts';
import * as Scoring from './scoring.ts';
import type { ScoreState } from './scoring.ts';

const place = (id: number, cell: number, digit: number, t: number): Placement => ({ id, cell, digit, row: (cell / 9) | 0, col: cell % 9, block: (((cell / 27) | 0) * 3) + (((cell % 9) / 3) | 0), t });

/** Feeds placements through detector + scoring like the game does; returns chain awards. */
function play(s: ScoreState, cs: ChainState, list: Placement[], windowMs: number): Award[][] {
  const out: Award[][] = [];
  for (const p of list) {
    Scoring.apply(s, { type: 'NUMBER_PLACED', id: p.id, cell: p.cell, digit: p.digit });
    const { closed, chain } = Chains.observe(cs, p, { windowMs, min: 3 });
    if (closed) Scoring.apply(s, { type: 'CHAIN_CLOSED', run: closed.run, reason: 'expired' });
    out.push(chain ? Scoring.apply(s, { type: 'CHAIN_EXTENDED', ...chain }) : []);
  }
  return out;
}
const close = (s: ScoreState, cs: ChainState) => { const c = Chains.reset(cs); if (c) Scoring.apply(s, { type: 'CHAIN_CLOSED', run: c.run, reason: 'end' }); };

test('§11.5 chain bonus example: Hard, 4 block placements of 100 → 640', () => {
  assert.strictEqual(Scoring.chainValue(400, 4, 'block', 4), 640);
});

test('§8.2 row + block placement pays 300 + 500 + 200 double clear', () => {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  Scoring.apply(s, { type: 'NUMBER_PLACED', id: 1, cell: 0, digit: 1 });
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
  Scoring.apply(s, { type: 'NUMBER_PLACED', id: 1, cell: 5, digit: 1 });
  assert.strictEqual(Scoring.apply(s, { type: 'NUMBER_PLACED', id: 2, cell: 5, digit: 1 }).length, 0);
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
  assert.strictEqual(s.chain?.length, 4);
});

test('an open chain closes when its window passes; its placements are not paid again', () => {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  const cs = Chains.create();
  const awards = play(s, cs, [
    place(1, 0, 1, 0), place(2, 1, 2, 4000), place(3, 2, 3, 9000), place(4, 9, 4, 13000),
    place(5, 10, 5, 20000), // past 0 + 15 s: chain 1 closes, this placement starts forming chain 2
  ], 15000);
  assert.deepStrictEqual(awards[4], []);
  assert.strictEqual(s.chainEarned, 320);
  assert.strictEqual(s.stats.chains, 1);
  assert.strictEqual(s.stats.longest, 4);
});

test('lifecycle example: steady Beginner play earns chain A, then a separate chain B', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  // Cells in different rows, columns, blocks and digits: plain Time chains.
  const awards = play(s, cs, [
    place(1, 0, 3, 0), place(2, 13, 8, 5000), place(3, 26, 1, 9000), place(4, 30, 7, 15000),
    place(5, 52, 2, 31000), place(6, 57, 4, 35000), place(7, 79, 6, 40000),
  ], 30000);
  const a = Scoring.chainValue(200, 4, 'time', 1); // chain A: 4 placements
  const b = Scoring.chainValue(150, 3, 'time', 1); // chain B: 3 placements
  assert.strictEqual(awards[6][0].pts, b);
  assert.strictEqual(s.chainEarned, a + b);
  assert.strictEqual(cs.run, 2);
  close(s, cs);
  assert.strictEqual(s.stats.chains, 2);
});

test('while forming, expired placements slide out so they never block a chain', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  play(s, cs, [place(1, 0, 1, 0), place(2, 40, 2, 20000), place(3, 80, 3, 35000), place(4, 4, 4, 45000)], 30000);
  // t=0 expired before a chain formed; 20 s, 35 s, 45 s fit in 30 s and form one.
  assert.strictEqual(cs.run, 1);
  assert.strictEqual(s.chainEarned, Scoring.chainValue(150, 3, 'time', 1));
});

test('Hybrid is Time + Block + Line only', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  const awards = play(s, cs, [place(1, 0, 1, 0), place(2, 1, 2, 100), place(3, 2, 3, 200)], 30000); // row 0, block 0
  assert.match(awards[2][0].label, /^Hybrid Block Chain/);
  close(s, cs);
  assert.deepStrictEqual(s.stats.byType, { time: 1, number: 0, block: 1, line: 1, hybrid: 1 });
});

test('achievement counters move once per finished chain, not per extension', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  play(s, cs, [0, 1, 2, 9, 10, 11, 18, 19].map((c, k) => place(k + 1, c, k + 1, k * 1000)), 30000); // 8 in block 0
  assert.strictEqual(s.stats.chains, 0); // still open
  close(s, cs);
  assert.strictEqual(s.stats.chains, 1);
  assert.strictEqual(s.stats.byType.block, 1);
  assert.strictEqual(s.stats.longest, 8);
});

test('§10.3 a mistake ends the run; the next qualifying chain is a new run', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  const cs = Chains.create();
  play(s, cs, [place(1, 0, 1, 0), place(2, 40, 2, 1000), place(3, 80, 3, 2000)], 30000);
  const first = s.chainEarned;
  assert.ok(first > 0);
  close(s, cs);
  Scoring.apply(s, { type: 'MISTAKE' });
  play(s, cs, [place(4, 3, 4, 3000), place(5, 43, 5, 4000)], 30000);
  assert.strictEqual(s.chainEarned, first); // two placements after the reset don't qualify
  play(s, cs, [place(6, 70, 6, 5000)], 30000);
  assert.strictEqual(s.chainEarned, first * 2);
  assert.strictEqual(s.stats.chains, 1); // the second chain is still open
  close(s, cs);
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
  const f = s.final!;
  assert.strictEqual(f.completion, 1000);
  assert.strictEqual(f.chain, Math.floor((1000 * 35) / 65));
  assert.ok(f.chain / f.raw <= 0.35);
  assert.strictEqual(f.chainEarned, 1e6);
});

test('§7.2 / §15 penalties: 2 mistakes, 1 hint, assist → ×0.8 × 0.8 × 0.8', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  for (const type of ['MISTAKE', 'MISTAKE', 'HINT_USED', 'ASSIST_ENABLED', 'ASSIST_ENABLED'] as const) Scoring.apply(s, { type });
  Scoring.apply(s, { type: 'PUZZLE_COMPLETED', elapsed: 10000 });
  assert.strictEqual(s.final?.total, Math.floor(1000 * 0.512));
});

test('guide lines are an assist: ×0.5 once, stacking with the others', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  for (const type of ['GUIDES_USED', 'GUIDES_USED', 'ASSIST_ENABLED'] as const) Scoring.apply(s, { type });
  Scoring.apply(s, { type: 'PUZZLE_COMPLETED', elapsed: 10000 });
  assert.strictEqual(s.final?.G, 0.5);
  assert.strictEqual(s.final?.total, Math.floor(1000 * 0.5 * 0.8));
});

/** A finished attempt with fixed non-speed points; `guided` uses guide lines. */
function finished(tier: number, { elapsed, chainEarned = 0, guided = false, base = { pl: 2750, rg: 9900, mc: 1400 } }: { elapsed: number; chainEarned?: number; guided?: boolean; base?: { pl: number; rg: number; mc: number } }) {
  const s = Scoring.create({ tier, mode: 'classic' });
  Object.assign(s, { placementPts: base.pl, regionPts: base.rg, multiPts: base.mc, chainEarned });
  if (guided) Scoring.apply(s, { type: 'GUIDES_USED' });
  Scoring.apply(s, { type: 'PUZZLE_COMPLETED', elapsed });
  return s.final!;
}

test('v4 Master with maximum chains: guided halves time and chain points before the cap and the final ×0.5', () => {
  const fast = 60; // well under half of Master par: full time bonus
  const pure = finished(6, { elapsed: fast, chainEarned: 1e6 });
  // 2,750 + 9,900 + 1,400 + 40,000 + 20,000 = 74,050; cap 39,873; total 113,923
  assert.deepEqual([pure.time, pure.chain, pure.total], [20000, 39873, 113923]);

  const guided = finished(6, { elapsed: fast, chainEarned: 1e6, guided: true });
  // Time 10,000 → non-chain 64,050; chains 500,000 capped at 34,488; raw 98,538 × 0.5
  assert.deepEqual([guided.timeEarned, guided.time, guided.chain, guided.raw, guided.total], [20000, 10000, 34488, 98538, 49269]);
  assert.equal(guided.guidedSpeed, true);

  // A slow Pure game with no speed rewards at all still beats the fastest Guided game.
  const slowPure = finished(6, { elapsed: 1e6 });
  assert.equal(slowPure.total, 54050);
  assert.ok(slowPure.total > guided.total);
});

test('on every tier, the fastest Guided game scores below the slowest Pure one', () => {
  for (let tier = 1; tier <= 6; tier++) {
    const guided = finished(tier, { elapsed: 1, chainEarned: 1e7, guided: true });
    const slowPure = finished(tier, { elapsed: 1e7 });
    assert.ok(guided.total < slowPure.total, `tier ${tier}: ${guided.total} vs ${slowPure.total}`);
  }
});

test('the 35% cap applies after the Guided chain reduction', () => {
  // Beginner, no time bonus: non-chain 14,550 → cap 7,834. 10,000 earned → 5,000 after halving, under the cap.
  const g = finished(1, { elapsed: 1e6, chainEarned: 10000, guided: true, base: { pl: 2250, rg: 9900, mc: 1400 } });
  assert.deepEqual([g.chainEarned, g.chain, g.raw, g.total], [10000, 5000, 19550, 9775]);
  // 20,000 earned → 10,000 after halving, now over the cap.
  const h = finished(1, { elapsed: 1e6, chainEarned: 20000, guided: true, base: { pl: 2250, rg: 9900, mc: 1400 } });
  assert.equal(h.chain, Math.floor((14550 * 35) / 65));
});

test('guide lines used briefly mid-game still halve chains earned before and after', () => {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  const cs = Chains.create();
  play(s, cs, [place(1, 0, 1, 0), place(2, 1, 2, 4000), place(3, 2, 3, 9000), place(4, 9, 4, 13000)], 30000);
  const before = s.chainEarned;
  assert.equal(Scoring.live(s), 200 + before);
  Scoring.apply(s, { type: 'GUIDES_USED' }); // switched on once, then off: nothing ever un-guides
  // Detection keeps working and chain points keep being recorded as earned.
  close(s, cs);
  play(s, cs, [place(5, 40, 5, 60000), place(6, 41, 6, 61000), place(7, 42, 7, 62000)], 30000);
  assert.ok(s.chainEarned > before);
  assert.equal(Scoring.live(s), Math.floor((350 + Math.floor(s.chainEarned / 2)) / 2));
  Scoring.apply(s, { type: 'PUZZLE_COMPLETED', elapsed: 1e6 });
  assert.equal(s.final!.chain, Math.floor(s.chainEarned / 2));
  assert.equal(s.final!.G, 0.5);
});

test('§24.4 replay of the event log reproduces the score', () => {
  const init = { tier: 3, mode: 'classic' as ModeId };
  const s = Scoring.create(init);
  const cs = Chains.create();
  const log: GameEvent[] = [];
  const rec = (ev: GameEvent) => { log.push(ev); Scoring.apply(s, ev); };
  [place(1, 0, 1, 0), place(2, 1, 2, 2000), place(3, 2, 3, 3000)].forEach((p) => {
    rec({ type: 'NUMBER_PLACED', id: p.id, cell: p.cell, digit: p.digit });
    const { chain } = Chains.observe(cs, p, { windowMs: 20000, min: 3 });
    if (chain) rec({ type: 'CHAIN_EXTENDED', ...chain });
  });
  rec({ type: 'REGION_COMPLETED', regions: ['r0'] });
  rec({ type: 'PUZZLE_COMPLETED', elapsed: 500 });
  assert.deepStrictEqual(Scoring.replay(init, log).final, s.final);
});

