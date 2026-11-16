/* The statistics screen. */
import { TECHNIQUES, type TechId } from '../../core/sudoku.ts';
import * as Progress from '../../game/progress.ts';
import type { ArcadeRecord, AttemptRecord } from '../../game/progress.ts';
import { $, fmt, formatTime, minutes, pct } from '../dom.ts';
import { profile, tierName, ui } from '../state.ts';

let statsFilter = 'all';
export function setStatsFilter(f: string): void {
  statsFilter = f;
  renderStats();
}

const currentRules = (a: AttemptRecord) => Progress.scoreVersion(a) === Progress.SCORE_VERSION;

export function renderStats(): void {
  const s = ui.summary;
  const tile = (label: string, value: string | number) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
  const sel = statsFilter === 'all' ? null : +statsFilter;
  const H = profile.history;
  const rows = sel ? H.filter((a) => a.tier === sel) : H;
  const wins = rows.filter((a) => a.res === 'won');
  const timed = wins.filter((a) => a.mode !== 'zen' && a.mode !== 'practice');
  const avg = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
  const scored = wins.filter((a) => currentRules(a) && a.mode !== 'practice');

  const detail: Record<string, string | number> = {
    Played: rows.length,
    Completed: wins.length,
    Abandoned: rows.filter((a) => a.res === 'abandoned').length,
    Failed: rows.filter((a) => a.res === 'failed').length,
    'Win rate': rows.length ? pct(wins.length / rows.length) : '–',
    'Best time': timed.length ? formatTime(Math.min(...timed.map((a) => a.t))) : '–',
    'Average time': timed.length ? formatTime(avg(timed.map((a) => a.t))) : '–',
    'Best score': scored.length ? fmt(Math.max(...scored.map((a) => a.sc))) : '–',
    'Clean games': wins.filter(Progress.isClean).length,
    'Mistakes per game': wins.length ? avg(wins.map((a) => a.m)).toFixed(1) : '–',
    'Hints per game': wins.length ? avg(wins.map((a) => a.h)).toFixed(1) : '–',
    'Under par': wins.filter((a) => a.up).length,
  };

  // Solve-time trend: last 30 timed wins for the selected tier (or the most-played tier).
  let trendTier = sel;
  if (!trendTier) {
    let bestN = 0;
    for (const t of Progress.TIERS) { const n = s.perTier[t.id].times.length; if (n > bestN) { bestN = n; trendTier = t.id; } }
  }
  const series = trendTier ? H.filter((a) => a.tier === trendTier && a.res === 'won' && a.mode !== 'zen' && a.mode !== 'practice').slice(-30) : [];
  let improvement = '';
  if (trendTier && series.length >= 6) {
    const half = Math.floor(series.length / 2);
    const a1 = avg(series.slice(0, half).map((a) => a.t)), a2 = avg(series.slice(half).map((a) => a.t));
    const dir = a2 < a1 ? 'dropped' : 'rose';
    improvement = `Your average ${tierName(trendTier)} time ${dir} from ${minutes(a1)} to ${minutes(a2)} over the last ${series.length} puzzles.`;
  }

  const maxDone = Math.max(1, ...Progress.TIERS.map((t) => s.perTier[t.id].completed));
  const techLevel = (k: string) => TECHNIQUES[k as TechId]?.level ?? 0;
  const techList = Object.entries(s.techCounts)
    .filter(([k]) => k in TECHNIQUES)
    .sort((a, b) => techLevel(a[0]) - techLevel(b[0]) || b[1] - a[1]);

  $('#stats-root').innerHTML = `
    <div class="tiles">
      ${tile(`Level · ${fmt(s.xp)} XP`, s.level.level)}
      ${tile('Puzzles completed', fmt(s.completed))}
      ${tile('Win rate', s.played ? pct(s.winRate) : '–')}
      ${tile('Perfect games', fmt(s.clean))}
      ${tile('Longest streak', `${s.streak.best} day${s.streak.best === 1 ? '' : 's'}`)}
      ${tile('Current streak', `${s.streak.current} day${s.streak.current === 1 ? '' : 's'}`)}
      ${tile('Play time', s.playTime >= 3600 ? `${(s.playTime / 3600).toFixed(1)} h` : minutes(s.playTime))}
      ${tile('Total score', fmt(s.totalScore))}
    </div>

    <h2 class="section-title">Performance by difficulty</h2>
    <div class="card bars">
      ${Progress.TIERS.map((t) => {
        const pt = s.perTier[t.id];
        return `<div class="bar-row"><span>${t.name}</span><span class="bar"><i style="width:${(pt.completed / maxDone) * 100}%"></i></span><b>${pt.completed}</b></div>`;
      }).join('')}
    </div>

    <div class="chips" role="tablist">
      <button class="chip-btn" type="button" data-filter="all" aria-pressed="${!sel}">All</button>
      ${Progress.TIERS.map((t) => `<button class="chip-btn" type="button" data-filter="${t.id}" aria-pressed="${sel === t.id}">${t.name}</button>`).join('')}
    </div>

    <div class="card">
      <table class="kv">${Object.entries(detail).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    </div>

    <h2 class="section-title">Solve time${trendTier ? ` · ${tierName(trendTier)}` : ''}</h2>
    <div class="card chart-card">
      ${trendTier && series.length >= 2 ? trendChart(series, Progress.tier(trendTier).par) : '<p class="muted small">Complete a few timed puzzles to see your trend.</p>'}
      ${improvement ? `<p class="insight">${improvement}</p>` : ''}
    </div>

    <h2 class="section-title">Personal records</h2>
    <div class="card">
      <table class="stats">
        <thead><tr><th></th><th>Best time</th><th>High score</th><th>Time Attack</th><th>Rank</th></tr></thead>
        <tbody>${Progress.TIERS.map((t) => {
          const pt = s.perTier[t.id];
          const high = pt.bestScore ? fmt(pt.bestScore) : pt.legacyBestScore ? `<span class="muted" title="Scored under the old rules">${fmt(pt.legacyBestScore)}*</span>` : '–';
          return `<tr><td>${t.name}</td><td>${pt.bestTime != null ? formatTime(pt.bestTime) : '–'}</td><td>${high}</td><td>${pt.timeAttackBest != null ? formatTime(pt.timeAttackBest) : '–'}</td><td><span class="medal r${s.mastery[t.id].rank}" title="${s.mastery[t.id].rankName}"></span></td></tr>`;
        }).join('')}</tbody>
      </table>
      <table class="kv">
        <tr><td>Longest clean streak</td><td>${s.bestCleanRun}</td></tr>
        <tr><td>Daily challenges</td><td>${s.dailyCount} · best ${s.dailyStreak.best} in a row</td></tr>
        <tr><td>Best daily score</td><td>${s.dailyBest ? fmt(s.dailyBest) : '–'}</td></tr>
      </table>
      ${H.some((a) => a.res === 'won' && !currentRules(a)) ? '<p class="muted small">* Scored under the old rules. Kept as they were, but not compared with current scores.</p>' : ''}
    </div>

    ${arcadeStats(rows)}

    <h2 class="section-title">Techniques met</h2>
    <div class="card">
      ${techList.length ? `<table class="kv">${techList.map(([k, n]) => {
        const t = TECHNIQUES[k as TechId];
        return `<tr><td>${t.name} <small class="muted">${tierName(Math.max(1, t.level))}</small></td><td>${n} puzzle${n === 1 ? '' : 's'}</td></tr>`;
      }).join('')}</table>` : '<p class="muted small">Solved puzzles list the techniques they needed here.</p>'}
    </div>

    <h2 class="section-title">History</h2>
    <div class="card history">
      ${H.length ? `<table class="stats">
        <thead><tr><th>Date</th><th>Puzzle</th><th>Result</th><th>Time</th><th>Score</th></tr></thead>
        <tbody>${H.slice(-40).reverse().map((a) => `<tr>
          <td>${new Date(a.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
          <td>${tierName(a.tier)}<small class="muted"> ${Progress.MODES[a.mode].name}</small></td>
          <td class="res-${a.res}">${a.res === 'won' ? (Progress.isClean(a) ? 'Clean' : 'Won') : a.res === 'failed' ? 'Failed' : 'Abandoned'}</td>
          <td>${a.mode === 'zen' ? '–' : formatTime(a.t)}</td>
          <td>${a.res !== 'won' || a.mode === 'practice' ? '–' : currentRules(a) ? fmt(a.sc) : `<span class="muted" title="Scored under the old rules">${fmt(a.sc)}*</span>`}</td>
        </tr>`).join('')}</tbody>
      </table>` : '<p class="muted small">No games yet.</p>'}
    </div>
  `;
}

