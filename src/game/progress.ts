/* Progression rules: tiers, XP, levels, mastery, unlocks, achievements and statistics.
   Pure functions over the attempt history, so every summary can be rebuilt. */
import { hashString } from '../core/sudoku.ts';
import type { ModeId } from './events.ts';
import { RULES as SCORE_RULES } from './scoring.ts';

/** One finished attempt, as stored in the profile history. Short keys keep storage small. */
export interface AttemptRecord {
  pid: string;
  tier: number;
  mode: ModeId;
  start: number;
  end: number;
  /** Game time in seconds. */
  t: number;
  /** Wall-clock seconds. */
  wall: number;
  res: 'won' | 'failed' | 'abandoned';
  /** Mistakes, hints, assisted. */
  m: number;
  h: number;
  as: boolean;
  /** Final score and XP earned. */
  sc: number;
  xp: number;
  /** Under par, qualification passed. */
  up: boolean;
  qp: boolean;
  /** Space-separated techniques the puzzle needed. */
  tech: string;
  /** Scoring rules version (absent before event scoring = version 0). */
  sv?: number;
  A?: number;
  H?: number;
  S?: number;
  /** Score breakdown: placement, regions, multi-clears, chains (effective/earned), completion, time. */
  sb?: { pl: number; rg: number; mc: number; ch: number; che: number; cb: number; tb: number };
  /** Region and chain stats for the attempt. */
  ar?: ArcadeRecord;
}

export interface ArcadeRecord {
  rows: number; cols: number; blocks: number; dbl: number; tpl: number;
  chains: number; time: number; number: number; block: number; line: number; hybrid: number;
  longest: number; best: number;
}

export interface Profile {
  version: number;
  history: AttemptRecord[];
  achievements: Record<string, { at: number; xp: number }>;
  unlocked: number;
  practiced: Record<string, number>;
}

// ---------- Tiers ----------

// Par times live in the scoring rules (SCORE_RULES.par) so balancing stays in one place.
export interface Tier { id: number; key: string; name: string; blurb: string; par: number }

export const TIERS: Tier[] = [
  { id: 1, key: 'beginner', name: 'Beginner', blurb: 'Scanning and singles' },
  { id: 2, key: 'easy',     name: 'Easy',     blurb: 'Singles and candidate elimination' },
  { id: 3, key: 'medium',   name: 'Medium',   blurb: 'Locked candidates and pairs' },
  { id: 4, key: 'hard',     name: 'Hard',     blurb: 'Triples, wings and multi-step logic' },
  { id: 5, key: 'expert',   name: 'Expert',   blurb: 'X-Wing, Swordfish and complex subsets' },
  { id: 6, key: 'master',   name: 'Master',   blurb: 'Chains and advanced fish' },
].map((t) => ({ ...t, par: SCORE_RULES.par[t.id] }));
export const tier = (id: number): Tier => TIERS[id - 1];

// Requirements to unlock tier id (completed in the tier below).
export const UNLOCK: Record<number, { completed: number; clean: number; quals: number }> = {
  2: { completed: 5,  clean: 3,  quals: 0 },
  3: { completed: 10, clean: 5,  quals: 1 },
  4: { completed: 15, clean: 8,  quals: 2 },
  5: { completed: 20, clean: 12, quals: 3 },
  6: { completed: 30, clean: 20, quals: 5 },
};

export const RANKS = [
  { name: 'Bronze',   clean: 5,   underPar: 0 },
  { name: 'Silver',   clean: 15,  underPar: 5 },
  { name: 'Gold',     clean: 30,  underPar: 15 },
  { name: 'Platinum', clean: 60,  underPar: 30 },
  { name: 'Diamond',  clean: 100, underPar: 60 },
];

export const MODES: Record<ModeId, { name: string; progression: boolean; scoreMul: number }> = {
  classic: { name: 'Classic',         progression: true,  scoreMul: 1 },
  qual:    { name: 'Qualification',   progression: true,  scoreMul: 1 },
  daily:   { name: 'Daily Challenge', progression: true,  scoreMul: 1 },
  time:    { name: 'Time Attack',     progression: false, scoreMul: 1 },
  zen:     { name: 'Zen',             progression: false, scoreMul: 0.5 },
  practice:{ name: 'Practice',        progression: false, scoreMul: 0 },
};

