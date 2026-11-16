/* Visual effect primitives drawn on an overlay above the board (§A–E, J).

   Everything animates transform and opacity with the Web Animations API, never takes input,
   and is cancelled when the player leaves the game. With reduced motion, movement becomes
   short fades and static highlights; particles, pulses and shakes are skipped. */
import { BOXES, COLS, ROWS } from '../core/sudoku.ts';
import { cells } from '../ui/board.ts';
import { $ } from '../ui/dom.ts';
import type { Accent, Plan } from './moment.ts';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const color = (a: Accent) => `var(--fx-${a})`;
const layer = () => $('#fx-layer');

interface Box { x: number; y: number; w: number; h: number }
const running = new Set<Animation>();

function track(anim: Animation, el?: Element): Animation {
  running.add(anim);
  const done = () => { running.delete(anim); el?.remove(); };
  anim.onfinish = done;
  anim.oncancel = done;
  return anim;
}

/** Box of a group of cells, relative to the overlay. */
function boxOf(cellIds: number[]): Box {
  const base = layer().getBoundingClientRect();
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const i of cellIds) {
    const r = cells[i].el.getBoundingClientRect();
    x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
    x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
  }
  return { x: x1 - base.left, y: y1 - base.top, w: x2 - x1, h: y2 - y1 };
}
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function place(cls: string, b: Box, accent: Accent, parent: HTMLElement = layer()): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.style.cssText = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--fx-c:${color(accent)}`;
  parent.appendChild(el);
  return el;
}

function animate(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation {
  return track(el.animate(frames, { fill: 'both', ...opts }), el);
}

/** Region of a key such as r3, c0 or b8. */
export function regionCells(key: string): number[] {
  const n = Number(key.slice(1));
  return key[0] === 'r' ? ROWS[n] : key[0] === 'c' ? COLS[n] : BOXES[n];
}

// ---------- Cell-level ----------

/** Brief background highlight over cells. */
export function glow(cellIds: number[], accent: Accent, dur = 420, peak = 0.32, delay = 0): void {
  const el = place('fx-glow', boxOf(cellIds), accent);
  animate(el, [{ opacity: 0 }, { opacity: peak, offset: 0.3 }, { opacity: 0 }], { duration: dur, delay, easing: 'ease-out' });
}

/** Floating score next to the cell: "+50". Bigger and bouncier on long chains. */
export function popup(cell: number, text: string, accent: Accent, level = 0): void {
  const b = boxOf([cell]);
  const el = place(`fx-popup lv${Math.min(level, 5)}`, { x: b.x - b.w, y: b.y, w: b.w * 3, h: b.h }, accent);
  el.textContent = text;
  const rise = reducedMotion() ? 0 : -(b.h * 0.75 + level * 3);
  const s = level >= 3 && !reducedMotion() ? 1.25 : 1;
  animate(el, [
    { opacity: 0, transform: `translateY(4px) scale(${s > 1 ? 0.8 : 1})` },
    { opacity: 1, transform: `translateY(${rise * 0.3}px) scale(${s})`, offset: 0.25 },
    { opacity: 1, transform: `translateY(${rise * 0.7}px) scale(1)`, offset: 0.7 },
    { opacity: 0, transform: `translateY(${rise}px) scale(1)` },
  ], { duration: 650 + level * 40, easing: 'ease-out' });
}

/** Ring that expands around a cell (chain activation). */
export function ring(cell: number, accent: Accent, level: number): void {
  const el = place('fx-ring', boxOf([cell]), accent);
  const grow = reducedMotion() ? 1 : 1.25 + level * 0.12;
  animate(el, [
    { opacity: 0, transform: 'scale(.7)' },
    { opacity: 1, transform: 'scale(1)', offset: 0.35 },
    { opacity: 0, transform: `scale(${grow})` },
  ], { duration: 320 + level * 70, easing: 'ease-out' });
}

/** A wrong digit: muted red flash and a ~2 px shake of the digit. */
export function wrong(cell: number): void {
  glow([cell], 'red', 240, 0.4);
  const value = cells[cell].el.querySelector('.value');
  if (value && !reducedMotion()) {
    track(value.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(-1px)' }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'ease-in-out' },
    ));
  }
  const counter = $('#mistakes-wrap b');
  track(counter.animate(
    reducedMotion() ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', color: 'var(--error)' }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' },
  ));
}

// ---------- Regions ----------

/** Light sweep along a row (left→right), column (top→bottom) or the whole board (diagonal). */
export function sweep(cellIds: number[], dir: 'x' | 'y' | 'diag', accent: Accent, dur = 450, delay = 0): void {
  if (reducedMotion()) { glow(cellIds, accent, dur, 0.28, delay); return; }
  const b = boxOf(cellIds);
  const box = place('fx-sweep', b, accent);
  const band = document.createElement('i');
  band.className = `fx-band ${dir}`;
  box.appendChild(band);
  const from = dir === 'x' ? 'translateX(-60%)' : dir === 'y' ? 'translateY(-60%)' : 'translate(-60%, -60%)';
  const to = dir === 'x' ? 'translateX(160%)' : dir === 'y' ? 'translateY(160%)' : 'translate(160%, 160%)';
  animate(box, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: dur, delay, easing: 'ease-in-out' });
  track(band.animate([{ transform: from }, { transform: to }], { duration: dur, delay, easing: 'ease-in-out', fill: 'both' }));
}

/** Outline that settles onto a 3×3 block (block clear, Block chain). */
export function outline(cellIds: number[], accent: Accent, dur = 550): void {
  const el = place('fx-outline', boxOf(cellIds), accent);
  const s = reducedMotion() ? 1 : 1.06;
  animate(el, [
    { opacity: 0, transform: `scale(${s})` },
    { opacity: 1, transform: 'scale(1)', offset: 0.3 },
    { opacity: 1, transform: 'scale(1)', offset: 0.7 },
    { opacity: 0, transform: 'scale(1)' },
  ], { duration: dur, easing: 'ease-out' });
}

/** Radial light burst from the middle of some cells. */
export function burst(cellIds: number[], accent: Accent, size = 1, dur = 550): void {
  const c = center(boxOf(cellIds));
  const d = boxOf([cellIds[0]]).w * 3 * size;
  const el = place('fx-burst', { x: c.x - d / 2, y: c.y - d / 2, w: d, h: d }, accent);
  const end = reducedMotion() ? 1 : 1.6;
  animate(el, [
    { opacity: 0.9, transform: `scale(${reducedMotion() ? 1 : 0.2})` },
    { opacity: 0, transform: `scale(${end})` },
  ], { duration: dur, easing: 'ease-out' });
}

// ---------- Particles ----------

const MAX_PARTICLES = 24;
let liveParticles = 0;

/** Small dots flying out from a point. Capped, skipped with reduced motion (§J). */
export function particles(from: number[] | { x: number; y: number }, accent: Accent, count: number, spread = 1, parent?: HTMLElement): void {
  if (reducedMotion() || count <= 0) return;
  const origin = Array.isArray(from) ? center(boxOf(from)) : from;
  const unit = Array.isArray(from) ? boxOf([from[0]]).w : 36;
  const n = Math.min(count, MAX_PARTICLES - liveParticles);
  for (let k = 0; k < n; k++) {
    const angle = (Math.PI * 2 * k) / n + Math.random() * 0.6;
    const dist = unit * (0.9 + Math.random() * 1.3) * spread;
    const size = 4 + Math.random() * 4;
    const el = place('fx-dot', { x: origin.x - size / 2, y: origin.y - size / 2, w: size, h: size }, accent, parent);
    liveParticles++;
    const anim = animate(el, [
      { opacity: 1, transform: 'translate(0, 0) scale(1)' },
      { opacity: 0, transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(.4)` },
    ], { duration: 520 + Math.random() * 280, easing: 'cubic-bezier(.2,.7,.3,1)' });
    anim.addEventListener('finish', () => { liveParticles--; });
    anim.addEventListener('cancel', () => { liveParticles--; });
  }
}

