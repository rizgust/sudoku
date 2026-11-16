/* Sudoku engine: brute-force solver, human-style logical solver (grading + hints),
   generator and symmetry transforms. No dependencies. Works in browsers and Bun. */

export type Rng = () => number;
/** One board for the logical solver: v[i] is the value (0 = empty), c[i] the candidate mask. */
export interface SolverState { v: Uint8Array; c: Uint16Array }
export type Elim = [cell: number, digit: number];
export interface Step {
  tech: TechId;
  /** Display name when a technique has variants (Skyscraper, 2-String Kite…). */
  name?: string;
  place?: [cell: number, digit: number];
  elims?: Elim[];
  focus: number[];
  text: string;
}
export interface HintStep extends Step { cands: number[] }
export interface Technique { name: string; level: number; desc: string }

// ---------- Geometry ----------

export const ROW = new Uint8Array(81);
export const COL = new Uint8Array(81);
export const BOX = new Uint8Array(81);
for (let i = 0; i < 81; i++) {
  ROW[i] = (i / 9) | 0;
  COL[i] = i % 9;
  BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
}

export const ROWS: number[][] = [], COLS: number[][] = [], BOXES: number[][] = [];
for (let u = 0; u < 9; u++) { ROWS.push([]); COLS.push([]); BOXES.push([]); }
for (let i = 0; i < 81; i++) {
  ROWS[ROW[i]].push(i);
  COLS[COL[i]].push(i);
  BOXES[BOX[i]].push(i);
}
// Boxes first: hidden singles in a box are the easiest thing to spot.
export const UNITS = [...BOXES, ...ROWS, ...COLS];
const UNIT_NAMES = [
  ...BOXES.map((_, k) => `box ${k + 1}`),
  ...ROWS.map((_, k) => `row ${k + 1}`),
  ...COLS.map((_, k) => `column ${k + 1}`),
];

export const PEERS: number[][] = [];
const SEES: Set<number>[] = []; // SEES[i] is a Set of peers, for fast lookups
for (let i = 0; i < 81; i++) {
  const p: number[] = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW[i] === ROW[j] || COL[i] === COL[j] || BOX[i] === BOX[j])) p.push(j);
  }
  PEERS.push(p);
  SEES.push(new Set(p));
}
const sees = (a: number, b: number) => SEES[a].has(b);

const ALL = 0x3fe; // bits 1..9
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function popcount(m: number): number {
  let c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
}
const bitDigit = (m: number) => 31 - Math.clz32(m);
export function digitsOf(m: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d);
  return out;
}
export const cellName = (i: number) => `R${ROW[i] + 1}C${COL[i] + 1}`;
const listCells = (cells: number[]) => cells.map(cellName).join(', ');
const listDigits = (ds: number[]) => ds.join('/');

function combos<T>(arr: T[], k: number, start = 0, acc: T[] = [], out: T[][] = []): T[][] {
  if (acc.length === k) { out.push(acc.slice()); return out; }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    combos(arr, k, i + 1, acc, out);
    acc.pop();
  }
  return out;
}

