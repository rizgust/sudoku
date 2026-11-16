/* Hints: a hint explains one logical step on the current board. Apply performs it. */
import * as Sudoku from '../core/sudoku.ts';
import type { TechId } from '../core/sudoku.ts';
import { clearPeerNotes, commit, snapshot } from './actions.ts';
import { cells, render } from './board.ts';
import { $, retrigger } from './dom.ts';
import { breakChain, onCorrect, record } from './gameplay-events.ts';
import { checkWin } from './lifecycle.ts';
import { hintsAllowed, playable, settings, tierName, ui, type HintState } from './state.ts';

export function hint(): void {
  const game = playable();
  if (!game || !hintsAllowed()) return;
  if (ui.hintState) { applyHint(); return; }

  const wrong: number[] = [];
  for (let i = 0; i < 81; i++) if (game.values[i] && game.values[i] !== game.solution[i]) wrong.push(i);
  let h: HintState;
  if (wrong.length) {
    const i = ui.selected != null && wrong.includes(ui.selected) ? ui.selected : wrong[0];
    h = {
      kind: 'wrong', cell: i, focus: [i], title: 'Check this cell',
      text: `${Sudoku.cellName(i)} doesn’t match the solution. Fix it before going further: logic built on a wrong digit leads nowhere.`,
      apply: 'Erase it',
    };
  } else {
    // Use the player's notes if every empty cell has them and none rules out the answer.
    const notesOk = game.values.every((v, i) => v || (game.notes[i] & (1 << game.solution[i])));
    const step = Sudoku.hintStep(game.values, notesOk ? game.notes : null);
    if (step) {
      h = {
        kind: 'step', step, focus: step.focus, title: step.name || Sudoku.TECHNIQUES[step.tech].name, text: step.text,
        apply: step.place ? `Place ${step.place[1]}` : 'Apply to notes',
      };
    } else {
      let i = ui.selected;
      if (i == null || game.values[i]) {
        const open: number[] = [];
        for (let k = 0; k < 81; k++) if (!game.values[k]) open.push(k);
        i = open[(Math.random() * open.length) | 0];
      }
      h = {
        kind: 'reveal', cell: i, focus: [i], title: 'Reveal a cell',
        text: `No step from the technique library applies here. ${Sudoku.cellName(i)} is ${game.solution[i]}.`,
        apply: `Place ${game.solution[i]}`,
      };
    }
  }
  game.hints++;
  record(game, { type: 'HINT_USED' });
  breakChain(game, 'hint');
  // A hinted answer can't earn placement points, even if the player types it in.
  const answer = h.kind === 'reveal' ? h.cell : h.kind === 'step' && h.step.place ? h.step.place[0] : null;
  if (answer != null && !game.credited[answer]) {
    game.credited[answer] = 1;
    record(game, { type: 'CELL_REVEALED', cell: answer });
  }
  ui.hintState = h;
  $('#hint-title').textContent = h.title;
  $('#hint-text').textContent = h.text;
  $('#hint-apply').textContent = h.apply;
  $('#hint-learn').hidden = h.kind !== 'step';
  $('#hint-card').hidden = false;
  if (h.kind === 'step' && h.step.place) ui.selected = h.step.place[0];
  else if (h.cell != null) ui.selected = h.cell;
  commit();
}

export function applyHint(): void {
  const h = ui.hintState;
  const game = playable();
  if (!h || !game) return;
  hideHint();
  snapshot(game);
  if (h.kind === 'wrong') {
    game.values[h.cell] = 0;
  } else if (h.kind === 'reveal' || h.step.place) {
    const [i, d] = h.kind === 'reveal' ? [h.cell, game.solution[h.cell]] : h.step.place!;
    game.values[i] = d;
    game.notes[i] = 0;
    if (settings.autoRemoveNotes) clearPeerNotes(game, i, d);
    ui.selected = i;
    retrigger(cells[i].el, 'pop');
    onCorrect(game, i, d, { hinted: true });
    checkWin();
  } else {
    // Elimination: make sure the affected cells show candidates, then cross them out.
    for (const [i, d] of h.step.elims || []) {
      if (!game.notes[i]) game.notes[i] = h.step.cands[i];
      game.notes[i] &= ~(1 << d);
    }
  }
  commit();
}

export function hideHint(): void {
  if (!ui.hintState) return;
  ui.hintState = null;
  $('#hint-card').hidden = true;
  if (ui.game) render();
}

export function showLearn(tech: TechId): void {
  const t = Sudoku.TECHNIQUES[tech];
  $('#learn-title').textContent = t.name;
  $('#learn-level').textContent = `${tierName(Math.max(1, t.level))} technique`;
  $('#learn-text').textContent = t.desc;
  $<HTMLDialogElement>('#dlg-learn').showModal();
}
