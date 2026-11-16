/* In-game score feedback: the live score, labelled pop-ups and the chain countdown ring. */
import * as Scoring from '../game/scoring.ts';
import { $, fmt, retrigger } from './dom.ts';
import { clockMs, expireChain, onGameEvent } from './gameplay-events.ts';
import { activeGame, settings, ui } from './state.ts';

const feedEl = () => $('#score-feed');

export function clearFeed(): void {
  feedEl().textContent = '';
}

// Labelled pop-ups for region clears, multi-clears and chains.
onGameEvent((_ev, awards) => {
  if (!settings.scoreFx || ui.view !== 'game') return;
  const feed = feedEl();
  for (const a of awards) {
    if (!a.label) continue; // plain placements show in the +N next to the score
    const el = document.createElement('div');
    el.className = `feed-item ${a.kind}`;
    el.textContent = `+${fmt(a.pts)} ${a.label}`;
    el.addEventListener('animationend', () => el.remove());
    feed.appendChild(el);
    while (feed.children.length > 4) feed.firstChild!.remove();
  }
});

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

/** The chain indicator under the board: label, length, time left and a countdown ring. */
export function renderChain(): void {
  const hud = $('#chain-hud');
  const game = activeGame();
  const c = game?.score?.chain ?? null;
  const win = game ? Scoring.chainWindowMs(game.tier) : 0;
  let left = game && c ? win - (clockMs(game) - c.startT) : 0;
  // The ring reaching 0 ends the chain right away rather than on the next 1 s tick.
  if (c && left <= 0 && !ui.paused) { expireChain(game); left = 0; }
  const show = !!game && !!c && settings.chainHud && left > 0 && Scoring.chainsEnabled(game.mode);
  hud.hidden = !show;
  if (!show || !game || !c) {
    if (chainTimer) clearInterval(chainTimer);
    chainTimer = null;
    return;
  }
  const next = Scoring.nextChainGain(game.score);
  $('#chain-text').textContent = `${c.label} · ${c.length} placements · ${(left / 1000).toFixed(1)}s${next ? ` · next +${fmt(next)}` : ''}`;
  // Radial countdown: the ring empties as the window runs out; amber near the end, pulsing last.
  const frac = Math.max(0, Math.min(1, left / win));
  $<SVGCircleElement>('#chain-arc').style.strokeDashoffset = String(100 * (1 - frac));
  hud.classList.toggle('low', frac <= 0.3);
  hud.classList.toggle('critical', frac <= 0.15);
  if (!chainTimer) chainTimer = setInterval(() => { if (!ui.paused) renderChain(); }, 100);
}
