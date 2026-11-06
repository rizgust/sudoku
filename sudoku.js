/* Sudoku engine: solver, generator and board helpers. No dependencies. */
const Sudoku = (() => {
  'use strict';

  const ROW = new Uint8Array(81);
  const COL = new Uint8Array(81);
  const BOX = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    ROW[i] = (i / 9) | 0;
    COL[i] = i % 9;
    BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
  }

  const ROWS = [], COLS = [], BOXES = [];
  for (let u = 0; u < 9; u++) { ROWS.push([]); COLS.push([]); BOXES.push([]); }
  for (let i = 0; i < 81; i++) {
    ROWS[ROW[i]].push(i);
    COLS[COL[i]].push(i);
    BOXES[BOX[i]].push(i);
  }
  const UNITS = [...ROWS, ...COLS, ...BOXES];

  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) {
      if (j !== i && (ROW[i] === ROW[j] || COL[i] === COL[j] || BOX[i] === BOX[j])) p.push(j);
    }
    PEERS.push(p);
  }

  const ALL = 0x3fe; // bits 1..9
  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function popcount(m) {
    let c = 0;
    while (m) { m &= m - 1; c++; }
    return c;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function makeMasks(g) {
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const b = 1 << v;
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & b) return null;
      rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
    }
    return { rows, cols, boxes };
  }

  /**
   * Backtracking solver (most-constrained-cell first).
   * Stops after `limit` solutions. Returns { count, solution }.
   */
  function solve(grid, limit = 2, randomize = false) {
    const g = Array.from(grid);
    const masks = makeMasks(g);
    if (!masks) return { count: 0, solution: null };
    const { rows, cols, boxes } = masks;
    let count = 0;
    let solution = null;

    (function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
        const n = popcount(m);
        if (n < bestN) {
          best = i; bestMask = m; bestN = n;
          if (n <= 1) break;
        }
      }
      if (best < 0) {
        count++;
        if (!solution) solution = g.slice();
        return;
      }
      if (bestN === 0) return;
      const r = ROW[best], c = COL[best], bx = BOX[best];
      const order = randomize ? shuffle(DIGITS.slice()) : DIGITS;
      for (const d of order) {
        const b = 1 << d;
        if (!(bestMask & b)) continue;
        g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        rec();
        g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
        if (count >= limit) return;
      }
    })();

    return { count, solution };
  }

  /** True if the puzzle can be finished using only naked and hidden singles. */
  function solvableBySingles(grid) {
    const g = Array.from(grid);
    const masks = makeMasks(g);
    if (!masks) return false;
    const { rows, cols, boxes } = masks;
    const cand = (i) => ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
    const place = (i, d) => {
      const b = 1 << d;
      g[i] = d; rows[ROW[i]] |= b; cols[COL[i]] |= b; boxes[BOX[i]] |= b;
    };

    let remaining = g.filter((v) => !v).length;
    while (remaining) {
      let progress = false;

      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = cand(i);
        if (!m) return false;
        if ((m & (m - 1)) === 0) {
          place(i, 31 - Math.clz32(m));
          remaining--; progress = true;
        }
      }

      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          const b = 1 << d;
          let pos = -1, n = 0;
          for (const i of unit) {
            if (g[i] === d) { n = -1; break; }
            if (!g[i] && (cand(i) & b)) { n++; pos = i; }
          }
          if (n === 1) { place(pos, d); remaining--; progress = true; }
        }
      }

      if (!progress) return false;
    }
    return true;
  }

  const CLUES = { easy: 40, medium: 33, hard: 28, expert: 23 };

  function carve(solution, target, singlesOnly) {
    const puzzle = solution.slice();
    let clues = 81;

    const tryRemove = (idxs) => {
      const saved = idxs.map((i) => puzzle[i]);
      idxs.forEach((i) => { puzzle[i] = 0; });
      // A puzzle solvable by singles alone necessarily has a unique solution.
      const ok = singlesOnly ? solvableBySingles(puzzle) : solve(puzzle, 2).count === 1;
      if (ok) clues -= idxs.length;
      else idxs.forEach((i, k) => { puzzle[i] = saved[k]; });
    };

    // Symmetric pairs first for a nicer-looking grid, then single cells to reach the target.
    for (const i of shuffle([...Array(41).keys()])) {
      if (clues <= target) break;
      tryRemove(i === 40 ? [40] : [i, 80 - i]);
    }
    for (const i of shuffle([...Array(81).keys()])) {
      if (clues <= target) break;
      if (puzzle[i]) tryRemove([i]);
    }
    return { puzzle, clues };
  }

  /** Returns { puzzle, solution } as 81-length arrays, 0 = empty. */
  function generate(difficulty = 'medium') {
    const target = CLUES[difficulty] ?? CLUES.medium;
    const singlesOnly = difficulty === 'easy' || difficulty === 'medium';
    const attempts = singlesOnly ? 1 : difficulty === 'hard' ? 8 : 10;
    let best = null;

    for (let a = 0; a < attempts; a++) {
      const solution = solve(new Array(81).fill(0), 1, true).solution;
      const { puzzle, clues } = carve(solution, target, singlesOnly);
      // Hard/expert should need more than simple singles.
      const tooEasy = !singlesOnly && solvableBySingles(puzzle);
      const score = clues + (tooEasy ? 100 : 0);
      if (!best || score < best.score) best = { puzzle, solution, score };
      if (clues <= target && !tooEasy) break;
    }
    return { puzzle: best.puzzle, solution: best.solution };
  }

  return { generate, solve, solvableBySingles, ROW, COL, BOX, ROWS, COLS, BOXES, PEERS, CLUES };
})();

if (typeof module !== 'undefined') module.exports = Sudoku;