// ---------- Board-level (dominant celebration only) ----------

/** A subtle scale pulse of the board (Mega, Legendary). */
export function boardPulse(strength = 1): void {
  if (reducedMotion()) return;
  const s = 1 + 0.012 * strength;
  track($('#board').animate([{ transform: 'scale(1)' }, { transform: `scale(${s})` }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' }));
}

/** A bright muted-gold wash over the board (Legendary). */
export function boardFlash(accent: Accent, peak = 0.22): void {
  glow([...Array(81).keys()], accent, 600, reducedMotion() ? peak * 0.6 : peak);
}

/** 1–2 px shake (Legendary only, never with reduced motion). */
export function boardShake(): void {
  if (reducedMotion()) return;
  track($('.board-box').animate(
    [{ transform: 'translate(0)' }, { transform: 'translate(-2px, 1px)' }, { transform: 'translate(2px, -1px)' }, { transform: 'translate(-1px, 0)' }, { transform: 'translate(0)' }],
    { duration: 260, easing: 'ease-out' },
  ));
}

/** Completion: a gentle wave of light across every cell, from the top-left corner. */
export function boardWave(accent: Accent): void {
  if (reducedMotion()) { glow([...Array(81).keys()], accent, 900, 0.3); return; }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) glow([r * 9 + c], accent, 520, 0.4, (r + c) * 45);
  }
  sweep([...Array(81).keys()], 'diag', accent, 1100, 120);
}

// ---------- Banner ----------

/** The move's one dominant title, with the reward summary below it (§G). */
export function banner(p: Plan): void {
  const host = $('#fx-banner');
  for (const a of host.getAnimations({ subtree: true })) a.cancel();
  host.textContent = '';
  if (!p.title) return;
  const card = document.createElement('div');
  card.className = `fx-card ${p.size ?? 'sm'}`;
  card.style.setProperty('--fx-c', color(p.accent));
  const title = document.createElement('b');
  title.textContent = p.title;
  card.appendChild(title);
  for (const line of p.lines) {
    const s = document.createElement('span');
    s.textContent = line;
    card.appendChild(s);
  }
  host.appendChild(card);
  const life = Math.max(1100, p.durationMs + 600 + p.lines.length * 120);
  const pop = reducedMotion() ? 1 : p.size === 'xl' ? 1.12 : p.size === 'lg' ? 1.08 : 1.04;
  track(card.animate([
    { opacity: 0, transform: `translateY(${reducedMotion() ? 0 : 6}px) scale(.94)` },
    { opacity: 1, transform: `translateY(0) scale(${pop})`, offset: 0.1 },
    { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2 },
    { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.85 },
    { opacity: 0, transform: `translateY(${reducedMotion() ? 0 : -6}px) scale(1)` },
  ], { duration: life, easing: 'ease-out', fill: 'both' }), card);
}

// ---------- Chain indicator ----------

/** Adds a class to the chain indicator for one CSS animation run. */
export function hudFlash(cls: 'surge' | 'tick'): void {
  const hud = $('#chain-hud');
  hud.classList.remove(cls);
  void hud.offsetWidth;
  hud.classList.add(cls);
}
export const hudGlow = (on: boolean) => $('#chain-hud').classList.toggle('glow', on);

/** Stops every running effect and clears the overlays (leaving the game, new game). */
export function clearFx(): void {
  for (const a of [...running]) a.cancel();
  running.clear();
  liveParticles = 0;
  layer().textContent = '';
  $('#fx-banner').textContent = '';
  hudGlow(false);
}