// ---------- XP ----------
// The score itself comes from the event-driven engine in scoring.ts.

/** XP = 10 + floor(score / 100) (§17.1). Replays of an already-solved puzzle earn a quarter. */
export function xpFor({ total, mode, replay, qualPassed }: { total: number; mode: ModeId; replay: boolean; qualPassed: boolean }): number {
  let xp = mode === 'practice' ? 15 : 10 + Math.floor(total / 100);
  if (mode === 'daily' && !replay) xp += 50;
  if (qualPassed) xp += 100;
  if (replay) xp = Math.round(xp * 0.25);
  return xp;
}

// Level L needs 100 + 25·(L−1) XP to reach L+1.
export function levelInfo(xp: number) {
  let level = 1, need = 100, floor = 0;
  while (xp >= floor + need) { floor += need; level++; need = 100 + 25 * (level - 1); }
  return { level, into: xp - floor, need, pct: (xp - floor) / need };
}

// ---------- Dates ----------

export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayNum = (key: string) => Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);

function streaks(days: string[], today: string) {
  const nums = [...new Set(days)].map(dayNum).sort((a, b) => a - b);
  let best = 0, run = 0, prev: number | null = null;
  for (const n of nums) {
    run = prev != null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  const t = dayNum(today);
  const set = new Set(nums);
  let current = 0;
  let k = set.has(t) ? t : t - 1; // today not played yet doesn't break the streak
  while (set.has(k)) { current++; k--; }
  return { best, current };
}

// Daily challenge tier rotates through the week (Mon Easy … Sun Expert).
const DAILY_TIERS = [5, 2, 3, 3, 4, 3, 4]; // indexed by getDay(): Sun..Sat
export function dailyInfo(key: string) {
  const d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  return { key, tierId: DAILY_TIERS[d.getDay()], seed: hashString(`daily:${key}`), pid: `daily-${key}` };
}

export interface TierStats {
  played: number; completed: number; abandoned: number; failed: number; clean: number; quals: number; qualAttempts: number;
  progCompleted: number; progClean: number; progUnderPar: number;
  bestTime: number | null; bestScore: number; legacyBestScore: number; totalTime: number; mistakes: number; hints: number;
  times: { t: number; end: number; mode: ModeId }[];
  timeAttackBest: number | null; cleanStreak: number; bestCleanStreak: number;
}

export interface UnlockProgress {
  completed: number; clean: number; quals: number;
  req: { completed: number; clean: number; quals: number };
  pct: number; qualReady: boolean; met: boolean;
}

export interface Mastery {
  rank: number; rankName: string; next: (typeof RANKS)[number] | null; pct: number; clean: number; underPar: number;
}

// ---------- Summaries from history ----------

// Scores are only comparable within one scoring rules version. Attempts from before
// event scoring have no `sv` and count as version 0. Their scores stay as they were.
export const SCORE_VERSION = SCORE_RULES.version;
export const scoreVersion = (a: AttemptRecord) => a.sv || 0;
const sameRules = (a: AttemptRecord) => scoreVersion(a) === SCORE_VERSION;

const isWin = (a: AttemptRecord) => a.res === 'won';
export const isClean = (a: AttemptRecord) => isWin(a) && a.m === 0 && a.h === 0;

/**
 * Builds every derived number the UI needs from the attempt list.
 */
export function summarize(profile: Profile, now = Date.now()) {
  const H = profile.history;
  const today = dayKey(now);
  const perTier: Record<number, TierStats> = {};
  for (const t of TIERS) {
    perTier[t.id] = {
      played: 0, completed: 0, abandoned: 0, failed: 0, clean: 0, quals: 0, qualAttempts: 0,
      progCompleted: 0, progClean: 0, progUnderPar: 0,
      bestTime: null, bestScore: 0, legacyBestScore: 0, totalTime: 0, mistakes: 0, hints: 0, times: [],
      timeAttackBest: null, cleanStreak: 0, bestCleanStreak: 0,
    };
  }
  const solvedPids = new Set<string>();
  const creditedPids = new Set<string>();
  let completed = 0, clean = 0, played = 0, playTime = 0, totalScore = 0, attemptXp = 0;
  let cleanRun = 0, bestCleanRun = 0, underPar = 0, noHint = 0, timeAttackWins = 0, zenWins = 0;
  let nightOwl = false, comeback = false, marathon = false, lightning = false;
  const playDays: string[] = [], dailyDays: string[] = [];
  let dailyBest = 0, dailyCount = 0;
  const techCounts: Record<string, number> = {};
  // Chain totals from finished chains in completed games (each chain is counted once, when it closes).
  const chainStats = { chains: 0, time: 0, number: 0, block: 0, line: 0, hybrid: 0, longest: 0, best: 0 };

  for (const a of H) {
    const pt = perTier[a.tier];
    if (!pt || a.mode === 'practice') continue; // practice only feeds learning achievements
    played++;
    pt.played++;
    playTime += a.t || 0;
    attemptXp += a.xp || 0;
    if (a.mode === 'qual') pt.qualAttempts++;
    if (a.res === 'abandoned') pt.abandoned++;
    if (a.res === 'failed') pt.failed++;
    if (!isWin(a)) {
      if (a.mode !== 'zen') { cleanRun = 0; pt.cleanStreak = 0; }
      continue;
    }

    completed++;
    pt.completed++;
    totalScore += a.sc || 0;
    pt.totalTime += a.t;
    pt.mistakes += a.m;
    pt.hints += a.h;
    pt.times.push({ t: a.t, end: a.end, mode: a.mode });
    if (sameRules(a)) { if (a.sc > pt.bestScore) pt.bestScore = a.sc; }
    else if (a.sc > pt.legacyBestScore) pt.legacyBestScore = a.sc;
    if (a.ar) {
      for (const k of ['chains', 'time', 'number', 'block', 'line', 'hybrid'] as const) chainStats[k] += a.ar[k] || 0;
      chainStats.longest = Math.max(chainStats.longest, a.ar.longest || 0);
      chainStats.best = Math.max(chainStats.best, a.ar.best || 0);
    }
    if (a.mode !== 'zen' && (pt.bestTime == null || a.t < pt.bestTime)) pt.bestTime = a.t;
    if (a.mode === 'time' && (pt.timeAttackBest == null || a.t < pt.timeAttackBest)) pt.timeAttackBest = a.t;
    if (a.mode === 'time') timeAttackWins++;
    if (a.mode === 'zen') zenWins++;
    if (a.h === 0) noHint++;
    if (a.up) underPar++;
    playDays.push(dayKey(a.end));
    if (a.tech) for (const k of a.tech.split(' ')) techCounts[k] = (techCounts[k] || 0) + 1;

    const c = isClean(a);
    if (c) { clean++; pt.clean++; cleanRun++; pt.cleanStreak++; }
    else { cleanRun = 0; pt.cleanStreak = 0; }
    bestCleanRun = Math.max(bestCleanRun, cleanRun);
    pt.bestCleanStreak = Math.max(pt.bestCleanStreak, pt.cleanStreak);

    // Progression credit: progression modes and unique puzzles only.
    if (MODES[a.mode]?.progression && !creditedPids.has(a.pid)) {
      creditedPids.add(a.pid);
      pt.progCompleted++;
      if (c) pt.progClean++;
      if (c && a.up) pt.progUnderPar++;
    }
    if (a.mode === 'qual' && a.qp) pt.quals++;
    if (a.mode === 'daily' && !solvedPids.has(a.pid)) {
      dailyCount++;
      dailyDays.push(a.pid.slice(6));
      if (sameRules(a)) dailyBest = Math.max(dailyBest, a.sc);
    }
    solvedPids.add(a.pid);

    const hour = new Date(a.end).getHours();
    if (hour >= 0 && hour < 4) nightOwl = true;
    if (a.m >= 5) comeback = true;
    if (a.t >= 3600) marathon = true;
    if (a.tier === 1 && a.t < 120) lightning = true;
  }

  // Unlocks: derived, but once unlocked always unlocked (profile.unlocked keeps the max).
  let unlocked = Math.max(1, profile.unlocked || 1);
  const unlockProgress: Record<number, UnlockProgress> = {};
  for (let id = 2; id <= 6; id++) {
    const req = UNLOCK[id];
    const below = perTier[id - 1];
    const completed = Math.min(below.progCompleted, req.completed);
    const clean = Math.min(below.progClean, req.clean);
    const quals = Math.min(below.quals, req.quals);
    const p: UnlockProgress = {
      completed, clean, quals, req,
      pct: (completed + clean + quals) / (req.completed + req.clean + req.quals),
      qualReady: completed >= req.completed && clean >= req.clean && quals < req.quals,
      met: completed >= req.completed && clean >= req.clean && quals >= req.quals,
    };
    unlockProgress[id] = p;
    if (p.met && unlocked === id - 1) unlocked = id;
  }

  // Mastery per tier.
  const mastery: Record<number, Mastery> = {};
  for (const t of TIERS) {
    const pt = perTier[t.id];
    let rank = -1;
    for (let r = 0; r < RANKS.length; r++) {
      if (pt.progClean >= RANKS[r].clean && pt.progUnderPar >= RANKS[r].underPar) rank = r;
    }
    const nextR = RANKS[rank + 1];
    let pct = 1;
    if (nextR) {
      const parts = [Math.min(1, pt.progClean / nextR.clean)];
      if (nextR.underPar) parts.push(Math.min(1, pt.progUnderPar / nextR.underPar));
      pct = parts.reduce((x, y) => x + y, 0) / parts.length;
    }
    mastery[t.id] = { rank, rankName: rank >= 0 ? RANKS[rank].name : 'Unranked', next: nextR || null, pct, clean: pt.progClean, underPar: pt.progUnderPar };
  }

  const st = streaks(playDays, today);
  const dst = streaks(dailyDays, today);
  const achXp = Object.values(profile.achievements || {}).reduce((s, x) => s + (x.xp || 0), 0);
  const xp = attemptXp + achXp;

  const stats = {
    played, completed, clean, playTime, totalScore, xp, level: levelInfo(xp),
    winRate: played ? completed / played : 0,
    abandoned: H.filter((a) => a.res === 'abandoned').length,
    failed: H.filter((a) => a.res === 'failed').length,
    streak: st, dailyStreak: dst, dailyCount, dailyBest, dailyDoneToday: H.some((a) => a.mode === 'daily' && isWin(a) && a.pid === `daily-${today}`),
    bestCleanRun, underPar, noHint, timeAttackWins, zenWins, nightOwl, comeback, marathon, lightning,
    perTier, unlocked, unlockProgress, mastery, techCounts, chainStats,
    practiced: Object.keys(profile.practiced || {}).length,
    hiddenFound: 0,
  };
  return stats;
}

// ---------- Achievements ----------
// progress(stats) returns [current, target]. Hidden ones stay secret until earned.

export type Summary = ReturnType<typeof summarize>;

export interface Achievement {
  id: string;
  group: string;
  name: string;
  desc: string;
  xp: number;
  /** [current, target] */
  progress: (s: Summary) => [number, number];
  hidden: boolean;
}

const tierDone = (id: number) => (s: Summary): [number, number] => [s.perTier[id].completed, 1];
const A = (id: string, group: string, name: string, desc: string, xp: number, progress: Achievement['progress'], hidden = false): Achievement =>
  ({ id, group, name, desc, xp, progress, hidden });

export const ACHIEVEMENTS: Achievement[] = [
  A('first-steps', 'Milestones', 'First Steps', 'Complete your first puzzle', 50, (s) => [s.completed, 1]),
  A('ten', 'Milestones', 'Getting Started', 'Complete 10 puzzles', 100, (s) => [s.completed, 10]),
  A('fifty', 'Milestones', 'Regular', 'Complete 50 puzzles', 200, (s) => [s.completed, 50]),
  A('hundred', 'Milestones', 'Centurion', 'Complete 100 puzzles', 400, (s) => [s.completed, 100]),
  A('five-hundred', 'Milestones', 'Devotee', 'Complete 500 puzzles', 1000, (s) => [s.completed, 500]),
  A('thousand', 'Milestones', 'Thousand Grids', 'Complete 1,000 puzzles', 2500, (s) => [s.completed, 1000]),
  A('level-10', 'Milestones', 'Seasoned', 'Reach level 10', 200, (s) => [s.level.level, 10]),
  A('level-25', 'Milestones', 'Veteran', 'Reach level 25', 600, (s) => [s.level.level, 25]),

  A('clear-easy', 'Difficulty', 'Easy Does It', 'Complete an Easy puzzle', 50, tierDone(2)),
  A('clear-medium', 'Difficulty', 'Middle Ground', 'Complete a Medium puzzle', 100, tierDone(3)),
  A('clear-hard', 'Difficulty', 'Hard Won', 'Complete a Hard puzzle', 200, tierDone(4)),
  A('clear-expert', 'Difficulty', 'First Expert Clear', 'Complete an Expert puzzle', 400, tierDone(5)),
  A('clear-master', 'Difficulty', 'Into the Deep', 'Complete a Master puzzle', 800, tierDone(6)),
  A('logical-thinker', 'Difficulty', 'Logical Thinker', 'Complete 50 Hard puzzles', 500, (s) => [s.perTier[4].completed, 50]),
  A('expert-25', 'Difficulty', 'Expert Hands', 'Complete 25 Expert puzzles', 800, (s) => [s.perTier[5].completed, 25]),
  A('master-100', 'Difficulty', 'Master of Masters', 'Complete 100 Master puzzles', 1500, (s) => [s.perTier[6].completed, 100]),
  A('grandmaster', 'Difficulty', 'Sudoku Grandmaster', 'Complete 100 Master puzzles cleanly', 2000, (s) => [s.perTier[6].clean, 100]),

  A('unlock-easy', 'Progression', 'Promoted', 'Unlock Easy', 50, (s) => [s.unlocked >= 2 ? 1 : 0, 1]),
  A('unlock-medium', 'Progression', 'Qualified', 'Unlock Medium', 150, (s) => [s.unlocked >= 3 ? 1 : 0, 1]),
  A('unlock-hard', 'Progression', 'Proven', 'Unlock Hard', 300, (s) => [s.unlocked >= 4 ? 1 : 0, 1]),
  A('unlock-expert', 'Progression', 'Elite', 'Unlock Expert', 600, (s) => [s.unlocked >= 5 ? 1 : 0, 1]),
  A('unlock-master', 'Progression', 'Summit', 'Unlock Master', 1200, (s) => [s.unlocked >= 6 ? 1 : 0, 1]),
  A('bronze', 'Progression', 'Bronze Mind', 'Reach Bronze mastery in any difficulty', 100, (s) => [Object.values(s.mastery).some((m) => m.rank >= 0) ? 1 : 0, 1]),
  A('gold', 'Progression', 'Golden', 'Reach Gold mastery in any difficulty', 500, (s) => [Object.values(s.mastery).some((m) => m.rank >= 2) ? 1 : 0, 1]),
  A('diamond', 'Progression', 'Diamond Mind', 'Reach Diamond mastery in any difficulty', 1500, (s) => [Object.values(s.mastery).some((m) => m.rank >= 4) ? 1 : 0, 1]),

  A('on-fire', 'Consistency', 'On Fire', '7-day playing streak', 200, (s) => [s.streak.best, 7]),
  A('habit', 'Consistency', 'Habit', '30-day playing streak', 600, (s) => [s.streak.best, 30]),
  A('unstoppable', 'Consistency', 'Unstoppable', '100-day playing streak', 2000, (s) => [s.streak.best, 100]),
  A('daily-first', 'Consistency', 'Daily Ritual', 'Complete a Daily Challenge', 50, (s) => [s.dailyCount, 1]),
  A('daily-week', 'Consistency', 'Week of Dailies', '7 Daily Challenges in a row', 300, (s) => [s.dailyStreak.best, 7]),
  A('daily-30', 'Consistency', 'Daily Devotion', 'Complete 30 Daily Challenges', 600, (s) => [s.dailyCount, 30]),

  A('clean-first', 'Skill', 'Clean Sheet', 'Complete a puzzle with no mistakes and no hints', 50, (s) => [s.clean, 1]),
  A('perfectionist', 'Skill', 'Perfectionist', '10 clean games in a row', 300, (s) => [s.bestCleanRun, 10]),
  A('flawless-50', 'Skill', 'Flawless', '50 clean games', 500, (s) => [s.clean, 50]),
  A('speed-demon', 'Skill', 'Speed Demon', 'Complete 10 puzzles below par time', 250, (s) => [s.underPar, 10]),
  A('self-reliant', 'Skill', 'Self-Reliant', 'Complete 25 puzzles without hints', 200, (s) => [s.noHint, 25]),
  A('clean-expert', 'Skill', 'Precision', 'Complete an Expert puzzle cleanly', 400, (s) => [s.perTier[5].clean, 1]),
  A('beat-clock', 'Skill', 'Beat the Clock', 'Win 5 Time Attack games', 200, (s) => [s.timeAttackWins, 5]),

  A('student', 'Learning', 'Student', 'Complete a technique practice', 50, (s) => [s.practiced, 1]),
  A('scholar', 'Learning', 'Scholar', 'Practice 8 different techniques', 300, (s) => [s.practiced, 8]),
  A('professor', 'Learning', 'Professor', 'Practice 16 different techniques', 800, (s) => [s.practiced, 16]),
  A('chain-reader', 'Learning', 'Chain Reader', 'Complete a puzzle that needs a chain', 400, (s) => [(s.techCounts.xChain || 0) + (s.techCounts.xyChain || 0) > 0 ? 1 : 0, 1]),

  A('chain-first', 'Chains', 'Chain Reaction', 'Finish a puzzle with at least one chain', 50, (s) => [s.chainStats.chains, 1]),
  A('chain-number', 'Chains', 'Number Hunter', 'Complete a Number Chain: the same digit three times in a row', 100, (s) => [s.chainStats.number, 1]),
  A('chain-block-25', 'Chains', 'Block Master', 'Complete 25 Block Chains', 300, (s) => [s.chainStats.block, 25]),
  A('chain-line-25', 'Chains', 'Line Runner', 'Complete 25 Line Chains', 300, (s) => [s.chainStats.line, 25]),
  A('chain-6', 'Chains', 'In the Zone', 'Reach 6 placements in one chain', 150, (s) => [s.chainStats.longest, 6]),
  A('chain-8', 'Chains', 'Legendary', 'Reach 8 placements in one chain', 400, (s) => [s.chainStats.longest, 8]),
  A('chain-hybrid-10', 'Chains', 'Hybrid Specialist', 'Complete 10 Hybrid Chains (same block and same line)', 400, (s) => [s.chainStats.hybrid, 10]),
  A('chain-100', 'Chains', 'Chain Addict', 'Complete 100 chains', 600, (s) => [s.chainStats.chains, 100]),
  A('chain-jackpot', 'Chains', 'Jackpot', 'Earn 2,000+ points from one chain', 500, (s) => [s.chainStats.best >= 2000 ? 1 : 0, 1]),

  A('night-owl', 'Hidden', 'Night Owl', 'Complete a puzzle between midnight and 4 AM', 100, (s) => [s.nightOwl ? 1 : 0, 1], true),
  A('lightning', 'Hidden', 'Lightning', 'Complete a Beginner puzzle in under 2 minutes', 150, (s) => [s.lightning ? 1 : 0, 1], true),
  A('comeback', 'Hidden', 'Never Give Up', 'Finish a puzzle after making 5 or more mistakes', 100, (s) => [s.comeback ? 1 : 0, 1], true),
  A('marathon', 'Hidden', 'Marathon', 'Spend over an hour on one puzzle and finish it', 150, (s) => [s.marathon ? 1 : 0, 1], true),
  A('zen-10', 'Hidden', 'Inner Calm', 'Complete 10 Zen puzzles', 150, (s) => [s.zenWins, 10], true),
];

/** Returns newly earned achievements (and records them on the profile). */
export function awardAchievements(profile: Profile, now = Date.now()): Achievement[] {
  const earned: Achievement[] = [];
  profile.achievements = profile.achievements || {};
  // Loop: achievement XP can raise the level, which can earn level achievements.
  for (let pass = 0; pass < 3; pass++) {
    const s = summarize(profile, now);
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id]) continue;
      const [cur, target] = a.progress(s);
      if (cur >= target) {
        profile.achievements[a.id] = { at: now, xp: a.xp };
        earned.push(a);
        any = true;
      }
    }
    if (!any) break;
  }
  return earned;
}

