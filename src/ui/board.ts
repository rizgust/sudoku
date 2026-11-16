/* The board and number pad: building the DOM and rendering the game into it. */
import { BOX, COL, ROW, TECHNIQUES } from '../core/sudoku.ts';
import * as Progress from '../game/progress.ts';
import { input } from './actions.ts';
import { $, $$, buzz, formatTime, ICON_PAUSE, ICON_PLAY, toast } from './dom.ts';
import { markTick, record } from './gameplay-events.ts';
import { renderChain, renderScore } from './hud.ts';
import { assistsAllowed, guidesAllowed, hintsAllowed, inProgress, saveGame, settings, ui, type Game } from './state.ts';

interface CellEls { el: HTMLDivElement; val: HTMLSpanElement; notes: HTMLCollection }
export const cells: CellEls[] = [];
const numButtons: HTMLButtonElement[] = [];
export const boardEl = () => $('#board');

export function buildBoard(): void {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.className = `cell r${ROW[i]} c${COL[i]}`;
    el.setAttribute('role', 'gridcell');
    el.dataset.i = String(i);
    const val = document.createElement('span');
    val.className = 'value';
    const notes = document.createElement('div');
    notes.className = 'notes';
    for (let d = 1; d <= 9; d++) {
      const s = document.createElement('span');
      s.textContent = String(d);
      notes.appendChild(s);
    }
    el.append(val, notes);
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'flash') el.classList.remove('flash');
      if (e.animationName === 'shake') el.classList.remove('shake');
      if (e.animationName === 'pop') el.classList.remove('pop');
    });
    frag.appendChild(el);
    cells.push({ el, val, notes: notes.children });
  }
  boardEl().appendChild(frag);

  const numpad = $('#numpad');
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'num';
    b.innerHTML = `<span class="d">${d}</span><span class="left"></span>`;
    b.setAttribute('aria-label', `Enter ${d}`);
    bindNumButton(b, d);
    numpad.appendChild(b);
    numButtons.push(b);
  }
}

// Tap = normal input. Long-press = the opposite mode (note instead of number, or vice versa).
const LONG_PRESS_MS = 420;
function bindNumButton(b: HTMLButtonElement, d: number): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    b.classList.remove('long-press');
  };
  b.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fired = false;
    cancel();
    timer = setTimeout(() => {
      fired = true;
      b.classList.add('long-press');
      buzz(12);
      input(d, !ui.notesMode);
    }, LONG_PRESS_MS);
  });
  b.addEventListener('pointerup', cancel);
  b.addEventListener('pointerleave', cancel);
  b.addEventListener('pointercancel', cancel);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    if (fired) { fired = false; return; }
    // With no cell selected, tapping a digit toggles its line shading.
    ui.focusDigit = ui.selected == null && ui.focusDigit === d ? null : d;
    input(d);
    render();
  });
}

/** Guide lines count as an assist: the first time they show, the attempt scores ×0.9. */
function markGuided(game: Game): void {
  if (game.guided) return;
  game.guided = true;
  record(game, { type: 'GUIDES_USED' });
  saveGame();
  if (game.mode !== 'practice') toast('Guide lines on: score ×0.9 for this puzzle');
}

export function setPaused(p: boolean): void {
  if (ui.paused && !p) markTick();
  ui.paused = !!p && inProgress();
  boardEl().classList.toggle('paused', ui.paused || ui.loading);
  $('#pause-overlay').hidden = !ui.paused;
  const btn = $('#btn-pause');
  btn.innerHTML = ui.paused ? ICON_PLAY : ICON_PAUSE;
  btn.setAttribute('aria-label', ui.paused ? 'Resume' : 'Pause');
  btn.title = ui.paused ? 'Resume (P)' : 'Pause (P)';
}

export function renderTimer(): void {
  const game = ui.game;
  if (!game) return;
  const el = $('#timer');
  if (game.mode === 'time') {
    const left = Progress.tier(game.tier).par - game.elapsed;
    el.textContent = formatTime(left);
    el.classList.toggle('low', left <= 60);
  } else {
    el.textContent = formatTime(game.elapsed);
    el.classList.remove('low');
  }
}

