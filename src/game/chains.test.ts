// Universal Chain lifecycle: one chain across digits and regions, kept alive by an inactivity
// timer; Number, Block, Line and Hybrid are bonus patterns inside it. Run: bun run test
import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as Chains from './chains.ts';
import type { Placement } from './chains.ts';
import type { Award, ChainCloseReason } from './events.ts';
import * as Scoring from './scoring.ts';

const HARD = 4;
const WINDOW = Scoring.chainWindowMs(HARD); // 30 s
const opts = { windowMs: WINDOW, min: Scoring.RULES.chainMin };

const place = (id: number, cell: number, digit: number, t: number): Placement =>
  ({ id, cell, digit, row: (cell / 9) | 0, col: cell % 9, block: (((cell / 27) | 0) * 3) + (((cell % 9) / 3) | 0), t });

/** Detector + scoring wired like the game; records every step for assertions. */
function session(tier = HARD) {
  const s = Scoring.create({ tier, mode: 'classic' });
  const cs = Chains.create();
  const closed: { run: number; reason: ChainCloseReason }[] = [];
  const steps: { run: number | null; length: number | null; bonus: string[]; awards: Award[] }[] = [];
  let id = 0;
  const windowMs = Scoring.chainWindowMs(tier);
  return {
    s, cs, closed, steps,
    /** The chain on display (a call, so TypeScript doesn't keep an earlier null check). */
    chain: () => s.chain,
    place(cell: number, digit: number, t: number) {
      const p = place(++id, cell, digit, t);
      Scoring.apply(s, { type: 'NUMBER_PLACED', id: p.id, cell, digit });
      const r = Chains.observe(cs, p, { windowMs, min: 3 });
      if (r.closed) { closed.push({ run: r.closed.run, reason: 'expired' }); Scoring.apply(s, { type: 'CHAIN_CLOSED', run: r.closed.run, reason: 'expired' }); }
      const awards = r.chain ? Scoring.apply(s, { type: 'CHAIN_EXTENDED', ...r.chain, t }) : [];
      steps.push({ run: s.chain?.run ?? null, length: s.chain?.length ?? null, bonus: (s.chain?.bonus ?? []).map((b) => `${b.type}${b.length}`), awards });
    },
    interrupt(reason: ChainCloseReason) {
      const c = Chains.reset(cs);
      if (c) { closed.push({ run: c.run, reason }); Scoring.apply(s, { type: 'CHAIN_CLOSED', run: c.run, reason }); }
    },
  };
}

// Cells in pairwise different rows, columns and blocks, so only the Universal Chain applies.
const SPREAD = [0, 13, 26, 30, 52, 57, 70, 75];
// Five 7s, then a different digit each time.
const DIGITS = [7, 7, 7, 7, 7, 4, 2, 9];

test('switching digits never ends or restarts the chain', () => {
  const g = session();
  // One every 6 s: 42 s in all, past the old fixed 30 s window.
  SPREAD.forEach((cell, k) => g.place(cell, DIGITS[k], k * 6000));
  assert.deepEqual(g.closed, []);
  assert.deepEqual(g.steps.map((x) => x.length), [null, null, 3, 4, 5, 6, 7, 8]);
  assert.ok(g.steps.slice(2).every((x) => x.run === 1));
  // The Number pattern ran while the 7s did, then ended without taking the chain with it.
  assert.deepEqual(g.steps.map((x) => x.bonus), [[], [], ['number3'], ['number4'], ['number5'], [], [], []]);
  // Every step keeps paying the Universal Chain: 90, 110, 200, then 200 on the switch itself.
  assert.deepEqual(g.steps.map((x) => x.awards.find((a) => a.kind === 'chain')?.pts ?? 0), [0, 0, 90, 110, 200, 200, 100, 100]);
  // The Number pattern paid once, when it activated: +10% of 90.
  assert.deepEqual(g.steps.map((x) => x.awards.filter((a) => a.kind === 'pattern').map((a) => a.pts)), [[], [], [9], [], [], [], [], []]);
});

test('moving to another row, column or block never ends the chain', () => {
  const g = session();
  // Three in block 0, then block 8, block 4, back to block 0.
  [[0, 1], [1, 2], [9, 3], [80, 4], [40, 5], [20, 6]].forEach(([cell, d], k) => g.place(cell, d, k * 5000));
  assert.deepEqual(g.closed, []);
  assert.deepEqual(g.steps.map((x) => x.length), [null, null, 3, 4, 5, 6]);
  assert.ok(g.steps[2].bonus.includes('block3'));
  assert.deepEqual(g.steps[3].bonus, []); // Block pattern ended at cell 80
  assert.equal(g.s.chain?.run, 1);
});

