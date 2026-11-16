/* The gameplay event bus. The game validates moves and emits events here. Scoring turns
   them into points (it never touches the board), the chain detector only sees eligible
   placements, and anything else (score pop-ups now, the effects system later) subscribes. */
import { BOX, BOXES, COL, COLS, ROW, ROWS } from '../core/sudoku.ts';
import * as Chains from '../game/chains.ts';
import type { Award, ChainCloseReason, GameEvent, ProgressEvent, RegionKey } from '../game/events.ts';
import * as Scoring from '../game/scoring.ts';
import { saveGame, type Game } from './state.ts';

export type GameEventListener = (ev: GameEvent, awards: Award[], game: Game) => void;
const listeners = new Set<GameEventListener>();

/** Subscribes to every validated gameplay event, after scoring has processed it. */
export function onGameEvent(fn: GameEventListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Records an event on the game, scores it and notifies subscribers. */
export function record(game: Game, ev: GameEvent): void {
  game.events.push(ev);
  const awards = Scoring.apply(game.score, ev);
  for (const fn of listeners) fn(ev, awards, game);
}

export type ProgressListener = (events: ProgressEvent[]) => void;
const progressListeners = new Set<ProgressListener>();

/** Subscribes to what a finished attempt achieved (sent when the result screen opens). */
export function onProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export function emitProgress(events: ProgressEvent[]): void {
  for (const fn of progressListeners) fn(events);
}

/** Adds scoring state to a game. Games saved before event scoring start with what's on the board. */
export function initScoring(g: Game): void {
  if (g.score && g.chain && g.credited && g.events) return;
  g.score = Scoring.create({ tier: g.tier, mode: g.mode });
  g.chain = Chains.create();
  g.credited = new Array(81).fill(0);
  g.events = [];
  g.seq = 0;
  for (let i = 0; i < 81; i++) {
    if (!g.puzzle[i] && g.values[i] && g.values[i] === g.solution[i]) {
      g.credited[i] = 1;
      Scoring.apply(g.score, { type: 'CELL_REVEALED', cell: i });
    }
  }
  for (let k = 0; k < (g.mistakes || 0); k++) Scoring.apply(g.score, { type: 'MISTAKE' });
  for (let k = 0; k < (g.hints || 0); k++) Scoring.apply(g.score, { type: 'HINT_USED' });
  if (g.assisted) Scoring.apply(g.score, { type: 'ASSIST_ENABLED' });
  if (g.guided) Scoring.apply(g.score, { type: 'GUIDES_USED' });
}

// ---------- Game clock ----------
// Game time in ms with pauses excluded: whole seconds from the ticker plus the time since the
// last tick, so chain windows freeze while paused.

let tickAt = performance.now();
/** Call on each 1 s tick and when play (re)starts. */
export const markTick = () => { tickAt = performance.now(); };
export const clockMs = (game: Game) => game.elapsed * 1000 + Math.min(999, Math.max(0, performance.now() - tickAt));

// ---------- Chains ----------

const chainOpts = (game: Game) => ({ windowMs: Scoring.chainWindowMs(game.tier), min: Scoring.RULES.chainMin });

/** Ends the current chain because play interrupted it; scoring finalizes an open chain. */
export function breakChain(game: Game, reason: ChainCloseReason): void {
  const closed = Chains.reset(game.chain);
  if (closed) record(game, { type: 'CHAIN_CLOSED', run: closed.run, reason });
}

/** Closes an open chain once its window has passed, even if no placement follows. */
export function expireChain(game: Game | null): void {
  if (!game || !game.chain || !game.chain.active) return;
  const closed = Chains.expire(game.chain, Math.round(clockMs(game)), chainOpts(game));
  if (closed) { record(game, { type: 'CHAIN_CLOSED', run: closed.run, reason: 'expired' }); saveGame(); }
}

// ---------- Placements ----------

function completedRegions(game: Game, i: number): RegionKey[] {
  const done = (unit: number[]) => unit.every((k) => game.values[k] === game.solution[k]);
  const keys: RegionKey[] = [];
  if (done(ROWS[ROW[i]])) keys.push(`r${ROW[i]}`);
  if (done(COLS[COL[i]])) keys.push(`c${COL[i]}`);
  if (done(BOXES[BOX[i]])) keys.push(`b${BOX[i]}`);
  return keys;
}

/**
 * A correct digit landed in cell i. Only the first correct fill by the player earns
 * placement points and feeds chains; re-entries after undo/erase and hint placements don't.
 */
export function onCorrect(game: Game, i: number, d: number, { hinted = false } = {}): void {
  const fresh = !game.credited[i];
  game.credited[i] = 1;
  let id: number | null = null;
  if (hinted) {
    record(game, { type: 'CELL_REVEALED', cell: i });
    breakChain(game, 'hint');
  } else if (fresh) {
    id = ++game.seq;
    // No technique attribution yet, so the placement earns the default reward.
    record(game, { type: 'NUMBER_PLACED', id, cell: i, digit: d, technique: null });
  }
  const regions = completedRegions(game, i);
  if (regions.length) record(game, { type: 'REGION_COMPLETED', regions });
  if (id != null && Scoring.chainsEnabled(game.mode)) {
    const p = { id, cell: i, digit: d, row: ROW[i], col: COL[i], block: BOX[i], t: Math.round(clockMs(game)) };
    const { closed, chain } = Chains.observe(game.chain, p, chainOpts(game));
    if (closed) record(game, { type: 'CHAIN_CLOSED', run: closed.run, reason: 'expired' });
    if (chain) record(game, { type: 'CHAIN_EXTENDED', placementId: id, ...chain });
  }
}
