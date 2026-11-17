/* Scoring engine (docs/formula-score-00.md §7–16).

   It consumes validated gameplay events (see events.ts) and never sees or changes the board.
   apply(state, event) updates the state and returns the awards to show. The state is plain
   JSON, so it is saved with the game, and replay(events) rebuilds it from the event log.
   All arithmetic is integer: multipliers are stored as hundredths or tenths. */
import type { Award, ChainPattern, ChainType, GameEvent, ModeId, PatternKind, PlacementTechnique } from './events.ts';

// Every tunable number lives here (§29). Bump `version` whenever a value changes;
// each finished attempt stores the version it was scored with.
export const RULES = {
  // 2: chain windows doubled; 3: guide lines count as an assist (×0.5);
  // 4: guide lines also halve the speed rewards (time bonus, chains);
  // 5: Universal Chains: one chain across digits and regions, kept alive by an inactivity
  //    timer (same windows, now measured from the latest placement); patterns are bonuses;
  // 6: the Universal Chain alone sets the chain value (no type factor); Number, Line, Block
  //    and Hybrid pay a one-time bonus on activation instead of competing with it.
  version: 6,
  // Indexed by tier id (1 Beginner … 6 Master).
  completion: [0, 1000, 2500, 5000, 10000, 20000, 40000],
  par: [0, 300, 480, 720, 1080, 1500, 2100],
  // Inactivity timer: a chain ends when no eligible placement lands within this long.
  chainWindowMs: [0, 60000, 50000, 40000, 30000, 24000, 20000],
  chainMin: 3,
  chainDifficulty10: [0, 10, 12, 15, 20, 25, 30], // ×1.0 … ×3.0, in tenths

  // Placement points by the technique the logical solver says the cell needs (§7.3).
  // No technique attribution exists yet, so every placement uses the default (50).
  placement: {
    nakedSingle: 50, hiddenSingle: 75, lockedCandidates: 100, pair: 125,
    subset: 150, pattern: 175, chain: 200,
  } satisfies Record<PlacementTechnique, number>,
  placementDefault: 50,

  region: { r: 300, c: 300, b: 500 },
  multiClear: [0, 0, 200, 400], // by number of regions completed at once

  chainLength100: [100, 100, 100, 130, 150, 180, 200], // by placements; 6+ uses the last
  // Pattern bonuses: paid once, when a pattern first reaches chainMin placements, as a share
  // of the Universal Chain points that same placement earned. When several patterns activate
  // on one placement only the strongest pays. Hybrid = Block + Line (§9.E): in valid Sudoku a
  // Number pattern can't share three cells with a Block or Line one (a digit appears once per
  // unit), so Hybrid is the one overlap that can happen.
  patternPct: { number: 10, row: 15, col: 15, block: 20, hybrid: 30 } satisfies Record<PatternKind, number>,
  chainCapPct: 35, // all chain points (Universal Chain + pattern bonuses) ≤ 35% of the raw score

  mistakeStep10: 1, // −10% per mistake
  hintStep10: 2,    // −20% per hint
  assist10: 8,      // ×0.8 once auto-fill candidates were used
  guides10: 5,      // ×0.5 on the final score once guide lines were shown
  // Guided attempts also earn half of the speed rewards, before the 35% chain cap and the
  // final ×0.5, so Pure play stays ahead even against a much faster Guided game.
  guidedSpeedPct: 50,
  modes: {
    classic:  { mul10: 10, chains: true },
    qual:     { mul10: 10, chains: true },
    daily:    { mul10: 10, chains: true },
    time:     { mul10: 10, chains: true },
    zen:      { mul10: 5,  chains: false },
    practice: { mul10: 0,  chains: true },
  } satisfies Record<ModeId, { mul10: number; chains: boolean }>,
};

/** Stat keys for chain types; row and column both count as Line. */
export type ChainStatKey = 'time' | 'number' | 'block' | 'line' | 'hybrid';

/** A bonus pattern active on the latest placement, inside the Universal Chain. */
export interface ChainBonusPattern { type: Exclude<ChainType, 'time'>; length: number }

