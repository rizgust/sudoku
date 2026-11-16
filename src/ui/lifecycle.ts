/* Starting, finishing and abandoning games. */
import { hashString, TECHNIQUES, toString, type TechId } from '../core/sudoku.ts';
import type { ModeId } from '../game/events.ts';
import * as Progress from '../game/progress.ts';
import type { AttemptRecord } from '../game/progress.ts';
import { boardEl, render, setPaused } from './board.ts';
import { $, buzz, nextFrame, toast } from './dom.ts';
import { breakChain, initScoring, markTick, record } from './gameplay-events.ts';
import { hideHint } from './hints.ts';
import { clearFx } from '../effects/index.ts';
import { makePuzzle, practicePuzzle, prefetch, takePuzzle, type PuzzleData } from './puzzle-source.ts';
import { showResult } from './result.ts';
import { route } from './router.ts';
import { confirmDialog } from './screens/dialogs.ts';
import { activeGame, KEYS, profile, refresh, saveGame, saveProfile, store, tierName, today, ui, type Game } from './state.ts';

/** Runs `fn` after confirming that the current game may be abandoned. */
export function guardAbandon(fn: () => void): void {
  const game = activeGame();
  if (!game || !game.moved) { fn(); return; }
  const isQual = game.mode === 'qual';
  confirmDialog(
    isQual ? 'Abandon qualification?' : 'Start a new game?',
    isQual ? 'Leaving now counts as a failed qualification attempt.' : `Your ${Progress.MODES[game.mode].name} ${tierName(game.tier)} game will be recorded as abandoned.`,
    'Abandon',
    () => { finish('abandoned', { silent: true }); fn(); },
  );
}

export interface StartOptions { mode: ModeId; tier?: number; tech?: TechId | null }

export async function startGame({ mode, tier, tech = null }: StartOptions): Promise<void> {
  if (ui.loading) return;
  ui.loading = true;
  hideHint();
  const prev = ui.game;
  ui.game = null;
  ui.selected = null;
  ui.focusDigit = null;
  ui.notesMode = false;
  route('game');
  $('#loading-overlay').hidden = false;
  boardEl().classList.add('paused');
  await nextFrame();

  let tierId = tier ?? 1;
  let p: PuzzleData | null = null;
  let pid: string | undefined;
  if (mode === 'daily') {
    const info = Progress.dailyInfo(today());
    tierId = info.tierId;
    p = await makePuzzle(tierId, { seed: info.seed });
    pid = info.pid;
  } else if (mode === 'practice') {
    p = tech ? practicePuzzle(tech) : null;
    if (p && tech) tierId = Math.max(1, TECHNIQUES[tech].level);
  } else {
    p = await takePuzzle(tierId);
  }
  ui.loading = false;
  $('#loading-overlay').hidden = true;
  if (!p) { ui.game = prev; toast('No practice puzzle available for that technique yet.'); route('home'); return; }
  const data = p;
  pid = pid || `${mode === 'practice' ? 'pr' : 'p'}-${hashString(toString(data.puzzle)).toString(36)}`;

  const game = {
    v: 2,
    mode,
    tier: tierId,
    pid,
    tech: tech || null,
    techs: data.techs,
    puzzle: data.puzzle,
    solution: data.solution,
    values: data.puzzle.slice(),
    notes: data.notes ? data.notes.map((m, i) => (data.puzzle[i] ? 0 : m)) : new Array(81).fill(0),
    mistakes: 0,
    hints: 0,
    assisted: false,
    elapsed: 0,
    start: Date.now(),
    moved: false,
    history: [],
    completed: false,
  } as unknown as Game;
  initScoring(game);
  ui.game = game;
  clearFx();
  markTick();
  setPaused(false);
  saveGame();
  render();
  if (mode !== 'daily' && mode !== 'practice') prefetch(tierId);
}

export function checkWin(): void {
  const game = ui.game;
  if (!game || !game.values.every((v, k) => v === game.solution[k])) return;
  finish('won');
}

export function finish(res: AttemptRecord['res'], { silent = false, reason = null as 'time' | 'mistakes' | null } = {}): void {
  const game = ui.game;
  if (!game || game.completed) return;
  hideHint();
  const before = ui.summary;
  const t = Progress.tier(game.tier);
  const end = Date.now();
  const won = res === 'won';
  breakChain(game, 'end');
  if (won) record(game, { type: 'PUZZLE_COMPLETED', elapsed: game.elapsed });
  const sc = won ? game.score.final : null;
  const st = game.score.stats;
  const replay = profile.history.some((a) => a.pid === game.pid && a.res === 'won');
  const qualPassed = game.mode === 'qual' && won && game.mistakes <= 1 && game.hints === 0 && !game.assisted;
  const xp = sc ? Progress.xpFor({ total: sc.total, mode: game.mode, replay, qualPassed }) : 0;
  if (res === 'abandoned' && game.mode === 'qual') res = 'failed';

  const rec: AttemptRecord = {
    pid: game.pid, tier: game.tier, mode: game.mode, start: game.start, end,
    t: game.elapsed, wall: Math.round((end - game.start) / 1000), res,
    m: game.mistakes, h: game.hints, as: game.assisted,
    sc: sc ? sc.total : 0, xp, up: won && game.elapsed <= t.par, qp: qualPassed,
    tech: won ? game.techs : '',
  };
  // Breakdown, rules version and arcade stats, so results stay explainable after rule changes.
  if (sc) {
    Object.assign(rec, {
      sv: sc.v, A: sc.A, H: sc.H, S: sc.S,
      sb: { pl: sc.placement, rg: sc.region, mc: sc.multi, ch: sc.chain, che: sc.chainEarned, cb: sc.completion, tb: sc.time },
    });
  }
  if (game.mode !== 'practice') {
    rec.ar = {
      rows: st.rows, cols: st.cols, blocks: st.blocks, dbl: st.double, tpl: st.triple,
      chains: st.chains, ...st.byType, longest: st.longest, best: st.bestChain,
    };
  }
  profile.history.push(rec);
  if (won && game.mode === 'practice' && game.tech) profile.practiced[game.tech] = end;
  const newAch = won ? Progress.awardAchievements(profile, end) : [];
  refresh();
  saveProfile();

  game.completed = true;
  game.result = res;
  store.set(KEYS.game, null);
  render();
  if (silent) return;

  setTimeout(() => {
    buzz(won ? [20, 60, 20, 60, 40] : [60, 40, 60]);
    showResult({ rec, sc, before, newAch, qualPassed, replay, reason });
  }, won ? 750 : 250);
}

export function nextFromResult(): void {
  $<HTMLDialogElement>('#dlg-result').close();
  const game = ui.game;
  if (!game) return;
  const { mode, tier: tierId, tech } = game;
  if (mode === 'qual') {
    const up = ui.summary.unlockProgress[tierId + 1];
    void startGame({ mode: up && up.qualReady ? 'qual' : 'classic', tier: up && up.qualReady ? tierId : ui.summary.unlocked });
  } else void startGame({ mode, tier: tierId, tech });
}
