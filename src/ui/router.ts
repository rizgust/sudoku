/* Hash routing between the home, game, stats and awards views. */
import { clearFx } from '../effects/index.ts';
import { render } from './board.ts';
import { $ } from './dom.ts';
import { hideHint } from './hints.ts';
import { renderAwards } from './screens/awards.ts';
import { renderHome } from './screens/home.ts';
import { renderStats } from './screens/stats.ts';
import { saveGame, ui, type View } from './state.ts';

const VIEWS: View[] = ['home', 'game', 'stats', 'awards'];

/** Shows a view without adding a history entry. */
export function route(name: View): void {
  const hash = `#/${name}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  showView(name);
}

/** Navigates and pushes a history entry, so the phone's back button returns home. */
export function go(name: View): void {
  if (location.hash !== `#/${name}`) location.hash = `#/${name}`;
  else showView(name);
}

export const viewFromHash = (): string => location.hash.replace(/^#\/?/, '') || 'home';

export function showView(requested: string): void {
  let name = (VIEWS as string[]).includes(requested) ? (requested as View) : 'home';
  if (name === 'game' && !ui.game && !ui.loading) name = 'home';
  if (ui.view === 'game' && name !== 'game') { hideHint(); saveGame(); clearFx(); }
  ui.view = name;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
  if (name === 'awards') renderAwards();
  if (name === 'game') render();
  window.scrollTo(0, 0);
}