export interface ChainDisplay {
  run: number;
  /** Universal Chain length: consecutive eligible placements in this chain. */
  length: number;
  /** Placement points in the Universal Chain. */
  allPoints: number;
  /** Game-clock ms of the chain's first placement. */
  startT: number;
  /** Game-clock ms of the latest placement; the inactivity timer runs from here. */
  lastT: number;
  /** Universal Chain length multiplier. */
  mul100: number;
  /** Pattern identity for accents: the one just activated, else the strongest active, else 'time'. */
  type: ChainType;
  /** Block and Line are both active on the latest placement. */
  hybrid: boolean;
  /** Bonus patterns active on the latest placement, best first (secondary notices). */
  bonus: ChainBonusPattern[];
  /** The pattern the latest placement activated (its bonus was awarded), if any. */
  activated: PatternKind | null;
  label: string;
}

export interface AttemptStats {
  rows: number; cols: number; blocks: number; double: number; triple: number;
  chains: number;
  byType: Record<ChainStatKey, number>;
  longest: number;
  bestChain: number;
}

export interface FinalScore {
  v: number;
  placement: number; region: number; multi: number;
  /** Chain points as earned; `chain` is what counted (after the Guided reduction and the cap). */
  chainEarned: number; chain: number; completion: number;
  /** Time bonus as earned; `time` is what counted (after the Guided reduction). */
  timeEarned: number; time: number;
  /** Guide lines were used: time bonus and chains were multiplied by guidedSpeedPct. */
  guidedSpeed: boolean;
  raw: number;
  A: number; H: number; S: number; G: number; M: number;
  total: number;
}

export interface ScoreState {
  v: number;
  tier: number;
  mode: ModeId;
  /** 1 once a cell has been credited (or revealed). */
  cells: number[];
  /** Credited region keys. */
  regions: Record<string, 1>;
  /** Placement id → placement points. */
  pts: Record<number, number>;
  placementPts: number; regionPts: number; multiPts: number; chainEarned: number;
  mistakes: number; hints: number; assisted: boolean;
  /** Guide lines were shown at some point in the attempt. */
  guided: boolean;
  /** Chain id → highest Universal Chain value already awarded. */
  runs: Record<number, number>;
  /** The chain currently on display. */
  chain: ChainDisplay | null;
  /** The open chain's running totals, finalized on close. `seen` holds one key per pattern
      instance ("block:12" = the Block pattern starting at placement 12); a key is added when
      the pattern is first seen, so each instance pays its bonus at most once. */
  open: OpenChain | null;
  stats: AttemptStats;
  final: FinalScore | null;
}

interface OpenChain {
  run: number;
  seen: Record<string, 1>;
  longest: number;
  /** Pattern bonuses paid in this chain (for the best-chain stat). */
  bonus?: number;
  /** Games saved before v5 tracked types per chain instead of per pattern instance. */
  types?: Partial<Record<ChainStatKey, 1>>;
  hybrid?: boolean;
}

const PATTERN_NAMES: Record<PatternKind, string> = { number: 'Number', row: 'Line', col: 'Line', block: 'Block', hybrid: 'Hybrid' };
const REGION_NAMES = { r: 'Row', c: 'Column', b: 'Block' } as const;
const REGION_STATS = { r: 'rows', c: 'cols', b: 'blocks' } as const;
const MULTI_NAMES: Record<number, string> = { 2: 'Double Clear', 3: 'Triple Clear' };
const TECH_NAMES: Record<PlacementTechnique, string> = {
  nakedSingle: 'Naked Single', hiddenSingle: 'Hidden Single', lockedCandidates: 'Locked Candidates',
  pair: 'Pair', subset: 'Advanced Subset', pattern: 'Advanced Pattern', chain: 'Logical Chain',
};

