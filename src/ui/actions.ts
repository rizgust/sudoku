/* Player actions on the board: select, place, note, erase, undo and auto notes. */
import { COL, PEERS, ROW } from '../core/sudoku.ts';
import { cells, flashCompletedUnits, render } from './board.ts';
import { buzz, retrigger, toast } from './dom.ts';
import { breakChain, onCorrect, record } from './gameplay-events.ts';
import { hideHint } from './hints.ts';
import { checkWin, finish } from './lifecycle.ts';
import { assistsAllowed, MAX_HISTORY, playable, saveGame, settings, ui, type Game } from './state.ts';

export function snapshot(game: Game): void {
  game.history.push({ v: game.values.slice(), n: game.notes.slice() });
  if (game.history.length > MAX_HISTORY) game.history.shift();
  game.moved = true;
}

export function commit(): void {
  saveGame();
  render();
}

export function select(i: number): void {
  if (ui.paused || !ui.game || ui.loading) return;
  ui.selected = i;
  // Tapping an empty cell releases any number highlight.
  if (!ui.game.values[i]) ui.focusDigit = null;
  render();
}

export function moveSelection(dr: number, dc: number): void {
  if (ui.selected == null) { select(40); return; }
  const r = (ROW[ui.selected] + dr + 9) % 9;
  const c = (COL[ui.selected] + dc + 9) % 9;
  select(r * 9 + c);
}

export function clearPeerNotes(game: Game, i: number, d: number): void {
  const mask = ~(1 << d);
  for (const p of PEERS[i]) game.notes[p] &= mask;
}

export function input(d: number, asNote = ui.notesMode): void {
  const game = playable();
  const i = ui.selected;
  if (!game || i == null || game.puzzle[i]) return;

  if (asNote) {
    if (game.values[i]) return;
    // Can't add a note for a number already placed in the same row, column or box.
    if (!(game.notes[i] & (1 << d))) {
      const conflicts = PEERS[i].filter((p) => game.values[p] === d);
      if (conflicts.length) {
        conflicts.forEach((p) => retrigger(cells[p].el, 'shake'));
        buzz(25);
        return;
      }
    }
    snapshot(game);
    game.notes[i] ^= 1 << d;
    commit();
    return;
  }

  if (game.values[i] === d) { erase(); return; }

  hideHint();
  snapshot(game);
  game.values[i] = d;
  game.notes[i] = 0;
  if (settings.autoRemoveNotes) clearPeerNotes(game, i, d);

  if (d !== game.solution[i]) {
    game.mistakes++;
    breakChain(game, 'mistake');
    record(game, { type: 'MISTAKE' });
    retrigger(cells[i].el, 'shake');
    buzz([35, 50, 35]);
    if (game.mode === 'qual' && game.mistakes > 1) {
      commit();
      finish('failed', { reason: 'mistakes' });
      return;
    }
  } else {
    onCorrect(game, i, d);
    retrigger(cells[i].el, 'pop');
    flashCompletedUnits(i);
  }
  checkWin();
  commit();
}

export function erase(): void {
  const game = playable();
  const i = ui.selected;
  if (!game || i == null || game.puzzle[i] || (!game.values[i] && !game.notes[i])) return;
  hideHint();
  snapshot(game);
  // Clearing a credited digit interrupts the chain; clearing a wrong one or notes doesn't.
  if (game.values[i] && game.values[i] === game.solution[i]) breakChain(game, 'clear');
  game.values[i] = 0;
  game.notes[i] = 0;
  commit();
}

export function undo(): void {
  const game = playable();
  if (!game || !game.history.length) return;
  hideHint();
  const s = game.history.pop()!;
  // Undo that changes the confirmed board ends the chain. Mistakes, hints and credited
  // cells and regions stay recorded, so undo/redo can't farm points.
  if (s.v.some((v, k) => v !== game.values[k])) breakChain(game, 'undo');
  game.values = s.v;
  game.notes = s.n;
  commit();
}

export function toggleNotesMode(): void {
  ui.notesMode = !ui.notesMode;
  render();
}

function candidatesFor(game: Game, i: number): number {
  let m = 0x3fe;
  for (const p of PEERS[i]) if (game.values[p]) m &= ~(1 << game.values[p]);
  return m;
}

export function autoNotes(): void {
  const game = playable();
  if (!game || !assistsAllowed()) return;
  hideHint();
  snapshot(game);
  if (!game.assisted) record(game, { type: 'ASSIST_ENABLED' });
  game.assisted = true;
  for (let i = 0; i < 81; i++) game.notes[i] = game.values[i] ? 0 : candidatesFor(game, i);
  commit();
  toast('Candidates filled. Advanced assist: score ×0.8');
}
