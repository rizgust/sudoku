/* Chain detection. Part of the game engine, not the scoring engine: it watches validated,
   eligible placements and reports the chain the newest placement extends. It knows nothing
   about points. Scoring consumes its reports as events.

   Universal Chain: one chain counts consecutive eligible correct placements, whatever their
   digit, row, column or block. Switching digits or moving elsewhere on the board never ends
   it. An inactivity timer keeps it alive: each placement refreshes the timer to the
   difficulty's window, measured from that placement. The chain ends only when:
   - the timer runs out (no placement within the window of the previous one),
   - play interrupts it (mistake, hint, clearing a credited cell, an undo that changes the
     board, end of attempt): see reset().

   Lifecycle: placements collect while the chain forms; once `min` of them are in, the chain
   opens with a new id and every later placement extends that same chain until it ends. An
   ended chain's placements never count toward a later chain.

   Bonus patterns: within the open chain, each pattern's sequence is the longest suffix of the
   chain's placements that shares the newest placement's digit (Number), block (Block), row or
   column (Line). Any sequence with at least `min` placements qualifies. A pattern ending, for
   example placing a different digit after three 7s, only drops that pattern; the Universal
   Chain carries on. The 'time' pattern is the Universal Chain itself and is always reported
   first.

   State is plain JSON so it can be saved with the game. */
import type { ChainPattern, ChainType } from './events.ts';

export interface Placement {
  id: number;
  cell: number;
  digit: number;
  row: number;
  col: number;
  block: number;
  /** Game clock in ms, paused time excluded. */
  t: number;
}

export interface ChainState {
  /** Id of the latest chain. */
  run: number;
  /** The chain has reached `min` placements and is open. */
  active: boolean;
  /** The current chain's placements, oldest first (forming or open). */
  recent: Placement[];
}

export interface ChainOptions { windowMs: number; min: number }
export interface Closed { run: number }

// Bonus pattern types and the placement attribute each one requires to be shared.
const PATTERNS: [ChainType, 'digit' | 'block' | 'row' | 'col'][] = [
  ['number', 'digit'],
  ['block', 'block'],
  ['row', 'row'],
  ['col', 'col'],
];

export const create = (): ChainState => ({ run: 0, active: false, recent: [] });

/**
 * Ends the current chain because of an interruption (mistake, hint, clearing a credited
 * cell, undo, end of attempt). Returns the closed chain if one was open.
 */
export function reset(cs: ChainState): Closed | null {
  const closed = cs.active ? { run: cs.run } : null;
  cs.recent = [];
  cs.active = false;
  return closed;
}

/** Game-clock ms at which the chain ends unless another placement lands, or null if empty. */
export function deadline(cs: ChainState, { windowMs }: Pick<ChainOptions, 'windowMs'>): number | null {
  const last = cs.recent[cs.recent.length - 1];
  return last ? last.t + windowMs : null;
}

/**
 * Advances the clock to t. Once the inactivity timer has run out (more than the window since
 * the latest placement), the chain ends: an open chain is returned, a forming one is dropped.
 */
export function expire(cs: ChainState, t: number, opts: Pick<ChainOptions, 'windowMs'>): Closed | null {
  const end = deadline(cs, opts);
  if (end == null || t <= end) return null;
  return reset(cs);
}

/**
 * Observes one eligible placement. `closed` is a chain this placement's arrival ended (its
 * inactivity timer had run out); `chain` lists the patterns the placement completes, the
 * Universal Chain ('time') first.
 */
export function observe(cs: ChainState, p: Placement, opts: ChainOptions): {
  closed: Closed | null;
  chain: { run: number; patterns: ChainPattern[] } | null;
} {
  const closed = expire(cs, p.t, opts);
  cs.recent.push(p);
  const recent = cs.recent;
  if (recent.length < opts.min) return { closed, chain: null };
  if (!cs.active) { cs.run++; cs.active = true; }

  const patterns: ChainPattern[] = [{ type: 'time', ids: recent.map((x) => x.id), firstT: recent[0].t }];
  for (const [type, key] of PATTERNS) {
    let k = recent.length - 1;
    while (k > 0 && recent[k - 1][key] === p[key]) k--;
    const seq = recent.slice(k);
    if (seq.length >= opts.min) patterns.push({ type, ids: seq.map((x) => x.id), firstT: seq[0].t });
  }
  return { closed, chain: { run: cs.run, patterns } };
}