const mode = (m: ModeId) => RULES.modes[m] || RULES.modes.classic;
export const chainsEnabled = (m: ModeId) => mode(m).chains;
export const chainWindowMs = (tier: number) => RULES.chainWindowMs[tier];
const lengthMul100 = (n: number) => RULES.chainLength100[Math.min(n, RULES.chainLength100.length - 1)];

export function create({ tier, mode: m }: { tier: number; mode: ModeId }): ScoreState {
  return {
    v: RULES.version, tier, mode: m,
    cells: new Array(81).fill(0),
    regions: {},
    pts: {},
    placementPts: 0, regionPts: 0, multiPts: 0, chainEarned: 0,
    mistakes: 0, hints: 0, assisted: false, guided: false,
    runs: {},
    chain: null,
    open: null,
    stats: {
      rows: 0, cols: 0, blocks: 0, double: 0, triple: 0,
      chains: 0, byType: { time: 0, number: 0, block: 0, line: 0, hybrid: 0 },
      longest: 0, bestChain: 0,
    },
    final: null,
  };
}

/** Universal Chain value = points × (Length − 1) × Difficulty, floored (§11.4). */
export function chainValue(points: number, length: number, tier: number): number {
  const l = lengthMul100(length) - 100;
  if (l <= 0) return 0;
  return Math.floor((points * l * RULES.chainDifficulty10[tier]) / 1000);
}

/** Pattern bonus = floor(Universal Chain points of the activating placement × pct / 100) (§11.6). */
export const patternBonus = (universalPts: number, kind: PatternKind) =>
  Math.floor((universalPts * RULES.patternPct[kind]) / 100);

const statKey = (t: ChainType): ChainStatKey => (t === 'row' || t === 'col' ? 'line' : t);

/**
 * Patterns this placement activates, strongest first. A pattern activates when its instance
 * is first seen at exactly chainMin placements; Hybrid when Block and Line overlap in a
 * combination not seen before. Every instance is marked as seen, so none can pay twice.
 */
function activate(o: OpenChain, patterns: ChainPattern[]): PatternKind[] {
  o.seen ??= {};
  const fresh: PatternKind[] = [];
  for (const p of patterns) {
    const key = `${statKey(p.type)}:${p.ids[0]}`;
    if (o.seen[key]) continue;
    o.seen[key] = 1;
    if (p.type !== 'time' && p.ids.length === RULES.chainMin) fresh.push(p.type);
  }
  const block = patterns.find((p) => p.type === 'block');
  const line = patterns.find((p) => p.type === 'row' || p.type === 'col');
  if (block && line) {
    const key = `hybrid:${block.ids[0]}:${line.ids[0]}`;
    if (!o.seen[key]) { o.seen[key] = 1; fresh.push('hybrid'); }
  }
  return fresh.sort((x, y) => RULES.patternPct[y] - RULES.patternPct[x]);
}

/**
 * Records a finished chain in the attempt stats (achievements read these): one chain and one
 * Time chain per Universal Chain, plus every distinct bonus pattern it contained.
 */
function closeChain(s: ScoreState): void {
  const o = s.open;
  s.open = null;
  s.chain = null;
  if (!o) return;
  const st = s.stats;
  st.chains++;
  for (const key of Object.keys(o.seen || {})) st.byType[key.split(':')[0] as ChainStatKey]++;
  for (const t of Object.keys(o.types || {}) as ChainStatKey[]) st.byType[t]++;
  if (o.hybrid) st.byType.hybrid++;
  st.longest = Math.max(st.longest, o.longest);
  st.bestChain = Math.max(st.bestChain, (s.runs[o.run] || 0) + (o.bonus || 0));
}

const chainLabel = (mul100: number) => `Chain ×${(mul100 / 100).toFixed(1)}`;

