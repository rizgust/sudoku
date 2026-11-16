/* Where puzzles come from: live generation graded by the logical solver, the bundled bank as
   a fallback, and technique practice positions. */
import { PUZZLE_BANK } from '../core/puzzles.ts';
import * as Sudoku from '../core/sudoku.ts';
import type { Generated, Rng, TechId } from '../core/sudoku.ts';
import { nextFrame } from './dom.ts';

export interface PuzzleData {
  puzzle: number[];
  solution: number[];
  techs: string;
  /** Practice positions start with candidate notes filled in. */
  notes?: number[];
}

export const BANK = PUZZLE_BANK;

function fits(g: Generated | null, tierId: number): g is Generated {
  if (!g || g.level !== tierId) return false;
  if (tierId === 1) return g.clues >= 36;
  if (tierId === 2) return g.clues <= 34;
  return true;
}

function fromBank(tierId: number, rnd: Rng): PuzzleData {
  const list = BANK.filter((e) => e[0] === tierId);
  const e = list[(rnd() * list.length) | 0];
  const puzzle = Sudoku.transform(Sudoku.fromString(e[1]), (rnd() * 4294967296) >>> 0);
  return { puzzle, solution: Sudoku.solve(puzzle, 1).solution!, techs: e[2] };
}

/**
 * Fresh, uniquely solvable puzzle graded to `tierId` by the logical solver. Runs in small
 * chunks so the page stays responsive. With a seed (Daily) the result is deterministic.
 */
export async function makePuzzle(
  tierId: number,
  { seed = null, budgetMs = 2500, maxTries = 600 }: { seed?: number | null; budgetMs?: number; maxTries?: number } = {},
): Promise<PuzzleData> {
  const rnd = seed != null ? Sudoku.mulberry32(seed) : Math.random;
  const mode = tierId <= 2 ? tierId : 3;
  const t0 = performance.now();
  let chunk = performance.now();
  for (let tries = 0; tries < maxTries; tries++) {
    const g = Sudoku.generate(mode, rnd);
    if (fits(g, tierId)) return { puzzle: g.puzzle, solution: g.solution, techs: Object.keys(g.techs).join(' ') };
    if (seed == null && performance.now() - t0 > budgetMs) break;
    if (performance.now() - chunk > 40) { await nextFrame(); chunk = performance.now(); }
  }
  return fromBank(tierId, rnd);
}

// One puzzle per tier generated ahead of time while the player is busy.
const prefetched: Record<number, PuzzleData | undefined> = {};
let prefetchBusy = false;

export function prefetch(tierId: number): void {
  if (prefetched[tierId] || prefetchBusy) return;
  prefetchBusy = true;
  const run = () => makePuzzle(tierId, { budgetMs: 6000 }).then((p) => { prefetched[tierId] = p; prefetchBusy = false; });
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/** A prefetched puzzle for the tier (used once), or a fresh one. */
export async function takePuzzle(tierId: number): Promise<PuzzleData> {
  const p = prefetched[tierId];
  delete prefetched[tierId];
  return p || makePuzzle(tierId);
}

/** A bank puzzle advanced to the point where `tech` is the next logical step. */
export function practicePuzzle(tech: TechId): PuzzleData | null {
  const lv = Sudoku.TECHNIQUES[tech].level;
  let list = BANK.filter((e) => e[2].split(' ').includes(tech) && (lv > 1 || e[0] === 1));
  const exact = list.filter((e) => e[0] === lv);
  if (exact.length) list = exact;
  if (!list.length) return null;
  for (let tries = 0; tries < 20; tries++) {
    const e = list[(Math.random() * list.length) | 0];
    const puzzle = Sudoku.transform(Sudoku.fromString(e[1]), (Math.random() * 4294967296) >>> 0);
    const r = Sudoku.rate(puzzle, 6, { record: true });
    const log = r.log!;
    const at = log.findIndex((x) => x.step.tech === tech);
    if (at < 0) continue;
    const before = log[at].before;
    const start = Array.from(before.v);
    const notes = lv >= 2 ? Array.from(before.c) : new Array<number>(81).fill(0);
    return { puzzle: start, solution: r.values, techs: e[2], notes };
  }
  return null;
}
