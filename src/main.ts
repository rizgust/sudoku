/* Entry point: styles, board, event wiring, offline support and the saved game. */
import { registerSW } from 'virtual:pwa-register';
import './style.css';
import { buildBoard, setPaused } from './ui/board.ts';
import { bindEvents } from './ui/bindings.ts';
import { initScoring } from './ui/gameplay-events.ts';
import { route, viewFromHash } from './ui/router.ts';
import { initTheme } from './ui/screens/settings.ts';
import { isValidGame, KEYS, refresh, store, ui, type Game } from './ui/state.ts';

initTheme();
buildBoard();
bindEvents();

// Offline support and "Add to Home Screen". Updates install in the background and apply on
// the next launch. Caches left by the hand-written worker (before Vite) are removed.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  registerSW({ immediate: true });
  if ('caches' in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => /^sudoku-v\d+$/.test(k)).map((k) => caches.delete(k))))
      .catch(() => { /* storage unavailable */ });
  }
}

const saved = store.get<unknown>(KEYS.game, null);
if (isValidGame(saved) && !saved.completed) {
  const game: Game = Object.assign({ mistakes: 0, hints: 0, elapsed: 0, history: [], completed: false, moved: true, start: Date.now() }, saved);
  initScoring(game);
  ui.game = game;
  setPaused(false);
}
refresh();
const initial = viewFromHash();
route(initial === 'game' && !ui.game ? 'home' : initial === 'game' || initial === 'stats' || initial === 'awards' ? initial : 'home');
