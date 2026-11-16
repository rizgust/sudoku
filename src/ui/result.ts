/* The end-of-game dialog: score breakdown, XP, unlocks, ranks and achievements. */
import * as Progress from '../game/progress.ts';
import type { Achievement, AttemptRecord, Summary } from '../game/progress.ts';
import type { FinalScore } from '../game/scoring.ts';
import type { ProgressEvent } from '../game/events.ts';
import { $, esc, fmt, formatTime, ICON_CHECK, ICON_LOCK, ICON_X, pct } from './dom.ts';
import { emitProgress } from './gameplay-events.ts';
import { tierName, ui } from './state.ts';

export interface ResultInfo {
  rec: AttemptRecord;
  sc: FinalScore | null;
  before: Summary;
  newAch: Achievement[];
  qualPassed: boolean;
  replay: boolean;
  reason: 'time' | 'mistakes' | null;
}

export function showResult({ rec, sc, before, newAch, qualPassed, replay, reason }: ResultInfo): void {
  const won = rec.res === 'won';
  const t = Progress.tier(rec.tier);
  const mode = Progress.MODES[rec.mode];
  const after = ui.summary;

  let title = 'Solved!';
  if (rec.mode === 'qual') title = qualPassed ? 'Qualification passed' : 'Qualification failed';
  else if (!won) title = reason === 'time' ? 'Time’s up' : 'Game over';
  else if (rec.mode === 'practice') title = 'Practice complete';
  $('#result-title').textContent = title;
  const ok = won && (rec.mode !== 'qual' || qualPassed);
  $('#result-mark').innerHTML = ok ? ICON_CHECK : ICON_X;
  $('#result-mark').classList.toggle('fail', !ok);
  $('#result-mark').classList.remove('gold');

  const cat = Progress.assistCategory(rec);
  const prevBest = before.perTier[rec.tier].bestTime;
  const isBest = won && rec.mode !== 'zen' && rec.mode !== 'practice' && (prevBest == null || rec.t < prevBest);
  // High scores compare only within the same scoring rules. The first score under new rules
  // sets the baseline instead of claiming a record just because the scale changed.
  const prevHigh = before.perTier[rec.tier].bestScore;
  const isHigh = won && rec.mode !== 'practice' && prevHigh > 0 && rec.sc > prevHigh;
  const tags = [`${mode.name} · ${t.name}`];
  if (isBest) tags.push('New best time');
  else if (isHigh) tags.push('New high score');
  if (replay) tags.push('Replay: reduced XP');
  if (!won && rec.mode === 'qual') tags.push(reason === 'mistakes' ? 'More than one mistake' : 'Attempt abandoned');
  if (!won && reason === 'time') tags.push(`Par ${formatTime(t.par)}`);
  $('#result-sub').textContent = tags.join(' · ');

  // Pure or Guided, and which assists made it Guided.
  const badge = $('#result-cat');
  badge.hidden = rec.mode === 'practice';
  badge.className = `cat-badge ${cat}`;
  const used = [rec.gl && 'guide lines', rec.as && 'Auto notes'].filter(Boolean).join(' and ');
  badge.textContent = cat === 'pure' ? 'Pure · no assists' : `Guided · ${used || 'assists'} used`;

  const showScore = !!sc && rec.mode !== 'practice';
  $('#result-score').hidden = !showScore;
  $('#result-breakdown').hidden = !showScore;
  if (sc && showScore) {
    $('#result-score').innerHTML = `<span id="result-total">${fmt(sc.total)}</span><small> pts</small>`;
    // Explain any reduction: Guided halves the speed rewards, and chains are capped at 35%.
    const halved = sc.guidedSpeed ? ', ×0.5 guided' : '';
    const capped = sc.chain < (sc.guidedSpeed ? Math.floor(sc.chainEarned / 2) : sc.chainEarned) ? ', capped at 35%' : '';
    const chainNote = sc.chain < sc.chainEarned ? ` <small class="muted">(${fmt(sc.chainEarned)} earned${halved}${capped})</small>` : '';
    const timeNote = sc.time < sc.timeEarned ? ` <small class="muted">(${fmt(sc.timeEarned)} earned${halved})</small>` : '';
    const rows: [string, string][] = [
      ['Placements', fmt(sc.placement)],
      ['Regions', `+${fmt(sc.region)}`],
      ['Multi-clears', `+${fmt(sc.multi)}`],
      ['Chains', `+${fmt(sc.chain)}${chainNote}`],
      ['Completion', `+${fmt(sc.completion)}`],
      ['Time bonus', `+${fmt(sc.time)}${timeNote}`],
      ['Accuracy', `×${sc.A.toFixed(2)}`],
      ['Hints', `×${sc.H.toFixed(2)}`],
      ['Assists', `×${sc.S.toFixed(2)}`],
    ];
    if (sc.G !== 1) rows.push(['Guide lines', `×${sc.G.toFixed(2)}`]);
    if (rec.mode === 'zen') rows.splice(3, 1); // chains are off in Zen
    if (sc.M !== 1) rows.push([mode.name, `×${sc.M.toFixed(2)}`]);
    $('#result-breakdown').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }
  $('#result-time').textContent = rec.mode === 'zen' ? '—' : formatTime(rec.t);
  $('#result-mistakes').textContent = String(rec.m);
  $('#result-hints').textContent = String(rec.h);

  const lvUp = after.level.level > before.level.level;
  const achXp = newAch.reduce((s, a) => s + a.xp, 0);
  $('#result-xp').innerHTML = rec.xp || achXp ? `
    <div class="xp-line"><b>+${fmt(rec.xp + achXp)} XP</b><span>${lvUp ? `Level up! Lv ${after.level.level}` : `Lv ${after.level.level} · ${fmt(after.level.into)} / ${fmt(after.level.need)}`}</span></div>
    <div class="bar"><i style="width:${pct(after.level.pct)}"></i></div>` : '';

  const news: string[] = [];
  if (after.unlocked > before.unlocked) news.push(`<div class="news unlock">${ICON_LOCK}<span><b>${tierName(after.unlocked)} unlocked</b><small>${esc(Progress.tier(after.unlocked).blurb)}</small></span></div>`);
  const mb = before.mastery[rec.tier], ma = after.mastery[rec.tier];
  if (ma.rank > mb.rank) news.push(`<div class="news rank"><span class="medal r${ma.rank}"></span><span><b>${t.name} ${ma.rankName}</b><small>New mastery rank</small></span></div>`);
  else if (Progress.MODES[rec.mode].progression && won && ma.next) news.push(`<div class="news"><span class="medal r${ma.rank}"></span><span><b>${t.name} · ${ma.rankName}</b><small>${pct(ma.pct)} toward ${ma.next.name}</small></span></div>`);
  if (rec.mode === 'qual') {
    const up = after.unlockProgress[rec.tier + 1];
    if (up && !(after.unlocked > before.unlocked)) news.push(`<div class="news"><span class="medal"></span><span><b>Qualifications ${up.quals} / ${up.req.quals}</b><small>for ${tierName(rec.tier + 1)}</small></span></div>`);
  }
  for (const a of newAch) news.push(`<div class="news ach">${ICON_CHECK}<span><b>${esc(a.name)}</b><small>${esc(a.desc)} · +${a.xp} XP</small></span></div>`);
  $('#result-news').innerHTML = news.join('');

  const next = $('#result-next');
  next.hidden = false;
  if (rec.mode === 'daily') next.hidden = true;
  else if (rec.mode === 'qual') {
    const up = after.unlockProgress[rec.tier + 1];
    next.textContent = up && up.qualReady ? 'Next qualification' : 'Play classic';
  } else if (rec.mode === 'practice') next.textContent = 'Practice again';
  else next.textContent = 'Next puzzle';
  $('#result-fx').textContent = '';
  const dlg = $<HTMLDialogElement>('#dlg-result');
  dlg.showModal();
  // Autofocus on "Next" would scroll a tall dialog to the bottom; start at the score instead.
  dlg.scrollTop = 0;
  dlg.querySelector('.dlg-body')?.scrollTo(0, 0);

  // What this attempt achieved, for the celebration layer (§H). Results are already saved.
  const events: ProgressEvent[] = [{ type: 'PUZZLE_RESULT', total: sc ? sc.total : 0, won: showScore }];
  if (won && rec.m === 0 && rec.h === 0 && rec.mode !== 'practice') events.push({ type: 'CLEAN_COMPLETION' });
  if (isHigh) events.push({ type: 'PERSONAL_BEST', previous: prevHigh, score: rec.sc });
  if (after.unlocked > before.unlocked) events.push({ type: 'DIFFICULTY_UNLOCKED', tier: after.unlocked, name: tierName(after.unlocked) });
  if (ma.rank > mb.rank) events.push({ type: 'MASTERY_RANK_UP', tier: rec.tier, rank: `${t.name} ${ma.rankName}` });
  for (const a of newAch) events.push({ type: 'ACHIEVEMENT_UNLOCKED', id: a.id, name: a.name });
  emitProgress(events);
}