export function render(): void {
  const game = ui.game;
  if (!game) return;
  const { values, puzzle, solution, notes } = game;
  const { hintState } = ui;
  const sel = ui.selected;
  // The digit being studied: the selected cell's value, else the last number-pad digit tapped.
  const selVal = (sel != null ? values[sel] : 0) || ui.focusDigit || 0;
  const counts = new Array<number>(10).fill(0);
  // Rows and columns that already hold that digit get shaded, so the open spots stand out.
  const lineRows = new Set<number>(), lineCols = new Set<number>();
  if (selVal && !hintState && guidesAllowed()) {
    for (let i = 0; i < 81; i++) if (values[i] === selVal) { lineRows.add(ROW[i]); lineCols.add(COL[i]); }
    if (lineRows.size && !game.completed) markGuided(game);
  }

  const focus = new Set(hintState ? hintState.focus : []);
  const step = hintState?.kind === 'step' ? hintState.step : null;
  const target = step?.place ? step.place[0] : (hintState?.cell ?? -1);
  const elimMap = new Map<number, number>();
  if (step?.elims) for (const [i, d] of step.elims) elimMap.set(i, (elimMap.get(i) || 0) | (1 << d));

  for (let i = 0; i < 81; i++) {
    const v = values[i];
    if (v) counts[v]++;
    const c = cells[i];
    const cl = c.el.classList;
    const isPeer = sel != null && i !== sel &&
      (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]);

    c.val.textContent = v ? String(v) : '';
    cl.toggle('has-value', !!v);
    cl.toggle('given', !!puzzle[i]);
    cl.toggle('user', !puzzle[i] && !!v);
    cl.toggle('error', settings.highlightMistakes && !puzzle[i] && !!v && v !== solution[i]);
    cl.toggle('selected', i === sel);
    cl.toggle('peer', isPeer && !hintState);
    cl.toggle('line', v !== selVal && (lineRows.has(ROW[i]) || lineCols.has(COL[i])));
    cl.toggle('same', settings.highlightSame && !!selVal && v === selVal && i !== sel);
    cl.toggle('hint-focus', focus.has(i));
    cl.toggle('hint-target', i === target);
    cl.toggle('hint-elim', elimMap.has(i));

    const em = elimMap.get(i) || 0;
    const m = notes[i] | (em && !notes[i] && step ? step.cands[i] : 0);
    for (let d = 1; d <= 9; d++) {
      const s = c.notes[d - 1].classList;
      const on = !v && !!(m & (1 << d));
      s.toggle('on', on);
      s.toggle('hl', on && settings.highlightSame && selVal === d);
      s.toggle('x', !!(em & (1 << d)));
    }
  }

  for (let d = 1; d <= 9; d++) {
    const left = Math.max(0, 9 - counts[d]);
    const b = numButtons[d - 1];
    b.querySelector('.left')!.textContent = String(left);
    b.classList.toggle('done', left === 0);
    b.classList.toggle('active', d === selVal);
  }

  const t = Progress.tier(game.tier);
  const practiceTech = game.mode === 'practice' && game.tech ? TECHNIQUES[game.tech] : null;
  $('#game-title').textContent = practiceTech ? `Practice · ${practiceTech.name}` : Progress.MODES[game.mode].name;
  let sub = t.name;
  if (game.mode === 'qual') sub += ` · No hints · ${Math.max(0, 1 - game.mistakes)} mistake left`;
  if (game.mode === 'time') sub += ` · Par ${formatTime(t.par)}`;
  if (game.mode === 'daily') sub += ` · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  $('#game-sub').textContent = sub;

  $('#numpad').classList.toggle('notes-mode', ui.notesMode);
  $('#btn-notes').setAttribute('aria-pressed', String(ui.notesMode));
  $('#notes-badge').textContent = ui.notesMode ? 'ON' : 'OFF';
  $('.touch-help').textContent = ui.notesMode
    ? 'Tip: long-press a number to place it instead of a note.'
    : 'Tip: long-press a number to add it as a note.';
  const done = game.completed;
  $<HTMLButtonElement>('#btn-undo').disabled = !game.history.length || done;
  $<HTMLButtonElement>('#btn-hint').disabled = done || !hintsAllowed();
  $('#btn-hint').hidden = !hintsAllowed();
  $<HTMLButtonElement>('#btn-erase').disabled = done;
  $('#btn-autonotes').hidden = !assistsAllowed();
  $<HTMLButtonElement>('#btn-autonotes').disabled = done;
  $('#view-game').style.setProperty('--tc', `var(--t${game.tier || 1})`);
  $('#tools').style.setProperty('--tools', String($$('#tools .tool:not([hidden])').length));

  $('#mistakes').textContent = game.mode === 'qual' ? `${game.mistakes}/1` : String(game.mistakes);
  $('#score-wrap').hidden = game.mode === 'practice';
  $('#timer-wrap').hidden = game.mode === 'zen';
  $('#btn-pause').hidden = game.mode === 'zen';

  $('#practice-card').hidden = game.mode !== 'practice' || done || !!hintState;
  if (practiceTech) {
    $('#practice-title').textContent = `Find the ${practiceTech.name}`;
    $('#practice-text').textContent = practiceTech.desc;
  }
  renderTimer();
  renderScore();
  renderChain();
}
