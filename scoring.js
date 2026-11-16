/* Scoring engine (docs/formula-score-00.md §7–16).

   It consumes validated gameplay events and never sees or changes the board:
     NUMBER_PLACED    { id, cell, technique? }   first correct fill of a cell by the player
     CELL_REVEALED    { cell }                   a hint filled the cell: no placement points
     REGION_COMPLETED { regions: ['r0','c4','b1'] } regions completed by one board change
     CHAIN_EXTENDED   { run, patterns: [{ type, ids, firstT }] }  from the chain detector
     CHAIN_BROKEN     {}                         interruption
     MISTAKE / HINT_USED / ASSIST_ENABLED        penalty events
     PUZZLE_COMPLETED { elapsed }                elapsed in seconds

   apply(state, event) updates the state and returns the awards to show. The state is plain
   JSON, so it is saved with the game, and replay(events) rebuilds it from the event log.
   All arithmetic is integer: multipliers are stored as hundredths or tenths. */
const Scoring = (() => {
  'use strict';

  // Every tunable number lives here (§29). Bump `version` whenever a value changes;
  // each finished attempt stores the version it was scored with.
  const RULES = {
    version: 1,
    // Indexed by tier id (1 Beginner … 6 Master).
    completion: [0, 1000, 2500, 5000, 10000, 20000, 40000],
    par: [0, 300, 480, 720, 1080, 1500, 2100],
    chainWindowMs: [0, 30000, 25000, 20000, 15000, 12000, 10000],
    chainMin: 3,
    chainDifficulty10: [0, 10, 12, 15, 20, 25, 30], // ×1.0 … ×3.0, in tenths

    // Placement points by the technique the logical solver says the cell needs (§7.3).
    // No technique attribution exists yet, so every placement uses the default (50).
    placement: {
      nakedSingle: 50, hiddenSingle: 75, lockedCandidates: 100, pair: 125,
      subset: 150, pattern: 175, chain: 200,
    },
    placementDefault: 50,

    region: { r: 300, c: 300, b: 500 },
    multiClear: [0, 0, 200, 400], // by number of regions completed at once

    chainLength100: [100, 100, 100, 130, 150, 180, 200], // by placements; 6+ uses the last
    chainType100: { time: 100, number: 110, row: 115, col: 115, block: 120 },
    // Tie-break when two patterns pay the same: strongest factor first, so results are stable.
    chainPriority: ['block', 'row', 'col', 'number', 'time'],
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
    },
  };

  const TYPE_NAMES = { time: 'Time', number: 'Number', row: 'Line', col: 'Line', block: 'Block' };
  const REGION_NAMES = { r: 'Row', c: 'Column', b: 'Block' };
  const MULTI_NAMES = { 2: 'Double Clear', 3: 'Triple Clear' };
  const TECH_NAMES = {
    nakedSingle: 'Naked Single', hiddenSingle: 'Hidden Single', lockedCandidates: 'Locked Candidates',
    pair: 'Pair', subset: 'Advanced Subset', pattern: 'Advanced Pattern', chain: 'Logical Chain',
  };

  const mode = (m) => RULES.modes[m] || RULES.modes.classic;
  const chainsEnabled = (m) => mode(m).chains;
  const chainWindowMs = (tier) => RULES.chainWindowMs[tier];
  const lengthMul100 = (n) => RULES.chainLength100[Math.min(n, RULES.chainLength100.length - 1)];

  function create({ tier, mode: m }) {
    return {
      v: RULES.version, tier, mode: m,
      cells: new Array(81).fill(0),  // 1 once a cell has been credited (or revealed)
      regions: {},                   // credited region keys
      pts: {},                       // placement id → placement points
      placementPts: 0, regionPts: 0, multiPts: 0, chainEarned: 0,
      mistakes: 0, hints: 0, assisted: false,
      runs: {},                      // chain run → highest value already awarded
      chain: null,                   // the chain currently on display
      stats: {
        rows: 0, cols: 0, blocks: 0, double: 0, triple: 0,
        chains: 0, byType: { time: 0, number: 0, block: 0, line: 0, hybrid: 0 },
        longest: 0, bestChain: 0,
      },
      runTypes: {},                  // types already counted for the current run
      final: null,
    };
  }

  /** ChainBonus = points × (Length × Type − 1) × Difficulty, floored (§11.4). */
  function chainValue(points, length, type, tier) {
    const lt = lengthMul100(length) * RULES.chainType100[type] - 10000;
    if (lt <= 0) return 0;
    return Math.floor((points * lt * RULES.chainDifficulty10[tier]) / 100000);
  }

  /** Scores every qualifying pattern and returns the best one, with the Hybrid bonus. */
  function bestChain(s, patterns) {
    let best = null;
    for (const p of patterns) {
      const points = p.ids.reduce((sum, id) => sum + (s.pts[id] || 0), 0);
      const value = chainValue(points, p.ids.length, p.type, s.tier);
      const better = !best || value > best.value ||
        (value === best.value && RULES.chainPriority.indexOf(p.type) < RULES.chainPriority.indexOf(best.type));
      if (better) best = { type: p.type, length: p.ids.length, firstT: p.firstT, points, value };
    }
    // Hybrid: Time plus at least two distinct other categories (row and column are both Line).
    const cats = new Set(patterns.filter((p) => p.type !== 'time').map((p) => TYPE_NAMES[p.type]));
    best.hybrid = patterns.some((p) => p.type === 'time') && cats.size >= 2;
    best.hybridValue = best.hybrid ? Math.floor((best.value * RULES.hybridPct) / 100) : 0;
    best.total = best.value + best.hybridValue;
    best.mul100 = lengthMul100(best.length);
    return best;
  }

  const chainLabel = (c) => `${c.hybrid ? 'Hybrid ' : ''}${TYPE_NAMES[c.type]} Chain ×${(c.mul100 / 100).toFixed(1)}`;

  function apply(s, ev) {
    if (s.final && ev.type !== 'PUZZLE_COMPLETED') return [];
    const awards = [];
    switch (ev.type) {
      case 'NUMBER_PLACED': {
        if (s.cells[ev.cell]) break; // a cell earns placement points once per attempt
        s.cells[ev.cell] = 1;
        const known = ev.technique && RULES.placement[ev.technique] != null;
        const pts = known ? RULES.placement[ev.technique] : RULES.placementDefault;
        s.pts[ev.id] = pts;
        s.placementPts += pts;
        awards.push({ kind: 'place', pts, label: known ? TECH_NAMES[ev.technique] : '' });
        break;
      }
      case 'CELL_REVEALED':
        s.cells[ev.cell] = 1;
        s.chain = null;
        break;
      case 'REGION_COMPLETED': {
        const fresh = ev.regions.filter((k) => !s.regions[k]);
        for (const k of fresh) {
          s.regions[k] = 1;
          const pts = RULES.region[k[0]];
          s.regionPts += pts;
          s.stats[{ r: 'rows', c: 'cols', b: 'blocks' }[k[0]]]++;
          awards.push({ kind: 'region', pts, label: `${REGION_NAMES[k[0]]} Complete` });
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
        const c = bestChain(s, ev.patterns);
        if (!s.runs[ev.run]) { s.runTypes = {}; s.stats.chains++; }
        // Incremental accounting: pay only what exceeds the run's best value so far (§12.1).
        const prev = s.runs[ev.run] || 0;
        const inc = Math.max(0, c.total - prev);
        s.runs[ev.run] = Math.max(prev, c.total);
        s.chainEarned += inc;
        const st = s.stats;
        for (const t of [c.type === 'row' || c.type === 'col' ? 'line' : c.type, c.hybrid && 'hybrid']) {
          if (t && !s.runTypes[t]) { s.runTypes[t] = 1; st.byType[t]++; }
        }
        st.longest = Math.max(st.longest, c.length);
        st.bestChain = Math.max(st.bestChain, s.runs[ev.run]);
        s.chain = { run: ev.run, type: c.type, hybrid: c.hybrid, length: c.length, points: c.points, mul100: c.mul100, firstT: c.firstT, label: chainLabel(c) };
        if (inc) awards.push({ kind: 'chain', pts: inc, label: `${chainLabel(c)}!` });
        break;
      }
      case 'CHAIN_BROKEN':
        s.chain = null;
        break;
      case 'MISTAKE':
        s.mistakes++;
        s.chain = null;
        break;
      case 'HINT_USED':
        s.hints++;
        break;
      case 'ASSIST_ENABLED':
        s.assisted = true;
        break;
      case 'PUZZLE_COMPLETED':
        if (!s.final) s.final = finalize(s, ev.elapsed);
        s.chain = null;
        break;
    }
    return awards;
  }

  /** Penalty multipliers as integers out of 10 (§15). */
  function penalties(s) {
    const a10 = Math.max(0, 10 - RULES.mistakeStep10 * s.mistakes);
    const h10 = Math.max(0, 10 - RULES.hintStep10 * s.hints);
    const s10 = s.assisted ? RULES.assist10 : 10;
    const m10 = mode(s.mode).mul10;
    return { a10, h10, s10, m10, apply: (raw) => Math.max(0, Math.floor((raw * a10 * h10 * s10 * m10) / 10000)) };
  }

  /** TimeBonus = 0.5 × Completion × clamp((2·Par − t) / (1.5·Par), 0, 1), floored (§14). */
  function timeBonus(tier, elapsed) {
    const C = RULES.completion[tier], P = RULES.par[tier];
    const num = Math.max(0, Math.min(3 * P, 4 * P - 2 * elapsed));
    return Math.floor((C * num) / (6 * P));
  }

  function finalize(s, elapsed) {
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
  function live(s) {
    if (s.final) return s.final.total;
    return penalties(s).apply(s.placementPts + s.regionPts + s.multiPts + s.chainEarned);
  }

  /**
   * Roughly what the next placement would add if it extends the chain on display with the
   * same pattern and default points (ignores the window sliding). Chain indicator only.
   */
  function nextChainGain(s, extraPts = RULES.placementDefault) {
    const c = s.chain;
    if (!c || !chainsEnabled(s.mode)) return 0;
    const pts = c.points + extraPts;
    let v = chainValue(pts, c.length + 1, c.type, s.tier);
    if (c.hybrid) v += Math.floor((v * RULES.hybridPct) / 100);
    return Math.max(0, v - (s.runs[c.run] || 0));
  }

  /** Rebuilds a state from an event log, so any score can be reproduced (§24.4). */
  function replay(init, events) {
    const s = create(init);
    for (const ev of events) apply(s, ev);
    return s;
  }

  return {
    RULES, create, apply, live, replay, finalize, timeBonus, chainValue,
    chainsEnabled, chainWindowMs, nextChainGain,
  };
})();

if (typeof module !== 'undefined') module.exports = Scoring;
