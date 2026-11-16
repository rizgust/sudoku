/* Chain detection. Part of the game engine, not the scoring engine: it watches validated,
   eligible placements and reports which chain patterns the newest placement completes.
   It knows nothing about points. Scoring consumes its reports as events.

   Lifecycle (two phases):
   - Forming: placements slide through the time window. Expired placements drop off the front,
     so an old placement can't block a new chain. Once `min` placements fit inside the window,
     the chain opens with a new id.
   - Open: the window is anchored at the chain's first placement and doesn't slide. Placements
     inside it extend the chain. The first placement (or clock tick) past the window closes it,
     and that placement starts forming the next chain. A closed chain's placements never count
     toward a later chain, so steady play earns a series of separate chains.

   For an open chain, each pattern's sequence is the longest suffix of the chain's placements
   that shares the newest placement's digit, block, row or column. The Time pattern is the whole
   chain. Any sequence with at least `min` placements qualifies.

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

  /** Fresh detector state. `run` is the id of the latest chain. */
  const create = () => ({ run: 0, active: false, recent: [] });

  /**
   * Ends the current chain because of an interruption (mistake, hint, clearing a credited
   * cell, undo, end of attempt). Returns { run } if an open chain was closed.
   */
  function reset(cs) {
    const closed = cs.active ? { run: cs.run } : null;
    cs.recent = [];
    cs.active = false;
    return closed;
  }

  /**
   * Advances the clock to t (ms of game time). Closes an open chain whose window has passed
   * and returns { run }; while forming, drops placements that fell out of the window.
   */
  function expire(cs, t, { windowMs }) {
    if (!cs.recent.length || t - cs.recent[0].t <= windowMs) return null;
    if (cs.active) return reset(cs);
    cs.recent = cs.recent.filter((x) => t - x.t <= windowMs);
    return null;
  }

  /**
   * Observes one eligible placement { id, cell, digit, row, col, block, t }, t being the game
   * clock in ms (paused time excluded). Returns
   *   { closed: { run } | null, chain: { run, patterns: [{ type, ids, firstT }] } | null }
   * where `closed` is a chain this placement's arrival ended (its window had passed).
   */
  function observe(cs, p, opts) {
    const closed = expire(cs, p.t, opts);
    cs.recent.push(p);
    const recent = cs.recent;
    if (recent.length < opts.min) return { closed, chain: null };
    if (!cs.active) { cs.run++; cs.active = true; }

    const patterns = [{ type: 'time', ids: recent.map((x) => x.id), firstT: recent[0].t }];
    for (const [type, key] of PATTERNS) {
      let k = recent.length - 1;
      while (k > 0 && recent[k - 1][key] === p[key]) k--;
      const seq = recent.slice(k);
      if (seq.length >= opts.min) patterns.push({ type, ids: seq.map((x) => x.id), firstT: seq[0].t });
    }
    return { closed, chain: { run: cs.run, patterns } };
  }

  return { create, reset, expire, observe };
})();

if (typeof module !== 'undefined') module.exports = Chains;
