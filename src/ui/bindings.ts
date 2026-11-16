/* Wires DOM events (taps, keyboard, visibility) and the game clock to the UI modules. */
import type { TechId } from '../core/sudoku.ts';
import type { ModeId } from '../game/events.ts';
import * as Progress from '../game/progress.ts';
import { autoNotes, erase, input, moveSelection, select, toggleNotesMode, undo } from './actions.ts';
import { boardEl, render, renderTimer, setPaused } from './board.ts';
import { $, $$ } from './dom.ts';
import { expireChain, markTick } from './gameplay-events.ts';
import { applyHint, hideHint, hint, showLearn } from './hints.ts';
import { finish, guardAbandon, nextFromResult, startGame } from './lifecycle.ts';
import { go, showView, viewFromHash } from './router.ts';
import { confirmDialog, openPicker } from './screens/dialogs.ts';
import { bindSettings, openSettings } from './screens/settings.ts';
import { setStatsFilter } from './screens/stats.ts';
import { activeGame, saveGame, saveSettings, settings, tierName, ui, type View } from './state.ts';

const closest = (e: Event, sel: string) => (e.target as Element | null)?.closest<HTMLElement>(sel) ?? null;

export function bindEvents(): void {
  boardEl().addEventListener('pointerdown', (e) => {
    const el = closest(e, '.cell');
    if (el) select(Number(el.dataset.i));
  });

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-erase').addEventListener('click', erase);
  $('#btn-notes').addEventListener('click', toggleNotesMode);
  $('#btn-hint').addEventListener('click', hint);
  $('#btn-autonotes').addEventListener('click', autoNotes);
  $('#btn-pause').addEventListener('click', () => setPaused(!ui.paused));
  $('#btn-resume').addEventListener('click', () => setPaused(false));
  $('#hint-apply').addEventListener('click', applyHint);
  $('#hint-close').addEventListener('click', hideHint);
  $('#hint-learn').addEventListener('click', () => { if (ui.hintState?.kind === 'step') showLearn(ui.hintState.step.tech); });

  $$('[data-action="settings"]').forEach((b) => b.addEventListener('click', openSettings));
  document.addEventListener('click', (e) => {
    const r = closest(e, '[data-route]');
    if (r) { go(r.dataset.route as View); return; }
    const play = closest(e, '[data-play]');
    if (play) { guardAbandon(() => void startGame({ mode: 'classic', tier: +play.dataset.play! })); return; }
    const qual = closest(e, '[data-qual]');
    if (qual) {
      const id = +qual.dataset.qual!;
      confirmDialog(
        `${tierName(id)} qualification`,
        `Solve a ${tierName(id)} puzzle with no hints and at most one mistake. A second mistake ends the attempt. Pass to move closer to ${tierName(id + 1)}.`,
        'Start',
        () => guardAbandon(() => void startGame({ mode: 'qual', tier: id })),
      );
      return;
    }
    const mode = closest(e, '[data-mode]');
    if (mode) { openPicker(mode.dataset.mode as ModeId); return; }
    const filter = closest(e, '[data-filter]');
    if (filter) setStatsFilter(filter.dataset.filter!);
  });

  $('#level-picker').addEventListener('toggle', () => {
    settings.levelsOpen = $<HTMLDetailsElement>('#level-picker').open;
    saveSettings();
  });

  $('#home-continue').addEventListener('click', () => { if (activeGame()) { go('game'); setPaused(false); } });
  $('#home-daily').addEventListener('click', () => {
    if (activeGame()?.mode === 'daily') { go('game'); return; }
    guardAbandon(() => void startGame({ mode: 'daily' }));
  });

  $('#pick-list').addEventListener('click', (e) => {
    const b = closest(e, '.pick-btn');
    if (!b) return;
    const mode = $('#pick-list').dataset.pickMode as ModeId;
    $<HTMLDialogElement>('#dlg-pick').close();
    if (mode === 'practice') guardAbandon(() => void startGame({ mode, tech: b.dataset.tech as TechId }));
    else guardAbandon(() => void startGame({ mode, tier: +b.dataset.tier! }));
  });

  $('#result-home').addEventListener('click', () => { $<HTMLDialogElement>('#dlg-result').close(); go('home'); });
  $('#result-next').addEventListener('click', nextFromResult);

  $$<HTMLDialogElement>('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  });

  bindSettings();
  bindKeyboard();

  window.addEventListener('hashchange', () => showView(viewFromHash()));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (activeGame() && ui.game?.mode !== 'zen') setPaused(true);
      saveGame();
    }
  });
  window.addEventListener('pagehide', saveGame);

  // The game clock: one tick per second of active play.
  setInterval(() => {
    const game = activeGame();
    if (ui.view !== 'game' || !game || ui.paused || ui.loading || document.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    game.elapsed++;
    markTick();
    renderTimer();
    expireChain(game);
    if (game.mode === 'time' && game.elapsed >= Progress.tier(game.tier).par) {
      finish('failed', { reason: 'time' });
      return;
    }
    if (game.elapsed % 5 === 0) saveGame();
  }, 1000);
}

function bindKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]') || ui.view !== 'game') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      return;
    }
    if (e.altKey) return;

    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) {
      e.preventDefault();
      input(Number(m[1]), ui.notesMode || e.shiftKey);
      return;
    }

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveSelection(-1, 0); break;
      case 'ArrowDown': e.preventDefault(); moveSelection(1, 0); break;
      case 'ArrowLeft': e.preventDefault(); moveSelection(0, -1); break;
      case 'ArrowRight': e.preventDefault(); moveSelection(0, 1); break;
      case 'Backspace':
      case 'Delete':
      case '0':
        e.preventDefault(); erase(); break;
      case 'n': case 'N': toggleNotesMode(); break;
      case 'h': case 'H': hint(); break;
      case 'p': case 'P': if (ui.game?.mode !== 'zen') setPaused(!ui.paused); break;
      case 'Escape': ui.selected = null; ui.focusDigit = null; hideHint(); render(); break;
    }
  });
}
