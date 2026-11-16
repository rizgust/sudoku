/* Chain detection. Part of the game engine, not the scoring engine: it watches validated,
   eligible placements and reports which chain patterns the newest placement completes.
   It knows nothing about points. Scoring consumes its CHAIN_EXTENDED reports.

   A chain is a run of consecutive eligible placements inside a sliding time window. For each
   placement we take the longest suffix of recent placements whose first placement is within
   the window (the Time chain), then the longest suffix of that sharing the newest placement's
   digit, block, row or column. Any of those with at least `min` placements qualifies.

   State is plain JSON so it can be saved with the game. */
const Chains = (() => {
  'use strict';

  // Pattern types and the placement attribute each one requires to be shared.
  const PATTERNS = [
    ['number', 'digit'],
    ['block', 'block'],
    ['row', 'row'],
    ['col', 'col'],
  ];

  /** Fresh detector state. `run` counts chain runs; a run lasts while placements keep qualifying. */
  const create = () => ({ run: 0, active: false, recent: [] });

  /** Any interruption (mistake, hint, clearing a credited cell, undo, end of attempt). */
  function reset(cs) {
    cs.recent = [];
    cs.active = false;
  }

  /**
   * Observes one eligible placement { id, cell, digit, row, col, block, t } where t is the
   * game clock in ms (paused time excluded). Returns null if nothing qualifies, otherwise
   * { run, patterns: [{ type, ids, firstT }] } with 'time' first.
   */
  function observe(cs, p, { windowMs, min }) {
    // Times are monotonic, so placements inside the window always form a suffix.
    const recent = cs.recent.filter((x) => p.t - x.t <= windowMs);
    recent.push(p);
    cs.recent = recent;

    if (recent.length < min) { cs.active = false; return null; }
    if (!cs.active) { cs.run++; cs.active = true; }

    const patterns = [{ type: 'time', ids: recent.map((x) => x.id), firstT: recent[0].t }];
    for (const [type, key] of PATTERNS) {
      let k = recent.length - 1;
      while (k > 0 && recent[k - 1][key] === p[key]) k--;
      const seq = recent.slice(k);
      if (seq.length >= min) patterns.push({ type, ids: seq.map((x) => x.id), firstT: seq[0].t });
    }
    return { run: cs.run, patterns };
  }

  return { create, reset, observe };
})();

if (typeof module !== 'undefined') module.exports = Chains;