test('a pattern ending keeps the chain; each pattern instance is counted once when the chain ends', () => {
  const g = session();
  // 7, 7, 7 (Number), a 4 elsewhere, then three cells of block 8 (Block): one Universal Chain.
  [[0, 7], [13, 7], [26, 7], [30, 4], [60, 1], [70, 2], [80, 3]].forEach(([cell, d], k) => g.place(cell, d, k * 4000));
  assert.deepEqual(g.closed, []);
  assert.equal(g.s.chain?.length, 7);
  assert.equal(g.s.stats.chains, 0); // still open
  g.interrupt('end');
  const st = g.s.stats;
  assert.equal(st.chains, 1);
  assert.equal(st.longest, 7);
  assert.deepEqual([st.byType.time, st.byType.number, st.byType.block], [1, 1, 1]);
});

test('each placement refreshes the inactivity timer to the full window', () => {
  const g = session();
  // 29 s apart: every gap fits the 30 s window, 87 s in all.
  [0, 13, 26, 30].forEach((cell, k) => g.place(cell, k + 1, k * 29000));
  assert.deepEqual(g.closed, []);
  assert.equal(g.s.chain?.length, 4);
  assert.equal(g.s.chain?.lastT, 87000);
  assert.equal(Chains.deadline(g.cs, opts), 87000 + WINDOW);
  assert.equal(Chains.expire(g.cs, 87000 + WINDOW, opts), null); // exactly at the deadline: still alive
});

test('the inactivity timer running out ends the chain, with or without a next placement', () => {
  const g = session();
  [0, 13, 26].forEach((cell, k) => g.place(cell, k + 1, k * 1000));
  // A clock tick after the deadline closes it (the indicator ring reaching 0).
  assert.deepEqual(Chains.expire(g.cs, 2000 + WINDOW + 1, opts), { run: 1 });
  assert.equal(g.cs.active, false);

  const h = session();
  [0, 13, 26].forEach((cell, k) => h.place(cell, k + 1, k * 1000));
  const earned = h.s.chainEarned;
  h.place(30, 4, 2000 + WINDOW + 1); // too late: ends chain 1 and starts forming chain 2
  assert.deepEqual(h.closed, [{ run: 1, reason: 'expired' }]);
  assert.equal(h.s.chain, null);
  assert.equal(h.s.chainEarned, earned);
  h.place(52, 5, 40000); h.place(57, 6, 41000);
  assert.equal(h.chain()?.run, 2);
  assert.equal(h.chain()?.length, 3); // the expired chain's placements don't carry over
});

test('interruptions end the chain: mistake, hint, clearing a credited digit, undo', () => {
  for (const reason of ['mistake', 'hint', 'clear', 'undo'] as const) {
    const g = session();
    [0, 13, 26, 30].forEach((cell, k) => g.place(cell, k + 1, k * 1000));
    g.interrupt(reason);
    assert.deepEqual(g.closed, [{ run: 1, reason }], reason);
    assert.equal(g.s.chain, null, reason);
    // The next chain starts from scratch and needs three placements again.
    g.place(52, 5, 5000); g.place(57, 6, 6000);
    assert.equal(g.s.chain, null, reason);
    g.place(70, 7, 7000);
    assert.deepEqual([g.chain()?.run, g.chain()?.length], [2, 3], reason);
  }
});

test('incremental payouts: a long chain never pays the same placements twice', () => {
  const g = session();
  SPREAD.forEach((cell, k) => g.place(cell, DIGITS[k], k * 6000));
  const paid = g.steps.reduce((sum, x) => sum + x.awards.reduce((a, w) => a + w.pts, 0), 0);
  // Paid = the Universal Chain's best value (400 × (2.0 − 1) × 2.0) + the one Number bonus.
  assert.equal(paid, g.s.chainEarned);
  assert.equal(g.s.runs[1], Scoring.chainValue(400, 8, HARD));
  assert.equal(g.s.chainEarned, 800 + 9);
});

