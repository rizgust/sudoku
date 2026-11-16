// One move → one celebration (docs/effect-00.md §C, §G). Run: bun run test
import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Award, ChainPattern, ChainType, GameEvent, RegionKey } from '../game/events.ts';
import * as Scoring from '../game/scoring.ts';
import type { ChainDisplay } from '../game/scoring.ts';
import { buildMoment, chainLevel, plan, type Collected } from './moment.ts';

const never = () => 0;
const placed = (cell: number, pts = 50): Collected => ({
  ev: { type: 'NUMBER_PLACED', id: cell + 1, cell, digit: 5 },
  awards: [{ kind: 'place', pts, label: '' }],
});
const ids = (n: number) => Array.from({ length: n }, (_, k) => k + 1);
function chain(length: number, type: ChainType, pts: number, { hybrid = false, run = 1 } = {}): Collected {
  const patterns: ChainPattern[] = [{ type: 'time', ids: ids(length), firstT: 0 }];
  if (type !== 'time') patterns.push({ type, ids: ids(length), firstT: 0 });
  const label = `${hybrid ? 'Hybrid ' : ''}${type === 'block' ? 'Block' : type === 'number' ? 'Number' : type === 'time' ? 'Time' : 'Line'} Chain ×2.0`;
  const display: ChainDisplay = { run, type, hybrid, length, points: length * 50, mul100: 200, startT: 0, label };
  return { ev: { type: 'CHAIN_EXTENDED', run, patterns }, awards: pts ? [{ kind: 'chain', pts, label: `${label}!` }] : [], chain: display };
}

/** Real region awards from the scoring engine, so amounts always match it. */
function regions(keys: RegionKey[], already: RegionKey[] = []): Collected {
  const s = Scoring.create({ tier: 4, mode: 'classic' });
  if (already.length) Scoring.apply(s, { type: 'REGION_COMPLETED', regions: already });
  const ev: GameEvent = { type: 'REGION_COMPLETED', regions: keys };
  const awards: Award[] = Scoring.apply(s, ev);
  return { ev, awards };
}

test('chain levels follow §C: 3 Chain, 4 Great, 5 Super, 6–7 Mega, 8+ Legendary', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 12].map(chainLevel), [0, 0, 1, 2, 3, 4, 4, 5, 5]);
});

test('§G example: a Legendary Block chain with a triple clear shows one combined title', () => {
  const m = buildMoment([placed(40), regions(['r4', 'c4', 'b4']), chain(8, 'block', 1200)], never);
  const p = plan(m);
  assert.equal(p.kind, 'legendary');
  assert.equal(p.title, 'LEGENDARY TRIPLE CLEAR!');
  assert.deepEqual(p.lines, ['+300 Row', '+300 Column', '+500 Block', '+400 Triple Clear', '+1,200 Block Chain ×2.0']);
  assert.equal(p.sound, 'fanfare');
  assert.equal(p.size, 'xl');
});

test('puzzle completion outranks everything; a clean solve is a Perfect Solve in gold', () => {
  const items = [placed(80), regions(['r8', 'c8', 'b8']), chain(9, 'time', 300), { ev: { type: 'PUZZLE_COMPLETED', elapsed: 200 } as GameEvent, awards: [] }];
  const m = buildMoment(items, never);
  assert.deepEqual([plan(m).kind, plan(m).title, plan(m).accent], ['completion', 'PUZZLE SOLVED', 'emerald']);
  assert.deepEqual([plan(m, { clean: true }).title, plan(m, { clean: true }).accent, plan(m, { clean: true }).sound], ['PERFECT SOLVE', 'gold', 'perfect']);
});

test('a triple clear outranks a Mega chain and borrows its word', () => {
  const p = plan(buildMoment([placed(0), regions(['r0', 'c0', 'b0']), chain(6, 'row', 400)], never));
  assert.equal(p.kind, 'triple');
  assert.equal(p.title, 'MEGA TRIPLE CLEAR!!');
});

test('a Mega chain outranks a double clear', () => {
  const p = plan(buildMoment([placed(0), regions(['r0', 'b0']), chain(6, 'block', 400)], never));
  assert.equal(p.kind, 'mega');
  assert.equal(p.title, 'MEGA DOUBLE CLEAR!');
  assert.equal(p.accent, 'gold');
});

test('a double clear during a repeated Legendary chain keeps the chain word', () => {
  const p = plan(buildMoment([placed(0), regions(['r0', 'b0']), chain(11, 'time', 50)], () => 5));
  assert.deepEqual([p.kind, p.title], ['double', 'LEGENDARY DOUBLE CLEAR!']);
});

test('repeating a level plays the smaller effect with a rising count', () => {
  const p = plan(buildMoment([placed(0), chain(7, 'number', 100)], () => 4));
  assert.equal(p.kind, 'chain');
  assert.equal(p.title, 'MEGA ×7');
  assert.equal(p.accent, 'blue');
  assert.equal(p.pitch, 7);
});

test('chain titles and accents by type: 3× CHAIN in cyan for Time, GREAT in amber for Line', () => {
  const a = plan(buildMoment([placed(0), chain(3, 'time', 50)], never));
  assert.deepEqual([a.title, a.accent, a.sound], ['3× CHAIN!', 'cyan', 'kachink']);
  const b = plan(buildMoment([placed(0), chain(4, 'col', 60)], never));
  assert.deepEqual([b.title, b.accent, b.sound], ['GREAT CHAIN!', 'amber', 'kachink2']);
  const h = plan(buildMoment([placed(0), chain(5, 'block', 90, { hybrid: true })], never));
  assert.deepEqual([h.kind, h.accent], ['super', 'gold']);
});

test('a single region clear: its own title, amount and chime', () => {
  const p = plan(buildMoment([placed(0), regions(['c3'])], never));
  assert.deepEqual([p.kind, p.title, p.lines, p.sound], ['region', 'COLUMN COMPLETE', ['+300'], 'col']);
});

test('only regions credited for the first time count; no double clear for an old one', () => {
  const m = buildMoment([placed(0), regions(['r0', 'c0'], ['r0'])], never);
  assert.deepEqual(m.regions.map((r) => r.key), ['c0']);
  assert.equal(m.multi, null);
});

test('a mistake gets the muted knock and no reward summary', () => {
  const p = plan(buildMoment([{ ev: { type: 'CHAIN_CLOSED', run: 1, reason: 'mistake' }, awards: [] }, { ev: { type: 'MISTAKE', cell: 12 }, awards: [] }], never));
  assert.deepEqual([p.kind, p.sound, p.lines], ['wrong', 'knock', []]);
});

test('a chain running out of time only plays the soft closing sound', () => {
  const p = plan(buildMoment([{ ev: { type: 'CHAIN_CLOSED', run: 2, reason: 'expired' }, awards: [] }], never));
  assert.deepEqual([p.kind, p.title, p.sound], ['none', '', 'close']);
});