export function apply(s: ScoreState, ev: GameEvent): Award[] {
  if (s.final && ev.type !== 'PUZZLE_COMPLETED') return [];
  const awards: Award[] = [];
  switch (ev.type) {
    case 'NUMBER_PLACED': {
      if (s.cells[ev.cell]) break; // a cell earns placement points once per attempt
      s.cells[ev.cell] = 1;
      const tech = ev.technique && RULES.placement[ev.technique] != null ? ev.technique : null;
      const pts = tech ? RULES.placement[tech] : RULES.placementDefault;
      s.pts[ev.id] = pts;
      s.placementPts += pts;
      awards.push({ kind: 'place', pts, label: tech ? TECH_NAMES[tech] : '' });
      break;
    }
    case 'CELL_REVEALED':
      s.cells[ev.cell] = 1; // the game sends CHAIN_CLOSED separately when a hint interrupts
      break;
    case 'REGION_COMPLETED': {
      const fresh = ev.regions.filter((k) => !s.regions[k]);
      for (const k of fresh) {
        s.regions[k] = 1;
        const kind = k[0] as 'r' | 'c' | 'b';
        const pts = RULES.region[kind];
        s.regionPts += pts;
        s.stats[REGION_STATS[kind]]++;
        awards.push({ kind: 'region', pts, label: `${REGION_NAMES[kind]} Complete`, region: k });
      }
      const n = Math.min(fresh.length, RULES.multiClear.length - 1);
      if (RULES.multiClear[n]) {
        s.multiPts += RULES.multiClear[n];
        s.stats[n === 2 ? 'double' : 'triple']++;
        awards.push({ kind: 'multi', pts: RULES.multiClear[n], label: MULTI_NAMES[n] });
      }
      break;
    }
    case 'CHAIN_EXTENDED': {
      if (!chainsEnabled(s.mode) || !ev.patterns.length) break;
      if (s.open && s.open.run !== ev.run) closeChain(s);
      if (!s.open) s.open = { run: ev.run, seen: {}, longest: 0, bonus: 0 };
      const o = s.open;
      // The Universal Chain is the 'time' pattern; events always carry it.
      const all = ev.patterns.find((p) => p.type === 'time') ?? ev.patterns.reduce((x, y) => (y.ids.length > x.ids.length ? y : x));
      const allPoints = all.ids.reduce((sum, id) => sum + (s.pts[id] || 0), 0);
      const length = all.ids.length;
      const mul100 = lengthMul100(length);

      // Universal Chain: incremental accounting, pay only what exceeds the chain's best value (§12.1).
      const value = chainValue(allPoints, length, s.tier);
      const prev = s.runs[ev.run] || 0;
      const inc = Math.max(0, value - prev);
      s.runs[ev.run] = Math.max(prev, value);
      s.chainEarned += inc;
      if (inc) awards.push({ kind: 'chain', pts: inc, label: `${chainLabel(mul100)}!` });

      // Pattern bonus: once per pattern instance, strongest only, a share of `inc` (§11.6).
      // Sent even at 0 points so the activation is still celebrated.
      const activated = activate(o, ev.patterns)[0] ?? null;
      if (activated) {
        const bonus = patternBonus(inc, activated);
        s.chainEarned += bonus;
        o.bonus = (o.bonus || 0) + bonus;
        awards.push({ kind: 'pattern', pts: bonus, label: `${PATTERN_NAMES[activated]} Bonus`, pattern: activated });
      }

      o.longest = Math.max(o.longest, length);
      const pct = (t: ChainBonusPattern['type']) => RULES.patternPct[t];
      const bonus = ev.patterns
        .filter((p): p is ChainPattern & { type: ChainBonusPattern['type'] } => p.type !== 'time')
        .map((p) => ({ type: p.type, length: p.ids.length }))
        .sort((x, y) => y.length - x.length || pct(y.type) - pct(x.type));
      const hybrid = bonus.some((b) => b.type === 'block') && bonus.some((b) => b.type === 'row' || b.type === 'col');
      const type: ChainType = activated && activated !== 'hybrid' ? activated : hybrid ? 'block' : bonus[0]?.type ?? 'time';
      s.chain = {
        run: ev.run, length, allPoints, startT: all.firstT, lastT: ev.t ?? all.firstT, mul100,
        type, hybrid, bonus, activated, label: chainLabel(mul100),
      };
      break;
    }
    case 'CHAIN_CLOSED':
    case 'CHAIN_BROKEN':
      closeChain(s);
      break;
    case 'MISTAKE':
      s.mistakes++;
      closeChain(s);
      break;
    case 'HINT_USED':
      s.hints++;
      break;
    case 'ASSIST_ENABLED':
      s.assisted = true;
      break;
    case 'GUIDES_USED':
      s.guided = true;
      break;
    case 'PUZZLE_COMPLETED':
      closeChain(s);
      if (!s.final) s.final = finalize(s, ev.elapsed);
      break;
    default: {
      const unhandled: never = ev;
      void unhandled;
    }
  }
  return awards;
}

