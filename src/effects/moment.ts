/* Turns the gameplay events of one move into one celebration plan (docs/effect-00.md §G).

   A single tap can place a digit, complete regions, extend a chain and finish the puzzle. All
   rewards are shown, but only one celebration dominates: one title, one coordinated sound and
   a compact summary of every amount. Amounts always come from the scoring engine's awards.
   Pure functions, no DOM. */
import type { Award, ChainType, GameEvent, RegionKey } from '../game/events.ts';
import type { ChainDisplay } from '../game/scoring.ts';

/** One gameplay event as the effects layer receives it. */
export interface Collected {
  ev: GameEvent;
  awards: Award[];
  /** The scoring engine's chain on display right after a CHAIN_EXTENDED event. */
  chain?: ChainDisplay | null;
}

/** 0 normal, 1 Chain!, 2 Great, 3 Super, 4 Mega (6–7), 5 Legendary (8+) (§C). */
export type ChainLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const chainLevel = (length: number): ChainLevel =>
  length >= 8 ? 5 : length >= 6 ? 4 : length === 5 ? 3 : length === 4 ? 2 : length === 3 ? 1 : 0;

export interface MomentChain {
  run: number;
  type: ChainType;
  hybrid: boolean;
  length: number;
  level: ChainLevel;
  /** First time this chain reached its level (a Mega chain's 7th placement isn't). */
  fresh: boolean;
  /** Incremental chain points awarded by this move. */
  pts: number;
  label: string;
}

export interface Moment {
  /** The cell the move landed on, if any. */
  cell: number | null;
  digit: number | null;
  /** Placement points (0 for re-entries, hints and mistakes). */
  placementPts: number;
  wrong: boolean;
  regions: { key: RegionKey; pts: number }[];
  multi: { count: 2 | 3; pts: number } | null;
  chain: MomentChain | null;
  /** A chain closed because its window ran out (soft closing sound). */
  chainExpired: boolean;
  completed: boolean;
}

/**
 * Builds the moment for one move. `prevLevel(run)` is the highest level already celebrated
 * for that chain, so repeated levels play a smaller effect.
 */
export function buildMoment(items: Collected[], prevLevel: (run: number) => number): Moment {
  const m: Moment = {
    cell: null, digit: null, placementPts: 0, wrong: false,
    regions: [], multi: null, chain: null, chainExpired: false, completed: false,
  };
  for (const { ev, awards, chain } of items) {
    switch (ev.type) {
      case 'NUMBER_PLACED':
        m.cell = ev.cell;
        m.digit = ev.digit;
        m.placementPts += awards.reduce((s, a) => s + (a.kind === 'place' ? a.pts : 0), 0);
        break;
      case 'CELL_REVEALED':
        if (m.cell == null) m.cell = ev.cell;
        break;
      case 'MISTAKE':
        m.wrong = true;
        if (ev.cell != null) m.cell = ev.cell;
        break;
      case 'REGION_COMPLETED': {
        // Only regions credited for the first time carry an award.
        const fresh = awards.filter((a) => a.kind === 'region' && a.region);
        for (const a of fresh) m.regions.push({ key: a.region!, pts: a.pts });
        const multi = awards.find((a) => a.kind === 'multi');
        if (multi) m.multi = { count: fresh.length >= 3 ? 3 : 2, pts: multi.pts };
        break;
      }
      case 'CHAIN_EXTENDED': {
        if (!chain) break;
        const pts = awards.reduce((s, a) => s + (a.kind === 'chain' ? a.pts : 0), 0);
        const length = Math.max(...ev.patterns.map((p) => p.ids.length));
        const level = chainLevel(length);
        m.chain = {
          run: ev.run, type: chain.type, hybrid: chain.hybrid, length, level,
          fresh: level > prevLevel(ev.run), pts, label: chain.label,
        };
        break;
      }
      case 'CHAIN_CLOSED':
        if (ev.reason === 'expired') m.chainExpired = true;
        break;
      case 'PUZZLE_COMPLETED':
        m.completed = true;
        break;
    }
  }
  return m;
}

export type Celebration =
  | 'completion' | 'legendary' | 'triple' | 'mega' | 'double' | 'super' | 'chain' | 'region' | 'placement' | 'wrong' | 'none';

/** Accent colours: CSS custom properties defined in style.css. */
export type Accent = 'emerald' | 'gold' | 'cyan' | 'blue' | 'amber' | 'red';

export type SoundName =
  | 'click' | 'knock' | 'row' | 'col' | 'block' | 'double' | 'jackpot'
  | 'kachink' | 'kachink2' | 'rising' | 'ascend' | 'fanfare' | 'close'
  | 'complete' | 'perfect' | 'celebrate';

export interface Plan {
  kind: Celebration;
  /** Banner title, empty when the move shows no banner. */
  title: string;
  size: 'sm' | 'md' | 'lg' | 'xl' | null;
  accent: Accent;
  /** Compact summary of the move's reward amounts, from the scoring engine. */
  lines: string[];
  /** The one coordinated sound for the move (a placement click may precede it). */
  sound: SoundName | null;
  /** Chain length used to raise the pitch of chain sounds. */
  pitch: number;
  /** Length of the dominant effect, in ms (§I). */
  durationMs: number;
}

