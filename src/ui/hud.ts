/* In-game score feedback: the live score and the chain indicator. Celebrations and
   reward summaries live in the effects layer (src/effects). */
import * as Scoring from '../game/scoring.ts';
import { $, fmt, retrigger } from './dom.ts';
import { clockMs, expireChain } from './gameplay-events.ts';
import { activeGame, settings, ui } from './state.ts';

// Live score: placement, region, multi-clear and (uncapped) chain points earned so far,
// with current penalties applied. Completion and time bonuses arrive on completion (§16.1).
let lastScore: { pid: string | null; value: number } = { pid: null, value: 0 };
export function renderScore(): void {
  const game = ui.game;
  if (!game || game.mode === 'practice' || !game.score) return;
  const value = Scoring.live(game.score);
  if (settings.scoreFx && lastScore.pid === game.pid && value > lastScore.value) {
    const pop = $('#score-pop');
    pop.textContent = `+${fmt(value - lastScore.value)}`;
    retrigger(pop, 'show');
  }
  lastScore = { pid: game.pid, value };
  $('#score-live').textContent = fmt(value);
}

let chainTimer: ReturnType<typeof setInterval> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

/** Fades the indicator out instead of cutting it (§E: no loud failure). */
function hideHud(hud: HTMLElement): void {
  if (hud.hidden || fadeTimer) return;
  hud.classList.add('fading');
  fadeTimer = setTimeout(() => {
    fadeTimer = null;
    hud.hidden = true;
    hud.classList.remove('fading', 'glow');
  }, 260);
}

const BONUS_NAMES = { number: 'Number', block: 'Block', row: 'Line', col: 'Line' } as const;
let lastBonus = '';

/** Secondary notice: the bonus pattern riding on the Universal Chain, if any. */
function renderBonus(c: Scoring.ChainDisplay): void {
  const el = $('#chain-bonus');
  const top = c.bonus?.[0];
  const text = top ? `${c.hybrid ? 'Hybrid ' : ''}${BONUS_NAMES[top.type]} ${top.length}` : '';
  el.hidden = !text;
  el.dataset.type = c.hybrid ? 'hybrid' : top?.type ?? '';
  // Animate only when a new pattern appears, not on every redraw or extension.
  const key = top ? `${c.run}:${el.dataset.type}` : '';
  if (text && key !== lastBonus) retrigger(el, 'pattern-in');
  lastBonus = key;
  el.textContent = text;
}

/**
 * The chain indicator under the board. Primary: Universal Chain length, multiplier, time left
 * before the inactivity timer ends it, and what the next placement could add; the ring empties
 * with the timer and refills on every placement. Secondary: the bonus pattern, if any.
 */
export function renderChain(): void {
  const hud = $('#chain-hud');
  const game = activeGame();
  const c = game?.score?.chain ?? null;
  const win = game ? Scoring.chainWindowMs(game.tier) : 0;
  // Chains saved before v5 have no lastT; their timer ran from the start.
  let left = game && c ? win - (clockMs(game) - (c.lastT ?? c.startT)) : 0;
  // The ring reaching 0 ends the chain right away rather than on the next 1 s tick.
  if (c && left <= 0 && !ui.paused) { expireChain(game); left = 0; }
  const show = !!game && !!c && settings.chainHud && left > 0 && Scoring.chainsEnabled(game.mode);
  if (!show || !game || !c) {
    hideHud(hud);
    if (chainTimer) clearInterval(chainTimer);
    chainTimer = null;
    return;
  }
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
  hud.classList.remove('fading');
  hud.hidden = false;
  const next = c.allPoints != null ? Scoring.nextChainGain(game.score) : 0;
  $('#chain-text').textContent = `${c.length}× Chain ×${(c.mul100 / 100).toFixed(1)} · ${(left / 1000).toFixed(1)}s${next ? ` · next +${fmt(next)}` : ''}`;
  renderBonus(c);
  // Radial countdown: the ring empties as the inactivity timer runs out; amber near the end, pulsing last.
  const frac = Math.max(0, Math.min(1, left / win));
  $<SVGCircleElement>('#chain-arc').style.strokeDashoffset = String(100 * (1 - frac));
  hud.classList.toggle('low', frac <= 0.3);
  hud.classList.toggle('critical', frac <= 0.15);
  if (!chainTimer) chainTimer = setInterval(() => { if (!ui.paused) renderChain(); }, 100);
}