test('the chain on display reports the Universal Chain and the pattern it just activated', () => {
  const g = session();
  [[0, 7], [13, 7], [26, 7]].forEach(([cell, d], k) => g.place(cell, d, k * 1000));
  const c = g.s.chain!;
  assert.deepEqual([c.length, c.type, c.activated, c.allPoints, c.startT, c.lastT, c.label], [3, 'number', 'number', 150, 0, 2000, 'Chain ×1.3']);
  // Next placement: Universal ×4 = 200, minus the 90 already paid.
  assert.equal(Scoring.nextChainGain(g.s), 110);
  g.place(30, 4, 3000);
  assert.deepEqual([g.s.chain?.type, g.s.chain?.activated], ['time', null]);
});

test('saved games from before v5 still close their chain and count its types', () => {
  const s = Scoring.create({ tier: 1, mode: 'classic' });
  s.open = { run: 3, types: { time: 1, block: 1 }, hybrid: true, longest: 4 } as unknown as typeof s.open;
  Scoring.apply(s, { type: 'CHAIN_CLOSED', run: 3, reason: 'end' });
  assert.deepEqual([s.stats.chains, s.stats.byType.time, s.stats.byType.block, s.stats.byType.hybrid, s.stats.longest], [1, 1, 1, 1, 4]);
});

// ---------- Pattern bonuses (v6): independent one-time extras on top of the Universal Chain ----------

const patternAwards = (g: ReturnType<typeof session>) =>
  g.steps.map((x) => x.awards.filter((a) => a.kind === 'pattern').map((a) => `${a.pattern}:${a.pts}`));

test('a pattern late in a long chain activates with a bonus from that placement\'s chain points', () => {
  const g = session();
  // Six spread placements, then three cells of block 8 on a diagonal (no shared line), then a 4th.
  [0, 13, 26, 30, 52, 57].forEach((cell, k) => g.place(cell, k + 1, k * 3000));
  [60, 70, 80, 61].forEach((cell, k) => g.place(cell, k + 2, 18000 + k * 3000));
  // At length 9 the Universal Chain pays 900 − 800 = 100; Block adds 20% of it.
  assert.equal(g.steps[8].awards.find((a) => a.kind === 'chain')?.pts, 100);
  assert.deepEqual(patternAwards(g), [[], [], [], [], [], [], [], [], ['block:20'], []]);
  // Extending the same Block pattern to 4 pays the Universal Chain only.
  assert.deepEqual(g.steps[9].bonus, ['block4']);
  assert.deepEqual(g.steps[9].awards.map((a) => a.kind), ['chain']);
});

test('switching digits ends the Number pattern; a new run of the same digit is a new pattern', () => {
  const g = session();
  // 7, 7, 7, then a 4, then 7, 7, 7 again: one Universal Chain, two Number pattern instances.
  [7, 7, 7, 4, 7, 7, 7].forEach((d, k) => g.place(SPREAD[k], d, k * 4000));
  assert.deepEqual(g.closed, []);
  assert.equal(g.s.chain?.length, 7);
  // +10% of 90 at length 3; +10% of 700 − 600 = 100 at length 7.
  assert.deepEqual(patternAwards(g), [[], [], ['number:9'], [], [], [], ['number:10']]);
  g.interrupt('end');
  assert.deepEqual([g.s.stats.chains, g.s.stats.byType.number], [1, 2]);
});

test('a pattern expiring pays nothing more and leaves the Universal Chain running', () => {
  const g = session();
  [[0, 1], [10, 2], [20, 3]].forEach(([cell, d], k) => g.place(cell, d, k * 2000)); // Block 0 activates
  [[40, 4], [80, 5]].forEach(([cell, d], k) => g.place(cell, d, 6000 + k * 2000)); // Block pattern over
  assert.deepEqual(patternAwards(g), [[], [], ['block:18'], [], []]);
  assert.deepEqual(g.steps.map((x) => x.bonus.length > 0), [false, false, true, false, false]);
  assert.deepEqual(g.steps.slice(2).map((x) => x.run), [1, 1, 1]);
  assert.equal(g.s.chain?.length, 5);
  // Back in block 0: a fresh Block pattern needs three new consecutive placements to activate.
  [[1, 6], [11, 7]].forEach(([cell, d], k) => g.place(cell, d, 10000 + k * 2000));
  assert.deepEqual(patternAwards(g).slice(5), [[], []]);
  g.place(2, 8, 14000);
  assert.deepEqual(patternAwards(g)[7], ['block:20']); // 20% of (800 − 700)
});