/** Region and chain totals from attempts scored by the event engine (they carry `ar`). */
function arcadeStats(rows: AttemptRecord[]): string {
  const list = rows.filter((a): a is AttemptRecord & { ar: ArcadeRecord } => !!a.ar && a.res === 'won');
  if (!list.length) return '';
  const sum = (k: keyof ArcadeRecord) => list.reduce((x, a) => x + (a.ar[k] || 0), 0);
  const max = (k: keyof ArcadeRecord) => Math.max(0, ...list.map((a) => a.ar[k] || 0));
  const chainTotal = list.reduce((x, a) => x + (a.sb ? a.sb.ch : 0), 0);
  const kv: Record<string, string> = {
    'Rows · columns · blocks': `${fmt(sum('rows'))} · ${fmt(sum('cols'))} · ${fmt(sum('blocks'))}`,
    'Double · triple clears': `${fmt(sum('dbl'))} · ${fmt(sum('tpl'))}`,
    Chains: fmt(sum('chains')),
    'Time · number · line · block': `${fmt(sum('time'))} · ${fmt(sum('number'))} · ${fmt(sum('line'))} · ${fmt(sum('block'))}`,
    'Hybrid chains': fmt(sum('hybrid')),
    'Longest chain': max('longest') ? `${max('longest')} placements` : '–',
    'Best single chain': max('best') ? fmt(max('best')) : '–',
    'Chain points (after cap)': fmt(chainTotal),
  };
  return `<h2 class="section-title">Clears and chains</h2>
    <div class="card"><table class="kv">${Object.entries(kv).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table></div>`;
}