// ---------- Random ----------

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function shuffle<T>(a: T[], rnd: Rng = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Brute-force solver ----------

function makeMasks(g: number[]) {
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

/** Backtracking solver (most-constrained cell first). Stops after `limit` solutions. */
export function solve(grid: ArrayLike<number>, limit = 2, rnd: Rng | null = null): { count: number; solution: number[] | null } {
  const g = Array.from(grid);
  const masks = makeMasks(g);
  if (!masks) return { count: 0, solution: null };
  const { rows, cols, boxes } = masks;
  let count = 0;
  let solution: number[] | null = null;

  (function rec(): void {
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
    const order = rnd ? shuffle(DIGITS.slice(), rnd) : DIGITS;
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

// ---------- Logical solver ----------
//
// Each technique looks at a state { v: values[81], c: candidate masks[81] } and returns
// either null or a step: { tech, place?: [i, d], elims?: [[i, d], ...], focus: [cells],
// text }. Grading applies the easiest available step repeatedly; a puzzle's tier is the
// highest level of any technique it needed.

export const TECHNIQUES = {
  fullHouse:     { name: 'Full House',          level: 1, desc: 'A row, column or box has only one empty cell left, so it takes the one missing digit.' },
  hiddenSingle:  { name: 'Hidden Single',       level: 1, desc: 'Scan a box, row or column: if a digit fits in only one of its cells, it goes there.' },
  nakedSingle:   { name: 'Naked Single',        level: 2, desc: 'Eliminate every digit already seen by a cell’s row, column and box. If only one digit is left, that is the answer.' },
  pointing:      { name: 'Pointing',            level: 3, desc: 'Inside a box, a digit is confined to one row (or column). It must be in that box, so it can be removed from the rest of that row or column.' },
  claiming:      { name: 'Claiming',            level: 3, desc: 'Inside a row or column, a digit is confined to one box. It can be removed from the other cells of that box.' },
  nakedPair:     { name: 'Naked Pair',          level: 3, desc: 'Two cells in a unit hold the same two candidates. Those two digits must go in those two cells, so remove them from the rest of the unit.' },
  hiddenPair:    { name: 'Hidden Pair',         level: 3, desc: 'Two digits can only go in the same two cells of a unit. Those cells can drop every other candidate.' },
  nakedTriple:   { name: 'Naked Triple',        level: 4, desc: 'Three cells in a unit hold only three digits between them. Remove those digits from the rest of the unit.' },
  hiddenTriple:  { name: 'Hidden Triple',       level: 4, desc: 'Three digits are confined to the same three cells of a unit. Those cells can drop every other candidate.' },
  turbotFish:    { name: 'Skyscraper / Kite',   level: 4, desc: 'Two strong links on one digit, joined by a weak link. One of the two far ends must hold the digit, so any cell seeing both ends cannot.' },
  xyWing:        { name: 'XY-Wing',             level: 4, desc: 'A pivot cell {X,Y} sees two wings {X,Z} and {Y,Z}. Whatever the pivot is, one wing becomes Z, so cells seeing both wings cannot be Z.' },
  xWing:         { name: 'X-Wing',              level: 5, desc: 'A digit appears exactly twice in each of two rows, in the same two columns. It must take opposite corners, so remove it from the rest of those columns (or rows).' },
  swordfish:     { name: 'Swordfish',           level: 5, desc: 'An X-Wing across three rows and three columns: the digit is confined to three columns within three rows, so remove it from the rest of those columns.' },
  nakedQuad:     { name: 'Naked Quad',          level: 5, desc: 'Four cells in a unit hold only four digits between them. Remove those digits from the rest of the unit.' },
  hiddenQuad:    { name: 'Hidden Quad',         level: 5, desc: 'Four digits are confined to the same four cells of a unit. Those cells can drop every other candidate.' },
  xyzWing:       { name: 'XYZ-Wing',            level: 5, desc: 'A pivot {X,Y,Z} sees wings {X,Z} and {Y,Z}. One of the three must be Z, so cells seeing all three cannot be Z.' },
  wWing:         { name: 'W-Wing',              level: 5, desc: 'Two identical pairs {X,Y} are connected by a strong link on Y. One of the pair cells must be X, so cells seeing both cannot be X.' },
  uniqueRect:    { name: 'Unique Rectangle',    level: 5, desc: 'Three corners of a rectangle hold the same pair {X,Y}. If the fourth did too, the puzzle would have two solutions, so the fourth corner cannot be X or Y.' },
  jellyfish:     { name: 'Jellyfish',           level: 6, desc: 'The four-row version of the X-Wing: a digit confined to four columns within four rows can be removed from the rest of those columns.' },
  xChain:        { name: 'X-Chain',             level: 6, desc: 'A chain of alternating strong and weak links on one digit. One end of the chain must be true, so cells seeing both ends lose the digit.' },
  xyChain:       { name: 'XY-Chain',            level: 6, desc: 'A chain of two-candidate cells, each linked to the next by a shared digit. Either the first or last cell is Z, so cells seeing both lose Z.' },
} satisfies Record<string, Technique>;
export type TechId = keyof typeof TECHNIQUES;

export function initState(values: ArrayLike<number>): SolverState {
  const v = Uint8Array.from(values);
  const c = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (v[i]) continue;
    let m = ALL;
    for (const p of PEERS[i]) if (v[p]) m &= ~(1 << v[p]);
    c[i] = m;
  }
  return { v, c };
}

export function applyStep(s: SolverState, step: Step): void {
  if (step.place) {
    const [i, d] = step.place;
    s.v[i] = d;
    s.c[i] = 0;
    for (const p of PEERS[i]) s.c[p] &= ~(1 << d);
  }
  if (step.elims) for (const [i, d] of step.elims) s.c[i] &= ~(1 << d);
}

// Cells in `unit` (empty) that still allow digit d.
const where = (s: SolverState, unit: number[], d: number) => unit.filter((i) => !s.v[i] && (s.c[i] & (1 << d)));

function elimsFromCells(s: SolverState, cells: number[], d: number, exclude: number[]): Elim[] {
  const out: Elim[] = [];
  for (const i of cells) {
    if (!s.v[i] && (s.c[i] & (1 << d)) && !exclude.includes(i)) out.push([i, d]);
  }
  return out;
}

function commonPeers(cells: number[]): number[] {
  let set: number[] | null = null;
  for (const i of cells) {
    const p = PEERS[i];
    set = set ? set.filter((x) => SEES[i].has(x)) : p.slice();
  }
  return (set || []).filter((x) => !cells.includes(x));
}

function describeElims(elims: Elim[]): string {
  const byDigit = new Map<number, number[]>();
  for (const [i, d] of elims) {
    if (!byDigit.has(d)) byDigit.set(d, []);
    byDigit.get(d)!.push(i);
  }
  return [...byDigit].map(([d, cs]) => `${d} from ${listCells(cs)}`).join('; ');
}

// --- Level 1-2: singles ---

function fullHouse(s: SolverState): Step | null {
  for (let u = 0; u < 27; u++) {
    const empty = UNITS[u].filter((i) => !s.v[i]);
    if (empty.length !== 1) continue;
    const i = empty[0];
    const d = bitDigit(s.c[i]);
    if (!d || popcount(s.c[i]) !== 1) continue;
    return { tech: 'fullHouse', place: [i, d], focus: UNITS[u], text: `${UNIT_NAMES[u][0].toUpperCase() + UNIT_NAMES[u].slice(1)} has only one empty cell, ${cellName(i)}. The missing digit is ${d}.` };
  }
  return null;
}

function hiddenSingle(s: SolverState): Step | null {
  for (let u = 0; u < 27; u++) {
    const unit = UNITS[u];
    for (let d = 1; d <= 9; d++) {
      if (unit.some((i) => s.v[i] === d)) continue;
      const cs = where(s, unit, d);
      if (cs.length === 1) {
        return { tech: 'hiddenSingle', place: [cs[0], d], focus: unit, text: `In ${UNIT_NAMES[u]}, ${d} can only go in ${cellName(cs[0])}: every other empty cell already sees a ${d}.` };
      }
    }
  }
  return null;
}

function nakedSingle(s: SolverState): Step | null {
  for (let i = 0; i < 81; i++) {
    if (s.v[i] || popcount(s.c[i]) !== 1) continue;
    const d = bitDigit(s.c[i]);
    return { tech: 'nakedSingle', place: [i, d], focus: [i], text: `${cellName(i)} has only one candidate left: ${d}. Every other digit is already in its row, column or box (or was ruled out).` };
  }
  return null;
}

// --- Level 3: locked candidates, pairs ---

function lockedCandidates(s: SolverState): Step | null {
  // Pointing: box -> row/col
  for (let b = 0; b < 9; b++) {
    for (let d = 1; d <= 9; d++) {
      const cs = where(s, BOXES[b], d);
      if (cs.length < 2) continue;
      const r = ROW[cs[0]], c = COL[cs[0]];
      if (cs.every((i) => ROW[i] === r)) {
        const elims = elimsFromCells(s, ROWS[r], d, cs);
        if (elims.length) return { tech: 'pointing', elims, focus: cs, text: `In box ${b + 1}, ${d} can only be in row ${r + 1} (${listCells(cs)}). So ${d} can be removed from the rest of row ${r + 1}: ${listCells(elims.map((e) => e[0]))}.` };
      }
      if (cs.every((i) => COL[i] === c)) {
        const elims = elimsFromCells(s, COLS[c], d, cs);
        if (elims.length) return { tech: 'pointing', elims, focus: cs, text: `In box ${b + 1}, ${d} can only be in column ${c + 1} (${listCells(cs)}). So ${d} can be removed from the rest of column ${c + 1}: ${listCells(elims.map((e) => e[0]))}.` };
      }
    }
  }
  // Claiming: row/col -> box
  for (let u = 9; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const cs = where(s, UNITS[u], d);
      if (cs.length < 2) continue;
      const b = BOX[cs[0]];
      if (!cs.every((i) => BOX[i] === b)) continue;
      const elims = elimsFromCells(s, BOXES[b], d, cs);
      if (elims.length) return { tech: 'claiming', elims, focus: cs, text: `In ${UNIT_NAMES[u]}, ${d} can only be in box ${b + 1} (${listCells(cs)}). So ${d} can be removed from the rest of box ${b + 1}: ${listCells(elims.map((e) => e[0]))}.` };
    }
  }
  return null;
}

const SUBSET_NAMES: Record<number, string> = { 2: 'Pair', 3: 'Triple', 4: 'Quad' };

function nakedSubset(s: SolverState, n: number): Step | null {
  const tech = `naked${SUBSET_NAMES[n]}` as TechId;
  for (let u = 0; u < 27; u++) {
    const empty = UNITS[u].filter((i) => !s.v[i] && popcount(s.c[i]) >= 2 && popcount(s.c[i]) <= n);
    if (empty.length < n) continue;
    for (const set of combos(empty, n)) {
      let m = 0;
      for (const i of set) m |= s.c[i];
      if (popcount(m) !== n) continue;
      const elims: Elim[] = [];
      for (const i of UNITS[u]) {
        if (s.v[i] || set.includes(i)) continue;
        for (const d of digitsOf(s.c[i] & m)) elims.push([i, d]);
      }
      if (elims.length) {
        const ds = listDigits(digitsOf(m));
        return { tech, elims, focus: set, text: `In ${UNIT_NAMES[u]}, ${listCells(set)} only hold ${ds} between them. Those ${n} digits must go in those ${n} cells, so remove ${describeElims(elims)}.` };
      }
    }
  }
  return null;
}

function hiddenSubset(s: SolverState, n: number): Step | null {
  const tech = `hidden${SUBSET_NAMES[n]}` as TechId;
  for (let u = 0; u < 27; u++) {
    const unit = UNITS[u];
    const free = DIGITS.filter((d) => !unit.some((i) => s.v[i] === d));
    if (free.length <= n) continue;
    const pos: Record<number, number[]> = {};
    for (const d of free) pos[d] = where(s, unit, d);
    const cand = free.filter((d) => pos[d].length >= 1 && pos[d].length <= n);
    for (const ds of combos(cand, n)) {
      const cells = [...new Set(ds.flatMap((d) => pos[d]))];
      if (cells.length !== n) continue;
      const keep = ds.reduce((m, d) => m | (1 << d), 0);
      const elims: Elim[] = [];
      for (const i of cells) for (const d of digitsOf(s.c[i] & ~keep)) elims.push([i, d]);
      if (elims.length) {
        return { tech, elims, focus: cells, text: `In ${UNIT_NAMES[u]}, ${listDigits(ds)} can only go in ${listCells(cells)}. Those cells must hold exactly those digits, so remove ${describeElims(elims)}.` };
      }
    }
  }
  return null;
}

// --- Fish (X-Wing, Swordfish, Jellyfish) ---

const FISH: Record<number, TechId> = { 2: 'xWing', 3: 'swordfish', 4: 'jellyfish' };

function fish(s: SolverState, n: number): Step | null {
  for (const byRow of [true, false]) {
    const bases = byRow ? ROWS : COLS;
    const covers = byRow ? COLS : ROWS;
    const coord = byRow ? COL : ROW;
    const bName = byRow ? 'row' : 'column', cName = byRow ? 'column' : 'row';
    for (let d = 1; d <= 9; d++) {
      const lines: { k: number; cs: number[] }[] = [];
      for (let k = 0; k < 9; k++) {
        const cs = where(s, bases[k], d);
        if (cs.length >= 2 && cs.length <= n) lines.push({ k, cs });
      }
      if (lines.length < n) continue;
      for (const set of combos(lines, n)) {
        const coverIdx = new Set<number>();
        for (const l of set) for (const i of l.cs) coverIdx.add(coord[i]);
        if (coverIdx.size !== n) continue;
        const baseCells = set.flatMap((l) => l.cs);
        const elims: Elim[] = [];
        for (const ci of coverIdx) elims.push(...elimsFromCells(s, covers[ci], d, baseCells));
        if (elims.length) {
          const and = (xs: number[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : String(xs[0]);
          const bs = and(set.map((l) => l.k + 1));
          const cvs = and([...coverIdx].sort((x, y) => x - y).map((x) => x + 1));
          return { tech: FISH[n], elims, focus: baseCells, text: `In ${bName}s ${bs}, the ${d}s can only go in ${cName}s ${cvs}. Each of those ${cName}s gets its ${d} from these ${bName}s, so remove ${d} from the rest of ${cName}s ${cvs}: ${listCells(elims.map((e) => e[0]))}.` };
        }
      }
    }
  }
  return null;
}

// --- Strong links (conjugate pairs) for a digit ---

function strongLinks(s: SolverState, d: number): [number, number, number][] {
  const links: [number, number, number][] = [];
  for (let u = 0; u < 27; u++) {
    const cs = where(s, UNITS[u], d);
    if (cs.length === 2) links.push([cs[0], cs[1], u]);
  }
  return links;
}

// --- X-Chains (single digit). maxStrong=2 covers Skyscraper / 2-String Kite / Turbot. ---
// Breadth-first over (cell, parity) so the shortest chain is found without blowing up.

interface XNode { cell: number; on: boolean; strong: number; prev: XNode | null }

function xChain(s: SolverState, minStrong: number, maxStrong: number, tech: TechId): Step | null {
  let best = null as { path: number[]; elims: Elim[]; d: number } | null;
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(s, d);
    if (links.length < minStrong) continue;
    const strongAdj = new Map<number, Set<number>>();
    for (const [a, b] of links) {
      if (!strongAdj.has(a)) strongAdj.set(a, new Set());
      if (!strongAdj.has(b)) strongAdj.set(b, new Set());
      strongAdj.get(a)!.add(b); strongAdj.get(b)!.add(a);
    }
    const nodes = [...strongAdj.keys()];
    for (const start of nodes) {
      const seen = new Set([start * 2]);
      let frontier: XNode[] = [{ cell: start, on: false, strong: 0, prev: null }];
      while (frontier.length) {
        const next: XNode[] = [];
        for (const st of frontier) {
          const targets = st.on ? (st.strong < maxStrong ? nodes.filter((w) => w !== st.cell && sees(st.cell, w)) : []) : [...strongAdj.get(st.cell)!];
          for (const t of targets) {
            const key = t * 2 + (st.on ? 0 : 1);
            if (seen.has(key)) continue;
            seen.add(key);
            const ns: XNode = { cell: t, on: !st.on, strong: st.strong + (st.on ? 0 : 1), prev: st };
            next.push(ns);
            if (!ns.on || ns.strong < minStrong || sees(start, t)) continue;
            const path = [];
            for (let p: XNode | null = ns; p; p = p.prev) path.unshift(p.cell);
            if (new Set(path).size !== path.length) continue;
            if (best && path.length >= best.path.length) continue;
            const inPath = new Set(path);
            const elims = commonPeers([start, t])
              .filter((i) => !inPath.has(i) && !s.v[i] && (s.c[i] & (1 << d)))
              .map((i): Elim => [i, d]);
            if (elims.length) best = { path, elims, d };
          }
        }
        if (best) break; // shortest for this start
        frontier = next;
      }
      if (best && best.path.length === minStrong * 2) break;
    }
    if (best && best.path.length === minStrong * 2) break;
  }
  if (!best) return null;
  const { path, elims, d } = best as { path: number[]; elims: Elim[]; d: number };
  const a = path[0], z = path[path.length - 1];
  let name = 'X-Chain';
  if (tech === 'turbotFish') {
    const kind = (p: number, q: number) => (ROW[p] === ROW[q] ? 'row' : COL[p] === COL[q] ? 'col' : 'box');
    const k1 = kind(path[0], path[1]), k2 = kind(path[2], path[3]);
    name = k1 === k2 && k1 !== 'box' ? 'Skyscraper' : (k1 !== 'box' && k2 !== 'box' ? '2-String Kite' : 'Turbot Fish');
  }
  const chain = path.map((i, k) => cellName(i) + (k < path.length - 1 ? (k % 2 === 0 ? ' = ' : ' − ') : '')).join('');
  return {
    tech, name, elims, focus: path,
    text: `${name} on ${d}: ${chain} (= means one of the two must be ${d}). If ${cellName(a)} is not ${d}, the links force ${cellName(z)} to be ${d}. One end is always ${d}, so ${listCells(elims.map((e) => e[0]))} cannot be ${d}.`,
  };
}

// --- XY-Wing and XY-Chain (chains of bivalue cells), breadth-first over (cell, digit) ---

interface YNode { cell: number; forced: number; len: number; prev: YNode | null }

function xyChain(s: SolverState, minLen: number, maxLen: number, tech: TechId): Step | null {
  const bivalue: number[] = [];
  for (let i = 0; i < 81; i++) if (!s.v[i] && popcount(s.c[i]) === 2) bivalue.push(i);
  if (bivalue.length < minLen) return null;
  let best = null as { path: number[]; x: number; elims: Elim[] } | null;
  outer:
  for (const start of bivalue) {
    for (const x of digitsOf(s.c[start])) {
      const first = bitDigit(s.c[start] & ~(1 << x)); // start is this if it isn't x
      const seen = new Set([start * 10 + first]);
      let frontier: YNode[] = [{ cell: start, forced: first, len: 1, prev: null }];
      while (frontier.length) {
        const next: YNode[] = [];
        for (const st of frontier) {
          if (st.len >= maxLen) continue;
          for (const n of bivalue) {
            if (n === start || !sees(st.cell, n) || !(s.c[n] & (1 << st.forced))) continue;
            const nf = bitDigit(s.c[n] & ~(1 << st.forced));
            const key = n * 10 + nf;
            if (seen.has(key)) continue;
            seen.add(key);
            const ns: YNode = { cell: n, forced: nf, len: st.len + 1, prev: st };
            next.push(ns);
            if (nf !== x || ns.len < minLen) continue;
            const path = [];
            for (let p: YNode | null = ns; p; p = p.prev) path.unshift(p.cell);
            if (new Set(path).size !== path.length) continue;
            if (best && path.length >= best.path.length) continue;
            const inPath = new Set(path);
            const elims = commonPeers([start, n])
              .filter((i) => !inPath.has(i) && !s.v[i] && (s.c[i] & (1 << x)))
              .map((i): Elim => [i, x]);
            if (elims.length) best = { path, x, elims };
          }
        }
        if (best) break;
        frontier = next;
      }
      if (best && best.path.length === minLen) break outer;
    }
  }
  if (!best) return null;
  const { path, x, elims } = best as { path: number[]; x: number; elims: Elim[] };
  const a = path[0], z = path[path.length - 1];
  if (tech === 'xyWing') {
    const pivot = path[1];
    return {
      tech, elims, focus: path,
      text: `Pivot ${cellName(pivot)} {${listDigits(digitsOf(s.c[pivot]))}} sees ${cellName(a)} {${listDigits(digitsOf(s.c[a]))}} and ${cellName(z)} {${listDigits(digitsOf(s.c[z]))}}. Whichever digit the pivot takes, one of the wings becomes ${x}. So ${listCells(elims.map((e) => e[0]))} cannot be ${x}.`,
    };
  }
  return {
    tech, elims, focus: path,
    text: `XY-Chain: ${path.map((i) => `${cellName(i)} {${listDigits(digitsOf(s.c[i]))}}`).join(' → ')}. If ${cellName(a)} is not ${x}, each cell in turn is forced until ${cellName(z)} becomes ${x}. So one end is ${x}, and ${listCells(elims.map((e) => e[0]))} cannot be ${x}.`,
  };
}

function xyzWing(s: SolverState): Step | null {
  for (let p = 0; p < 81; p++) {
    if (s.v[p] || popcount(s.c[p]) !== 3) continue;
    const pm = s.c[p];
    const wings = PEERS[p].filter((i) => !s.v[i] && popcount(s.c[i]) === 2 && (s.c[i] & pm) === s.c[i]);
    for (const [a, b] of combos(wings, 2)) {
      if (s.c[a] === s.c[b]) continue;
      const z = s.c[a] & s.c[b];
      if (popcount(z) !== 1 || (s.c[a] | s.c[b]) !== pm) continue;
      const d = bitDigit(z);
      const elims = commonPeers([p, a, b]).filter((i) => !s.v[i] && (s.c[i] & z)).map((i): Elim => [i, d]);
      if (elims.length) {
        return { tech: 'xyzWing', elims, focus: [p, a, b], text: `Pivot ${cellName(p)} {${listDigits(digitsOf(pm))}} with wings ${cellName(a)} {${listDigits(digitsOf(s.c[a]))}} and ${cellName(b)} {${listDigits(digitsOf(s.c[b]))}}: one of the three must be ${d}. So ${listCells(elims.map((e) => e[0]))}, which see all three, cannot be ${d}.` };
      }
    }
  }
  return null;
}

function wWing(s: SolverState): Step | null {
  const bivalue: number[] = [];
  for (let i = 0; i < 81; i++) if (!s.v[i] && popcount(s.c[i]) === 2) bivalue.push(i);
  for (const [a, b] of combos(bivalue, 2)) {
    if (s.c[a] !== s.c[b] || sees(a, b)) continue;
    const [x1, x2] = digitsOf(s.c[a]);
    for (const [y, x] of [[x1, x2], [x2, x1]]) {
      for (const [p, q, u] of strongLinks(s, y)) {
        if (p === a || p === b || q === a || q === b) continue;
        const ok = (sees(p, a) && sees(q, b)) || (sees(p, b) && sees(q, a));
        if (!ok) continue;
        const elims = commonPeers([a, b]).filter((i) => !s.v[i] && (s.c[i] & (1 << x))).map((i): Elim => [i, x]);
        if (elims.length) {
          return { tech: 'wWing', elims, focus: [a, b, p, q], text: `${cellName(a)} and ${cellName(b)} are both {${x1}/${x2}}. In ${UNIT_NAMES[u]}, ${y} must be in ${cellName(p)} or ${cellName(q)}, and each of those sees one of the pair. So the pair cells can't both be ${y}: one of them is ${x}. Remove ${x} from ${listCells(elims.map((e) => e[0]))}.` };
        }
      }
    }
  }
  return null;
}

function uniqueRect(s: SolverState): Step | null {
  for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) {
    for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
      const corners = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      const boxes = new Set(corners.map((i) => BOX[i]));
      if (boxes.size !== 2 || corners.some((i) => s.v[i])) continue;
      const pairs = corners.filter((i) => popcount(s.c[i]) === 2);
      if (pairs.length !== 3) continue;
      const m = s.c[pairs[0]];
      if (pairs.some((i) => s.c[i] !== m)) continue;
      const extra = corners.find((i) => !pairs.includes(i))!;
      if ((s.c[extra] & m) !== m) continue;
      const elims = digitsOf(m).map((d): Elim => [extra, d]);
      return { tech: 'uniqueRect', elims, focus: corners, text: `${listCells(pairs)} all hold {${listDigits(digitsOf(m))}}. If ${cellName(extra)} were also one of these, the two digits could swap around the rectangle and the puzzle would have two solutions. So ${cellName(extra)} cannot be ${listDigits(digitsOf(m))}.` };
    }
  }
  return null;
}

// In order of difficulty. The solver always uses the first one that makes progress.
const STRATEGIES: [level: number, strategy: (s: SolverState) => Step | null][] = [
  [1, fullHouse],
  [1, hiddenSingle],
  [2, nakedSingle],
  [3, lockedCandidates],
  [3, (s) => nakedSubset(s, 2)],
  [3, (s) => hiddenSubset(s, 2)],
  [4, (s) => nakedSubset(s, 3)],
  [4, (s) => hiddenSubset(s, 3)],
  [4, (s) => xChain(s, 2, 2, 'turbotFish')],
  [4, (s) => xyChain(s, 3, 3, 'xyWing')],
  [5, (s) => fish(s, 2)],
  [5, (s) => fish(s, 3)],
  [5, (s) => nakedSubset(s, 4)],
  [5, (s) => hiddenSubset(s, 4)],
  [5, xyzWing],
  [5, wWing],
  [5, uniqueRect],
  [6, (s) => fish(s, 4)],
  [6, (s) => xChain(s, 3, 6, 'xChain')],
  [6, (s) => xyChain(s, 4, 8, 'xyChain')],
];

export function nextStep(s: SolverState, maxLevel = 6): Step | null {
  for (const [level, strat] of STRATEGIES) {
    if (level > maxLevel) return null;
    const step = strat(s);
    if (step) return step;
  }
  return null;
}

/**
 * Solve with logic only. Returns { solved, level, techs: {tech: count}, steps: n, values }.
 * `maxLevel` stops early when a harder technique would be needed.
 */
export interface RateResult {
  solved: boolean;
  level: number;
  techs: Partial<Record<TechId, number>>;
  steps: number;
  values: number[];
  log: { step: Step; before: SolverState }[] | null;
}

export function rate(values: ArrayLike<number>, maxLevel = 6, { record = false } = {}): RateResult {
  const s = initState(values);
  const techs: Partial<Record<TechId, number>> = {};
  const log: RateResult['log'] = record ? [] : null;
  let level = 0, steps = 0;
  while (s.v.includes(0)) {
    const step = nextStep(s, maxLevel);
    if (!step) break;
    const lv = TECHNIQUES[step.tech].level;
    if (lv > level) level = lv;
    techs[step.tech] = (techs[step.tech] || 0) + 1;
    if (log) log.push({ step, before: { v: s.v.slice(), c: s.c.slice() } });
    applyStep(s, step);
    steps++;
  }
  return { solved: !s.v.includes(0), level, techs, steps, values: Array.from(s.v), log };
}

/**
 * Hint for the player's current board. `values` must contain only correct digits.
 * `notes` (optional) narrows the candidates. Returns the next logical step, with the
 * candidate grid it was found on, or null.
 */
export function hintStep(values: ArrayLike<number>, notes: ArrayLike<number> | null = null): HintStep | null {
  const s = initState(values);
  // Respect the player's own eliminations when their notes are complete and sound.
  if (notes) for (let i = 0; i < 81; i++) if (!s.v[i]) s.c[i] &= notes[i];
  const step = nextStep(s, 6);
  return step ? { ...step, cands: Array.from(s.c) } : null;
}

// ---------- Generator ----------

function fullGrid(rnd: Rng): number[] {
  return solve(new Array(81).fill(0), 1, rnd).solution!;
}

/** Remove clues in random order while `keep(puzzle)` holds. Stops at `target` clues. */
function carve(solution: number[], rnd: Rng, keep: (p: number[]) => boolean, target = 17): number[] {
  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], rnd)) {
    if (clues <= target) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (keep(puzzle)) clues--;
    else puzzle[i] = v;
  }
  return puzzle;
}

