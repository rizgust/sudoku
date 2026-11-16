/* Scoring engine (docs/formula-score-00.md §7–16).

   It consumes validated gameplay events (see events.ts) and never sees or changes the board.
   apply(state, event) updates the state and returns the awards to show. The state is plain
   JSON, so it is saved with the game, and replay(events) rebuilds it from the event log.
   All arithmetic is integer: multipliers are stored as hundredths or tenths. */
import type { Award, ChainPattern, ChainType, GameEvent, ModeId, PlacementTechnique } from './events.ts';

// Every tunable number lives here (§29). Bump `version` whenever a value changes;
// each finished attempt stores the version it was scored with.
export const RULES = {
  version: 2, // 2: chain windows doubled
  // Indexed by tier id (1 Beginner … 6 Master).
  completion: [0, 1000, 2500, 5000, 10000, 20000, 40000],
  par: [0, 300, 480, 720, 1080, 1500, 2100],
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
  chainType100: { time: 100, number: 110, row: 115, col: 115, block: 120 } satisfies Record<ChainType, number>,
  // Tie-break when two patterns pay the same: strongest factor first, so results are stable.
  chainPriority: ['block', 'row', 'col', 'number', 'time'] as ChainType[],
  // Hybrid = Time + Block + Line (§9.E). In valid Sudoku a Number chain can't share three
  // cells with a Block or Line chain (a digit appears once per unit), so those combinations
  // can never happen; v1 defines Hybrid as the one combination that can.
  hybridPct: 20,
  chainCapPct: 35, // chain bonus ≤ 35% of the raw score

  mistakeStep10: 1, // −10% per mistake
  hintStep10: 2,    // −20% per hint
  assist10: 8,      // ×0.8 once auto-fill candidates were used
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

export interface ChainDisplay {
  run: number;
  type: ChainType;
  hybrid: boolean;
  length: number;
  points: number;
  mul100: number;
  /** Game-clock ms when the chain's window started. */
  startT: number;
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
  chainEarned: number; chain: number; completion: number; time: number; raw: number;
  A: number; H: number; S: number; M: number;
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
  /** Chain id → highest value already awarded. */
  runs: Record<number, number>;
  /** The chain currently on display. */
  chain: ChainDisplay | null;
  /** The open chain's running totals, finalized on close. */
  open: { run: number; types: Partial<Record<ChainStatKey, 1>>; hybrid: boolean; longest: number } | null;
  stats: AttemptStats;
  final: FinalScore | null;
}

const TYPE_NAMES: Record<ChainType, string> = { time: 'Time', number: 'Number', row: 'Line', col: 'Line', block: 'Block' };
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
    mistakes: 0, hints: 0, assisted: false,
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

/** ChainBonus = points × (Length × Type − 1) × Difficulty, floored (§11.4). */
export function chainValue(points: number, length: number, type: ChainType, tier: number): number {
  const lt = lengthMul100(length) * RULES.chainType100[type] - 10000;
  if (lt <= 0) return 0;
  return Math.floor((points * lt * RULES.chainDifficulty10[tier]) / 100000);
}

interface ScoredChain {
  type: ChainType; length: number; firstT: number; points: number; value: number;
  hybrid: boolean; hybridValue: number; total: number; mul100: number;
}

const has = (patterns: ChainPattern[], ...types: ChainType[]) => patterns.some((p) => types.includes(p.type));
const isHybrid = (patterns: ChainPattern[]) => has(patterns, 'time') && has(patterns, 'block') && has(patterns, 'row', 'col');
const statKey = (t: ChainType): ChainStatKey => (t === 'row' || t === 'col' ? 'line' : t);

/** Scores every qualifying pattern and returns the best one, with the Hybrid bonus. */
function bestChain(s: ScoreState, patterns: ChainPattern[]): ScoredChain {
  let best: Pick<ScoredChain, 'type' | 'length' | 'firstT' | 'points' | 'value'> | null = null;
  for (const p of patterns) {
    const points = p.ids.reduce((sum, id) => sum + (s.pts[id] || 0), 0);
    const value = chainValue(points, p.ids.length, p.type, s.tier);
    const better = !best || value > best.value ||
      (value === best.value && RULES.chainPriority.indexOf(p.type) < RULES.chainPriority.indexOf(best.type));
    if (better) best = { type: p.type, length: p.ids.length, firstT: p.firstT, points, value };
  }
  const b = best!;
  const hybrid = isHybrid(patterns);
  const hybridValue = hybrid ? Math.floor((b.value * RULES.hybridPct) / 100) : 0;
  return { ...b, hybrid, hybridValue, total: b.value + hybridValue, mul100: lengthMul100(b.length) };
}

/** Records a finished chain in the attempt stats, once per chain (achievements read these). */
function closeChain(s: ScoreState): void {
  const o = s.open;
  s.open = null;
  s.chain = null;
  if (!o) return;
  const st = s.stats;
  st.chains++;
  for (const t of Object.keys(o.types) as ChainStatKey[]) st.byType[t]++;
  if (o.hybrid) st.byType.hybrid++;
  st.longest = Math.max(st.longest, o.longest);
  st.bestChain = Math.max(st.bestChain, s.runs[o.run] || 0);
}

const chainLabel = (c: { hybrid: boolean; type: ChainType; mul100: number }) =>
  `${c.hybrid ? 'Hybrid ' : ''}${TYPE_NAMES[c.type]} Chain ×${(c.mul100 / 100).toFixed(1)}`;

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
      if (!s.open) s.open = { run: ev.run, types: {}, hybrid: false, longest: 0 };
      const c = bestChain(s, ev.patterns);
      // Incremental accounting: pay only what exceeds this chain's best value so far (§12.1).
      const prev = s.runs[ev.run] || 0;
      const inc = Math.max(0, c.total - prev);
      s.runs[ev.run] = Math.max(prev, c.total);
      s.chainEarned += inc;
      const o = s.open;
      for (const p of ev.patterns) o.types[statKey(p.type)] = 1;
      o.hybrid = o.hybrid || c.hybrid;
      const time = ev.patterns.find((p) => p.type === 'time');
      o.longest = Math.max(o.longest, time ? time.ids.length : c.length);
      s.chain = {
        run: ev.run, type: c.type, hybrid: c.hybrid, length: c.length, points: c.points, mul100: c.mul100,
        startT: time ? time.firstT : c.firstT, label: chainLabel(c),
      };
      if (inc) awards.push({ kind: 'chain', pts: inc, label: `${chainLabel(c)}!` });
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
  const m10 = mode(s.mode).mul10;
  return { a10, h10, s10, m10, apply: (raw: number) => Math.max(0, Math.floor((raw * a10 * h10 * s10 * m10) / 10000)) };
}