function trendChart(series: AttemptRecord[], par: number): string {
  const W = 320, Hh = 140, P = { l: 34, r: 8, t: 10, b: 18 };
  const ts = series.map((a) => a.t / 60);
  const avgs = ts.map((_, k) => {
    const w = ts.slice(Math.max(0, k - 4), k + 1);
    return w.reduce((x, y) => x + y, 0) / w.length;
  });
  const max = Math.max(par / 60, ...ts) * 1.1;
  const x = (k: number) => P.l + (k / Math.max(1, ts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / max) * (Hh - P.t - P.b);
  const line = (vals: number[]) => vals.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, max / 2, max].map((v) => `<text x="${P.l - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}m</text><line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Solve time per puzzle, in minutes">
    ${ticks}
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(par / 60)}" y2="${y(par / 60)}" class="par"/>
    <text x="${W - P.r}" y="${y(par / 60) - 4}" text-anchor="end" class="par-label">par</text>
    ${ts.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="2.5" class="dot"><title>${v.toFixed(1)} min</title></circle>`).join('')}
    <path d="${line(avgs)}" class="avg"/>
    <text x="${P.l}" y="${Hh - 4}">older</text><text x="${W - P.r}" y="${Hh - 4}" text-anchor="end">recent</text>
  </svg>
  <p class="legend muted small"><span class="lg-dot"></span>each puzzle <span class="lg-line"></span>5-game average</p>`;
}