const unique = (p: number[]) => solve(p, 2).count === 1;

/**
 * Generate one graded puzzle. For tiers 1-2 the carve keeps the puzzle solvable at that
 * tier (more clues, gentler). For tier 3+ a minimal puzzle is graded as-is.
 * Returns { puzzle, solution, level, techs, clues } or null when the result didn't match.
 */
export interface Generated { puzzle: number[]; solution: number[]; level: number; techs: RateResult['techs']; clues: number; steps: number }

export function generate(tier: number, rnd: Rng = Math.random): Generated | null {
  const solution = fullGrid(rnd);
  let puzzle: number[];
  if (tier <= 2) {
    const target = tier === 1 ? 36 + ((rnd() * 5) | 0) : 28 + ((rnd() * 5) | 0);
    puzzle = carve(solution, rnd, (p) => rate(p, tier).solved, target);
  } else {
    puzzle = carve(solution, rnd, unique);
  }
  const r = rate(puzzle);
  if (!r.solved) return null;
  const clues = puzzle.filter(Boolean).length;
  return { puzzle, solution, level: r.level, techs: r.techs, clues, steps: r.steps };
}

// ---------- Symmetry transforms ----------
//
// Relabelling digits, permuting bands/stacks, rows within a band, columns within a stack,
// and transposing all preserve uniqueness and the logical difficulty of a puzzle.

export function transform(grid: number[], seed: number): number[] {
  const rnd = mulberry32(seed);
  const digit = [0, ...shuffle(DIGITS.slice(), rnd)];
  const lineMap = () => {
    const bands = shuffle([0, 1, 2], rnd);
    const out: number[] = [];
    for (const b of bands) for (const r of shuffle([0, 1, 2], rnd)) out.push(b * 3 + r);
    return out;
  };
  const rows = lineMap();
  const cols = lineMap();
  const flip = rnd() < 0.5;
  const out: number[] = new Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      let sr = rows[r], sc = cols[c];
      if (flip) [sr, sc] = [sc, sr];
      out[r * 9 + c] = digit[grid[sr * 9 + sc]];
    }
  }
  return out;
}

export const toString = (g: ArrayLike<number>) => Array.from(g, (v) => v || '.').join('');
export const fromString = (str: string) => Array.from(str, (ch) => (ch >= '1' && ch <= '9' ? Number(ch) : 0));