test('simultaneous patterns pay only the strongest bonus, and none of them pays later', () => {
  // Block + Number at once (digits are arbitrary to the engine): Block's 20% wins.
  const g = session(1);
  [0, 10, 20, 30].forEach((cell, k) => g.place(cell, 5, k * 1000));
  // Beginner: universal 150 × 0.3 × 1.0 = 45 → Block 20% = 9; Number's 10% isn't added.
  assert.deepEqual(patternAwards(g), [[], [], ['block:9'], []]);
  // Block + Line → Hybrid (30%) beats both.
  const h = session(1);
  [0, 1, 2].forEach((cell, k) => h.place(cell, k + 1, k * 1000));
  assert.deepEqual(patternAwards(h), [[], [], ['hybrid:13']]);
  h.interrupt('end');
  // All three instances are counted for achievements even though one bonus was paid.
  assert.deepEqual([h.s.stats.byType.block, h.s.stats.byType.line, h.s.stats.byType.hybrid], [1, 1, 1]);
});

test('a pattern whose bonus rounds to 0 still reports its activation', () => {
  const g = session(1);
  g.s.runs[1] = 1e6; // the Universal Chain earns nothing new on this placement
  [0, 13, 26].forEach((cell, k) => g.place(cell, 7, k * 1000));
  assert.deepEqual(g.steps[2].awards.map((a) => [a.kind, a.pts, a.label]), [['pattern', 0, 'Number Bonus']]);
  assert.equal(g.s.chain?.activated, 'number');
});

test('the 35% chain cap covers pattern bonuses: past the cap they still celebrate but add nothing', () => {
  const run = (patterns: boolean) => {
    const g = session(1);
    // Diagonal cells of block 0 with one digit: Block + Number activate; distinct digits/blocks: nothing.
    const cells = patterns ? [0, 10, 20] : [0, 13, 26];
    cells.forEach((cell, k) => g.place(cell, patterns ? 5 : k + 1, k * 1000));
    return g;
  };
  const plain = run(false), bonus = run(true);
  assert.equal(bonus.s.chainEarned - plain.s.chainEarned, 9);
  // Under the cap, the bonus counts in full.
  for (const g of [plain, bonus]) Scoring.apply(g.s, { type: 'PUZZLE_COMPLETED', elapsed: 1e6 });
  assert.equal(bonus.s.final!.chain - plain.s.final!.chain, 9);
  // At the cap, the same bonus is still awarded and shown, but the counted chain points don't move.
  const capped = (patterns: boolean) => {
    const g = run(patterns);
    g.s.chainEarned += 1e6;
    Scoring.apply(g.s, { type: 'PUZZLE_COMPLETED', elapsed: 1e6 });
    return g;
  };
  const a = capped(false), b = capped(true);
  assert.deepEqual(patternAwards(b)[2], ['block:9']);
  assert.equal(b.s.final!.chain, a.s.final!.chain);
  assert.equal(b.s.final!.chain, Math.floor(((150 + 1000) * 35) / 65));
  assert.ok(b.s.final!.chain / b.s.final!.raw <= 0.35);
});

test('replaying the event log reproduces Universal and pattern points exactly', () => {
  const s = Scoring.create({ tier: 5, mode: 'classic' });
  const cs = Chains.create();
  const log: import('./events.ts').GameEvent[] = [];
  const rec = (ev: import('./events.ts').GameEvent) => { log.push(ev); Scoring.apply(s, ev); };
  [[0, 7], [1, 7], [2, 7], [9, 4], [10, 2], [11, 9], [40, 1], [50, 3]].forEach(([cell, d], k) => {
    const p = place(k + 1, cell, d, k * 5000);
    rec({ type: 'NUMBER_PLACED', id: p.id, cell, digit: d });
    const { closed, chain } = Chains.observe(cs, p, { windowMs: 24000, min: 3 });
    if (closed) rec({ type: 'CHAIN_CLOSED', run: closed.run, reason: 'expired' });
    if (chain) rec({ type: 'CHAIN_EXTENDED', ...chain, t: p.t });
  });
  rec({ type: 'PUZZLE_COMPLETED', elapsed: 900 });
  const again = Scoring.replay({ tier: 5, mode: 'classic' }, log);
  assert.deepStrictEqual(again, s);
  assert.ok(Number.isInteger(s.chainEarned));
});