/** TimeBonus = 0.5 × Completion × clamp((2·Par − t) / (1.5·Par), 0, 1), floored (§14). */
export function timeBonus(tier: number, elapsed: number): number {
  const C = RULES.completion[tier], P = RULES.par[tier];
  const num = Math.max(0, Math.min(3 * P, 4 * P - 2 * elapsed));
  return Math.floor((C * num) / (6 * P));
}

export function finalize(s: ScoreState, elapsed: number): FinalScore {
  const completion = RULES.completion[s.tier];
  const time = timeBonus(s.tier, elapsed);
  const nonChain = s.placementPts + s.regionPts + s.multiPts + completion + time;
  const chainCap = Math.floor((nonChain * RULES.chainCapPct) / (100 - RULES.chainCapPct));
  const chain = Math.min(s.chainEarned, chainCap);
  const raw = nonChain + chain;
  const p = penalties(s);
  return {
    v: RULES.version,
    placement: s.placementPts, region: s.regionPts, multi: s.multiPts,
    chainEarned: s.chainEarned, chain, completion, time, raw,
    A: p.a10 / 10, H: p.h10 / 10, S: p.s10 / 10, M: p.m10 / 10,
    total: p.apply(raw),
  };
}

/** Provisional score during play: no completion or time bonus, chain bonus not yet capped (§16.1). */
export function live(s: ScoreState): number {
  if (s.final) return s.final.total;
  return penalties(s).apply(s.placementPts + s.regionPts + s.multiPts + s.chainEarned);
}

/**
 * Roughly what the next placement would add if it extends the chain on display with the
 * same pattern and default points. Chain indicator only.
 */
export function nextChainGain(s: ScoreState, extraPts = RULES.placementDefault): number {
  const c = s.chain;
  if (!c || !chainsEnabled(s.mode)) return 0;
  let v = chainValue(c.points + extraPts, c.length + 1, c.type, s.tier);
  if (c.hybrid) v += Math.floor((v * RULES.hybridPct) / 100);
  return Math.max(0, v - (s.runs[c.run] || 0));
}

/** Rebuilds a state from an event log, so any score can be reproduced (§24.4). */
export function replay(init: { tier: number; mode: ModeId }, events: GameEvent[]): ScoreState {
  const s = create(init);
  for (const ev of events) apply(s, ev);
  return s;
}