const CHAIN_WORD: Record<number, string> = { 2: 'GREAT', 3: 'SUPER', 4: 'MEGA', 5: 'LEGENDARY' };
const REGION_WORD = { r: 'Row', c: 'Column', b: 'Block' } as const;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Chain type identity (§D): cyan Time, blue Number, emerald Block, amber Line, gold Hybrid. */
export function chainAccent(type: ChainType, hybrid: boolean): Accent {
  if (hybrid) return 'gold';
  return type === 'time' ? 'cyan' : type === 'number' ? 'blue' : type === 'block' ? 'emerald' : 'amber';
}

/** Picks the dominant celebration for a move by the priority in §G. */
export function plan(m: Moment, { clean = false } = {}): Plan {
  const c = m.chain;
  const freshLevel = c && c.fresh ? c.level : 0;
  const lines: string[] = [];
  for (const r of m.regions) lines.push(`+${fmt(r.pts)} ${REGION_WORD[r.key[0] as 'r' | 'c' | 'b']}`);
  if (m.multi) lines.push(`+${fmt(m.multi.pts)} ${m.multi.count === 3 ? 'Triple' : 'Double'} Clear`);
  if (c && c.pts) lines.push(`+${fmt(c.pts)} ${c.label}`);

  const base = { lines, pitch: c ? c.length : 0 };
  // A clear during a long chain keeps the chain's word, even on a repeated level.
  const prefix = c && c.level >= 2 ? `${CHAIN_WORD[c.level]} ` : '';

  if (m.completed) {
    return { ...base, kind: 'completion', title: clean ? 'PERFECT SOLVE' : 'PUZZLE SOLVED', size: 'xl', accent: clean ? 'gold' : 'emerald', sound: clean ? 'perfect' : 'complete', durationMs: 1400 };
  }
  if (m.wrong) {
    return { ...base, lines: [], kind: 'wrong', title: '', size: null, accent: 'red', sound: 'knock', durationMs: 220 };
  }
  if (freshLevel === 5) {
    const title = m.multi ? `LEGENDARY ${m.multi.count === 3 ? 'TRIPLE' : 'DOUBLE'} CLEAR!` : 'LEGENDARY!!!';
    return { ...base, kind: 'legendary', title, size: 'xl', accent: m.multi ? 'gold' : chainAccent(c!.type, c!.hybrid), sound: 'fanfare', durationMs: 900 };
  }
  if (m.multi?.count === 3) {
    return { ...base, kind: 'triple', title: `${prefix}TRIPLE CLEAR!!`, size: 'lg', accent: 'gold', sound: 'jackpot', durationMs: 850 };
  }
  if (freshLevel === 4) {
    const title = m.multi ? 'MEGA DOUBLE CLEAR!' : 'MEGA CHAIN!!';
    return { ...base, kind: 'mega', title, size: 'lg', accent: m.multi ? 'gold' : chainAccent(c!.type, c!.hybrid), sound: 'ascend', durationMs: 700 };
  }
  if (m.multi) {
    return { ...base, kind: 'double', title: `${prefix}DOUBLE CLEAR!`, size: 'md', accent: 'gold', sound: 'double', durationMs: 650 };
  }
  if (freshLevel === 3) {
    return { ...base, kind: 'super', title: 'SUPER CHAIN!', size: 'md', accent: chainAccent(c!.type, c!.hybrid), sound: 'rising', durationMs: 600 };
  }
  if (c && c.level >= 1) {
    // Fresh Chain!/Great, or a repeated Mega/Legendary step (smaller, but the pitch keeps rising).
    const title = c.fresh ? (c.level === 1 ? `${c.length}× CHAIN!` : 'GREAT CHAIN!') : `${CHAIN_WORD[c.level]} ×${c.length}`;
    const sound: SoundName = c.fresh && c.level === 1 ? 'kachink' : c.level >= 4 ? 'rising' : 'kachink2';
    return { ...base, kind: 'chain', title, size: 'sm', accent: chainAccent(c.type, c.hybrid), sound, durationMs: c.level >= 2 ? 450 : 350 };
  }
  if (m.regions.length) {
    const kind = m.regions[0].key[0] as 'r' | 'c' | 'b';
    const title = `${REGION_WORD[kind].toUpperCase()} COMPLETE`;
    return { ...base, lines: lines.map((l) => l.split(' ')[0]), kind: 'region', title, size: 'sm', accent: 'emerald', sound: kind === 'r' ? 'row' : kind === 'c' ? 'col' : 'block', durationMs: kind === 'b' ? 550 : 450 };
  }
  if (m.placementPts || m.cell != null) {
    return { ...base, kind: 'placement', title: '', size: null, accent: 'emerald', sound: m.placementPts ? 'click' : null, durationMs: 200 };
  }
  return { ...base, kind: 'none', title: '', size: null, accent: 'emerald', sound: m.chainExpired ? 'close' : null, durationMs: 0 };
}
