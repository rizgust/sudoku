// Universal Chain through the game's own event path (onCorrect / breakChain), the way the
// board, hints and undo drive it. Run: bun run test
import assert from 'node:assert/strict';
import { beforeEach, test } from 'vitest';
import type { GameEvent } from '../game/events.ts';
import { breakChain, initScoring, markTick, onCorrect } from './gameplay-events.ts';
import type { Game } from './state.ts';

// A valid solved grid; the puzzle starts empty, so no region completes in these tests.
const SOLUTION = Array.from({ length: 81 }, (_, i) => {
  const r = (i / 9) | 0, c = i % 9;
  return ((r * 3 + ((r / 3) | 0) + c) % 9) + 1;
});

let game: Game;
beforeEach(() => {
  game = {
    v: 2, pid: 'test', mode: 'classic', tier: 4, elapsed: 0, mistakes: 0, hints: 0,
    puzzle: new Array(81).fill(0), solution: SOLUTION, values: new Array(81).fill(0), notes: new Array(81).fill(0),
    history: [],
  } as unknown as Game;
  initScoring(game);
});

/** Places the correct digit in cell i at game second `sec`. */
function correct(i: number, sec: number, hinted = false) {
  game.elapsed = sec;
  markTick();
  game.values[i] = SOLUTION[i];
  onCorrect(game, i, SOLUTION[i], { hinted });
}
/** The chain on display (a call, so TypeScript doesn't keep an earlier null check). */
const chain = () => game.score.chain;
const closes = () => game.events.filter((e): e is Extract<GameEvent, { type: 'CHAIN_CLOSED' }> => e.type === 'CHAIN_CLOSED');

test('different digits in different regions, 8 s apart on Hard, make one chain', () => {
  [0, 13, 26, 30, 52, 57, 70].forEach((cell, k) => correct(cell, k * 8));
  assert.ok(new Set([0, 13, 26, 30, 52, 57, 70].map((i) => SOLUTION[i])).size > 1);
  assert.deepEqual(closes(), []);
  assert.deepEqual([game.score.chain?.run, game.score.chain?.length], [1, 7]);
  const ext = game.events.filter((e) => e.type === 'CHAIN_EXTENDED');
  assert.equal(ext.length, 5);
  assert.ok(ext.every((e) => e.type === 'CHAIN_EXTENDED' && e.t != null));
});

test('a hint ends the chain, and the hinted cell never feeds a chain', () => {
  [0, 13, 26, 30].forEach((cell, k) => correct(cell, k));
  breakChain(game, 'hint'); // what showing a hint does
  correct(52, 5, true);     // applying the hint's answer
  assert.deepEqual(closes().map((e) => [e.run, e.reason]), [[1, 'hint']]);
  correct(57, 6); correct(70, 7);
  assert.equal(game.score.chain, null); // only two fresh placements since the hint
  correct(75, 8);
  assert.deepEqual([chain()?.run, chain()?.length], [2, 3]);
});

test('undo that changes the board ends the chain; re-entering an undone digit does not extend it', () => {
  [0, 13, 26, 30].forEach((cell, k) => correct(cell, k));
  const earned = game.score.chainEarned;
  game.values[30] = 0;
  breakChain(game, 'undo'); // what undo does when the restored board differs
  correct(30, 5);           // the same digit again: already credited, earns nothing
  assert.deepEqual(closes().map((e) => e.reason), ['undo']);
  assert.equal(game.score.chain, null);
  assert.equal(game.score.chainEarned, earned);
  correct(52, 6); correct(57, 7);
  assert.equal(game.score.chain, null); // two fresh placements: still forming
  correct(70, 8);
  assert.deepEqual([chain()?.run, chain()?.length], [2, 3]);
});

test('clearing a credited digit and a mistake both end the chain', () => {
  [0, 13, 26].forEach((cell, k) => correct(cell, k));
  breakChain(game, 'clear');
  [30, 52, 57].forEach((cell, k) => correct(cell, 10 + k));
  breakChain(game, 'mistake');
  assert.deepEqual(closes().map((e) => [e.run, e.reason]), [[1, 'clear'], [2, 'mistake']]);
  assert.equal(game.score.stats.chains, 2);
});

test('a gap longer than the window ends the chain on the next placement', () => {
  [0, 13, 26].forEach((cell, k) => correct(cell, k * 20)); // 0, 20, 40 s: each gap under 30 s
  assert.equal(game.score.chain?.length, 3);
  correct(30, 40 + 31);
  assert.deepEqual(closes().map((e) => [e.run, e.reason]), [[1, 'expired']]);
  assert.equal(game.score.chain, null);
});
