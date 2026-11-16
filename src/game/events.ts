/* Gameplay events: the contract between the game (which validates moves), the chain
   detector, the scoring engine and anything else that reacts to play (UI pop-ups, and later
   the effects system). Events describe what already happened; listeners never change the
   board. */

export type ModeId = 'classic' | 'qual' | 'daily' | 'time' | 'zen' | 'practice';

/** Chain patterns. Row and column chains are both "Line" chains for display and stats. */
export type ChainType = 'time' | 'number' | 'block' | 'row' | 'col';

/** r0–r8 rows, c0–c8 columns, b0–b8 blocks. */
export type RegionKey = `${'r' | 'c' | 'b'}${number}`;

/** Techniques that have their own placement reward (§7.3). Nothing attributes them yet. */
export type PlacementTechnique =
  | 'nakedSingle' | 'hiddenSingle' | 'lockedCandidates' | 'pair' | 'subset' | 'pattern' | 'chain';

export interface ChainPattern {
  type: ChainType;
  /** Placement ids in the qualifying sequence, oldest first. */
  ids: number[];
  /** Game-clock ms of the sequence's first placement. */
  firstT: number;
}

export type ChainCloseReason = 'expired' | 'mistake' | 'hint' | 'clear' | 'undo' | 'end';

export type GameEvent =
  /** The player's first correct fill of a cell this attempt. */
  | { type: 'NUMBER_PLACED'; id: number; cell: number; digit: number; technique?: PlacementTechnique | null }
  /** A hint gave the cell's answer: it is credited but earns no placement points. */
  | { type: 'CELL_REVEALED'; cell: number }
  /** Regions completed by one board change. */
  | { type: 'REGION_COMPLETED'; regions: RegionKey[] }
  /** From the chain detector: the patterns the newest placement completes. */
  | { type: 'CHAIN_EXTENDED'; placementId?: number; run: number; patterns: ChainPattern[] }
  /** The chain's window passed or play interrupted it. */
  | { type: 'CHAIN_CLOSED'; run: number; reason: ChainCloseReason }
  /** Older saved games used this before chains had ids. */
  | { type: 'CHAIN_BROKEN' }
  /** A wrong digit was confirmed. `cell` is for feedback only; scoring ignores it. */
  | { type: 'MISTAKE'; cell?: number }
  | { type: 'HINT_USED' }
  | { type: 'ASSIST_ENABLED' }
  /** `elapsed` is game time in seconds. */
  | { type: 'PUZZLE_COMPLETED'; elapsed: number };

export type GameEventType = GameEvent['type'];

/**
 * What a finished attempt achieved, announced once the result is saved (result screen
 * celebrations). Computed by the game from the saved history, never by the effects layer.
 */
export type ProgressEvent =
  | { type: 'PUZZLE_RESULT'; total: number; won: boolean }
  | { type: 'CLEAN_COMPLETION' }
  | { type: 'PERSONAL_BEST'; previous: number; score: number }
  | { type: 'DIFFICULTY_UNLOCKED'; tier: number; name: string }
  | { type: 'MASTERY_RANK_UP'; tier: number; rank: string }
  | { type: 'ACHIEVEMENT_UNLOCKED'; id: string; name: string };

/** Points the scoring engine awarded for one event, for pop-ups and effects. */
export interface Award {
  kind: 'place' | 'region' | 'multi' | 'chain';
  pts: number;
  /** Empty for plain placements. */
  label: string;
  /** For region awards: which region. */
  region?: RegionKey;
}