/** Penalty multipliers as integers out of 10 (§15). */
function penalties(s: ScoreState) {
  const a10 = Math.max(0, 10 - RULES.mistakeStep10 * s.mistakes);
  const h10 = Math.max(0, 10 - RULES.hintStep10 * s.hints);
  const s10 = s.assisted ? RULES.assist10 : 10;
  const g10 = s.guided ? RULES.guides10 : 10;
  const m10 = mode(s.mode).mul10;
  return { a10, h10, s10, g10, m10, apply: (raw: number) => Math.max(0, Math.floor((raw * a10 * h10 * s10 * g10 * m10) / 100000)) };
}

/** TimeBonus = 0.5 × Completion × clamp((2·Par − t) / (1.5·Par), 0, 1), floored (§14). */
export function timeBonus(tier: number, elapsed: number): number {
  const C = RULES.completion[tier], P = RULES.par[tier];
  const num = Math.max(0, Math.min(3 * P, 4 * P - 2 * elapsed));
  return Math.floor((C * num) / (6 * P));
}

/** Share of the speed rewards (time bonus, chains) an attempt keeps: all, or half once guided. */
const speedShare = (s: ScoreState, pts: number) => (s.guided ? Math.floor((pts * RULES.guidedSpeedPct) / 100) : pts);

export function finalize(s: ScoreState, elapsed: number): FinalScore {
  const completion = RULES.completion[s.tier];
  const timeEarned = timeBonus(s.tier, elapsed);
  const time = speedShare(s, timeEarned);
  const nonChain = s.placementPts + s.regionPts + s.multiPts + completion + time;
  // The 35% cap applies after the Guided reduction.
  const chainCap = Math.floor((nonChain * RULES.chainCapPct) / (100 - RULES.chainCapPct));
  const chain = Math.min(speedShare(s, s.chainEarned), chainCap);
  const raw = nonChain + chain;
  const p = penalties(s);
  return {
    v: RULES.version,
    placement: s.placementPts, region: s.regionPts, multi: s.multiPts,
    chainEarned: s.chainEarned, chain, completion, timeEarned, time, guidedSpeed: s.guided, raw,
    A: p.a10 / 10, H: p.h10 / 10, S: p.s10 / 10, G: p.g10 / 10, M: p.m10 / 10,
    total: p.apply(raw),
  };
}

/** Provisional score during play: no completion or time bonus, chain bonus not yet capped (§16.1). */
export function live(s: ScoreState): number {
  if (s.final) return s.final.total;
  return penalties(s).apply(s.placementPts + s.regionPts + s.multiPts + speedShare(s, s.chainEarned));
}

/**
 * Roughly what the next placement would add to the Universal Chain at default points,
 * before any pattern bonus. Chain indicator only.
 */
export function nextChainGain(s: ScoreState, extraPts = RULES.placementDefault): number {
  const c = s.chain;
  if (!c || !chainsEnabled(s.mode)) return 0;
  const v = chainValue(c.allPoints + extraPts, c.length + 1, s.tier);
  return Math.max(0, v - (s.runs[c.run] || 0));
}

/** Rebuilds a state from an event log, so any score can be reproduced (§24.4). */
export function replay(init: { tier: number; mode: ModeId }, events: GameEvent[]): ScoreState {
  const s = create(init);
  for (const ev of events) apply(s, ev);
  return s;
}
