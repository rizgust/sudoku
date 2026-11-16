/* Shared UI state: settings, the saved profile, the game in progress and view state.
   Every UI module reads and writes this one place, so persistence lives here too. */
import type { HintStep, TechId } from '../core/sudoku.ts';
import type { ChainState } from '../game/chains.ts';
import type { GameEvent, ModeId } from '../game/events.ts';
import * as Progress from '../game/progress.ts';
import type { AttemptRecord, Profile, Summary } from '../game/progress.ts';
import type { ScoreState } from '../game/scoring.ts';

export const KEYS = { game: 'sudoku.v2.game', settings: 'sudoku.settings.v1', profile: 'sudoku.v2.profile' } as const;
export const MAX_HISTORY = 500;

// ---------- Types ----------

export interface Settings {
  highlightMistakes: boolean;
  highlightSame: boolean;
  autoRemoveNotes: boolean;
  advancedAssists: boolean;
  vibrate: boolean;
  theme: 'auto' | 'light' | 'dark';
  scoreFx: boolean;
  chainHud: boolean;
  levelsOpen?: boolean;
}

export interface Game {
  v: 2;
  mode: ModeId;
  tier: number;
  pid: string;
  /** Practice: the technique being practised. */
  tech: TechId | null;
  /** Space-separated techniques the puzzle needs. */
  techs: string;
  puzzle: number[];
  solution: number[];
  values: number[];
  /** Candidate notes as bit masks (bit d set = d noted). */
  notes: number[];
  mistakes: number;
  hints: number;
  assisted: boolean;
  /** Game time in seconds, paused time excluded. */
  elapsed: number;
  start: number;
  moved: boolean;
  /** Undo snapshots. */
  history: { v: number[]; n: number[] }[];
  completed: boolean;
  result?: AttemptRecord['res'];
  // Event scoring (added by initScoring for games saved before it existed).
  score: ScoreState;
  chain: ChainState;
  /** 1 once a cell was correctly filled (or revealed) this attempt. */
  credited: number[];
  /** Every gameplay event of the attempt, so the score can be replayed. */
  events: GameEvent[];
  /** Last placement id. */
  seq: number;
}

interface HintBase { focus: number[]; title: string; text: string; apply: string }
export type HintState =
  | (HintBase & { kind: 'wrong'; cell: number })
  | (HintBase & { kind: 'reveal'; cell: number })
  | (HintBase & { kind: 'step'; step: HintStep; cell?: undefined });

export type View = 'home' | 'game' | 'stats' | 'awards';

// ---------- Storage ----------

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage unavailable */ }
  },
};

export const settings: Settings = Object.assign(
  { highlightMistakes: true, highlightSame: true, autoRemoveNotes: true, advancedAssists: false, vibrate: true, theme: 'auto', scoreFx: true, chainHud: true } satisfies Settings,
  store.get<Partial<Settings>>(KEYS.settings, {}),
);

export const profile: Profile = Object.assign(
  { version: 2, history: [], achievements: {}, unlocked: 1, practiced: {} } satisfies Profile,
  store.get<Partial<Profile>>(KEYS.profile, {}),
);

/** Mutable view state shared by the UI modules. */
export const ui = {
  summary: Progress.summarize(profile) as Summary,
  game: null as Game | null,
  selected: null as number | null,
  /** Digit whose rows and columns are shaded when no cell is selected. */
  focusDigit: null as number | null,
  notesMode: false,
  paused: false,
  view: 'home' as View,
  hintState: null as HintState | null,
  loading: false,
};

export const saveGame = () => store.set(KEYS.game, ui.game && !ui.game.completed ? ui.game : null);
export const saveSettings = () => store.set(KEYS.settings, settings);
export const saveProfile = () => store.set(KEYS.profile, profile);

export function refresh(): void {
  ui.summary = Progress.summarize(profile);
  if (ui.summary.unlocked > profile.unlocked) profile.unlocked = ui.summary.unlocked;
}

export function isValidGame(g: unknown): g is Game {
  const x = g as Partial<Game> | null;
  const arr = (a: unknown) => Array.isArray(a) && a.length === 81;
  return !!x && x.v === 2 && !!x.mode && !!Progress.MODES[x.mode] && !!Progress.tier(x.tier ?? 0) &&
    arr(x.puzzle) && arr(x.solution) && arr(x.values) && arr(x.notes);
}

/** The game in progress, or null once it's finished. */
export const activeGame = (): Game | null => (ui.game && !ui.game.completed ? ui.game : null);
export const inProgress = () => !!activeGame();
/** The game, if input is allowed right now. */
export const playable = (): Game | null => (ui.view === 'game' && !ui.paused && !ui.loading ? activeGame() : null);

export const assistsAllowed = () => settings.advancedAssists && !!ui.game && ui.game.mode !== 'qual';
export const hintsAllowed = () => !!ui.game && ui.game.mode !== 'qual';

export const tierName = (id: number) => Progress.tier(id).name;
export const today = () => Progress.dayKey(Date.now());
