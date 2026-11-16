/* Effects controller: listens to validated gameplay events and plays visual and audio
   feedback. It never changes the board, the score or the timing (§J, §K).

   Events from one move arrive synchronously, so they are collected and played together on
   the next microtask: every reward is shown, one celebration dominates, and the sounds merge
   into one flourish (§G). */
import { BOXES, BOX, COL, COLS, ROW, ROWS } from '../core/sudoku.ts';
import type { ProgressEvent } from '../game/events.ts';
import { $, fmt } from '../ui/dom.ts';
import { onGameEvent, onProgress } from '../ui/gameplay-events.ts';
import { settings, ui, type Game } from '../ui/state.ts';
import { play, unlockAudio } from './audio.ts';
import { buildMoment, chainAccent, plan, type Collected, type Moment, type Plan } from './moment.ts';
import * as fx from './visuals.ts';

export { clearFx } from './visuals.ts';

let pending: Collected[] = [];
let pendingGame: Game | null = null;
let scheduled = false;
/** Highest chain level already celebrated, per chain id, for the current game. */
const shownLevel = new Map<number, number>();
let levelsFor: string | null = null;

export function initEffects(): void {
  // Browsers only allow audio after a user gesture.
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });

  onGameEvent((ev, awards, game) => {
    pending.push({ ev, awards, chain: ev.type === 'CHAIN_EXTENDED' && game.score.chain ? { ...game.score.chain } : undefined });
    pendingGame = game;
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
  onProgress(celebrateResult);
}

function flush(): void {
  scheduled = false;
  const items = pending;
  const game = pendingGame;
  pending = [];
  if (!game || !items.length) return;
  if (levelsFor !== game.pid) { shownLevel.clear(); levelsFor = game.pid; }
  const moment = buildMoment(items, (run) => shownLevel.get(run) ?? 0);
  if (moment.chain) shownLevel.set(moment.chain.run, Math.max(moment.chain.level, shownLevel.get(moment.chain.run) ?? 0));
  const clean = game.mistakes === 0 && game.hints === 0;
  const p = plan(moment, { clean });
  playSound(moment, p);
  if (settings.scoreFx && ui.view === 'game') playVisuals(moment, p, game);
}

// ---------- Audio ----------

function playSound(m: Moment, p: Plan): void {
  // Input layer first, then the move's one coordinated flourish.
  const flourish = p.sound && p.sound !== 'click' && p.sound !== 'knock';
  if (m.placementPts && p.kind !== 'wrong') play('click');
  if (p.sound === 'knock') play('knock');
  else if (flourish) play(p.sound!, { chainLength: p.pitch, delay: m.placementPts ? 0.04 : 0 });
  else if (m.chainExpired && p.kind === 'none') play('close');
}

// ---------- Visuals ----------

function playVisuals(m: Moment, p: Plan, game: Game): void {
  const cell = m.cell;
  if (p.kind === 'wrong') {
    if (cell != null) fx.wrong(cell);
    return;
  }

  // Placement: highlight and a floating score.
  if (cell != null && m.placementPts) {
    fx.glow([cell], 'emerald', 200, 0.28);
    fx.popup(cell, `+${fmt(m.placementPts)}`, 'emerald', m.chain?.level ?? 0);
  }

  // Region clears: every region animates; gold when they clear together.
  const together = !!m.multi;
  for (const r of m.regions) {
    const ids = fx.regionCells(r.key);
    const accent = together ? 'gold' : 'emerald';
    if (r.key[0] === 'r') fx.sweep(ids, 'x', accent, together ? 650 : 450);
    else if (r.key[0] === 'c') fx.sweep(ids, 'y', accent, together ? 650 : 450);
    else { fx.outline(ids, accent, together ? 650 : 550); fx.burst(ids, accent, 0.8, 500); }
    fx.glow(ids, accent, 450, 0.18);
  }
  if (m.multi?.count === 3 && cell != null) {
    fx.burst([cell], 'gold', 1.6, 850);
    fx.particles([cell], 'gold', 16, 1.6);
  }

  // Chain: ring, particles and the chain type's signature (§C, §D).
  const c = m.chain;
  if (c && c.level >= 1 && cell != null) {
    const accent = chainAccent(c.type, c.hybrid);
    const scale = c.fresh ? 1 : 0.5;
    fx.ring(cell, accent, c.level);
    fx.particles([cell], c.level >= 3 ? 'gold' : accent, Math.round([0, 6, 8, 10, 14, 20][c.level] * scale), 1 + c.level * 0.12);
    signature(c.type, c.hybrid, cell, m.digit, game, accent);
    if (c.level >= 2) fx.hudFlash('surge');
    if (c.level >= 4) fx.hudGlow(true);
  }
  if (m.chainExpired) fx.hudGlow(false);

  // The dominant celebration owns the board-level effects; nothing full-board stacks.
  if (p.kind === 'legendary') { fx.boardFlash('gold'); fx.boardPulse(1.4); fx.boardShake(); }
  else if (p.kind === 'mega') fx.boardPulse(1);
  else if (p.kind === 'completion') {
    fx.boardWave(p.accent);
    fx.particles([40], 'gold', p.accent === 'gold' ? 20 : 10, 2.6);
  }
  fx.banner(p);
}

/** Chain type identity (§D): what the chain shares lights up. */
function signature(type: string, hybrid: boolean, cell: number, digit: number | null, game: Game, accent: 'emerald' | 'gold' | 'cyan' | 'blue' | 'amber' | 'red'): void {
  if (hybrid) {
    fx.outline(BOXES[BOX[cell]], accent, 500);
    fx.sweep(ROWS[ROW[cell]], 'x', accent, 450);
    fx.burst([cell], accent, 1, 500);
    return;
  }
  if (type === 'time') fx.hudFlash('tick');
  else if (type === 'number' && digit) {
    const same: number[] = [];
    for (let i = 0; i < 81; i++) if (game.values[i] === digit) same.push(i);
    for (const i of same) fx.glow([i], accent, 420, 0.3);
  } else if (type === 'block') fx.outline(BOXES[BOX[cell]], accent, 450);
  else if (type === 'row') fx.sweep(ROWS[ROW[cell]], 'x', accent, 420);
  else if (type === 'col') fx.sweep(COLS[COL[cell]], 'y', accent, 420);
}

// ---------- Result screen (§H) ----------

function celebrateResult(events: ProgressEvent[]): void {
  const box = $('#result-fx');
  box.textContent = '';
  const lines: { text: string; cls: string }[] = [];
  let sound = false;
  for (const ev of events) {
    switch (ev.type) {
      case 'PUZZLE_RESULT':
        if (ev.won) countUp(ev.total);
        break;
      case 'CLEAN_COMPLETION':
        $('#result-mark').classList.add('gold');
        lines.push({ text: 'PERFECT SOLVE', cls: 'gold' });
        break;
      case 'PERSONAL_BEST':
        lines.push({ text: `NEW PERSONAL BEST! ${fmt(ev.previous)} → ${fmt(ev.score)}`, cls: 'gold' });
        sound = true;
        break;
      case 'DIFFICULTY_UNLOCKED':
        lines.push({ text: `NEW DIFFICULTY UNLOCKED: ${ev.name.toUpperCase()}`, cls: 'emerald' });
        $('#result-news .news.unlock')?.classList.add('fx-unlock');
        sound = true;
        break;
      case 'MASTERY_RANK_UP':
        lines.push({ text: `NEW RANK: ${ev.rank.toUpperCase()}`, cls: 'gold' });
        $('#result-news .news.rank')?.classList.add('fx-rank');
        sound = true;
        break;
      case 'ACHIEVEMENT_UNLOCKED':
        sound = true;
        break;
    }
  }
  for (const l of lines) {
    const s = document.createElement('span');
    s.className = `fx-line ${l.cls}`;
    s.textContent = l.text;
    box.appendChild(s);
  }
  document.querySelectorAll('#result-news .news').forEach((n, k) => {
    (n as HTMLElement).style.setProperty('--k', String(k));
    n.classList.add('fx-in');
  });
  if (!settings.scoreFx) return;
  if (sound) play('celebrate', { delay: 0.25 });
  if (lines.some((l) => l.cls === 'gold')) {
    const r = box.getBoundingClientRect();
    if (r.width) fx.particles({ x: r.width / 2, y: 6 }, 'gold', 18, 2.2, box);
  }
}

let countFrame = 0;
/** The final score counts up; tapping the dialog skips to the end (§H: skippable). */
function countUp(total: number): void {
  const el = document.getElementById('result-total');
  if (!el) return;
  cancelAnimationFrame(countFrame);
  if (!settings.scoreFx || fx.reducedMotion() || total <= 0) { el.textContent = fmt(total); return; }
  const dlg = $('#dlg-result');
  const start = performance.now();
  const dur = Math.min(1400, 600 + total / 60);
  const skip = () => { cancelAnimationFrame(countFrame); el.textContent = fmt(total); };
  dlg.addEventListener('pointerdown', skip, { once: true });
  const step = () => {
    // Read the clock here rather than trusting the frame timestamp, which can predate `start`.
    const t = Math.max(0, Math.min(1, (performance.now() - start) / dur));
    el.textContent = fmt(total * (1 - Math.pow(1 - t, 3)));
    if (t < 1) countFrame = requestAnimationFrame(step);
    else dlg.removeEventListener('pointerdown', skip);
  };
  el.textContent = '0';
  countFrame = requestAnimationFrame(step);
}
