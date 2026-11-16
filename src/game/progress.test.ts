// Pure / Guided / Legacy labels and shared personal bests. Run: bun run test
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { assistCategory, SCORE_VERSION, summarize, type AttemptRecord, type Profile } from './progress.ts';

let n = 0;
const rec = (o: Partial<AttemptRecord>): AttemptRecord => ({
  pid: `p-${++n}`, tier: 1, mode: 'classic', start: 0, end: Date.UTC(2026, 10, 1) + n * 1000,
  t: 300, wall: 300, res: 'won', m: 0, h: 0, as: false, sc: 1000, xp: 20, up: false, qp: false, tech: '',
  sv: SCORE_VERSION, ...o,
});
const profileOf = (history: AttemptRecord[]): Profile => ({ version: 2, history, achievements: {}, unlocked: 1, practiced: {} });

test('category comes from what was recorded, never assumed Pure', () => {
  assert.equal(assistCategory(rec({ cat: 'pure' })), 'pure');
  assert.equal(assistCategory(rec({ cat: 'guided' })), 'guided');
  // Older attempts: Auto notes on record make it Guided; otherwise the status is unknown.
  assert.equal(assistCategory(rec({ as: true, sv: undefined })), 'guided');
  assert.equal(assistCategory(rec({ sv: undefined })), 'legacy');
  assert.equal(assistCategory(rec({ gl: true })), 'guided');
  assert.equal(assistCategory(rec({ gl: false })), 'pure');
});

test('personal bests are shared by Pure and Guided attempts', () => {
  const s = summarize(profileOf([
    rec({ cat: 'pure', sc: 10000, t: 400 }),
    rec({ cat: 'guided', sc: 15000, t: 200 }),
    rec({ cat: 'pure', sc: 12000, t: 350, mode: 'time' }),
    rec({ sv: undefined, sc: 180, t: 600 }), // older rules: kept apart from current scores
  ]));
  const pt = s.perTier[1];
  assert.deepEqual([pt.bestScore, pt.bestTime, pt.timeAttackBest, pt.legacyBestScore], [15000, 200, 350, 180]);
});
