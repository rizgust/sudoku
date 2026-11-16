/* The home screen: level, mastery, continue, daily challenge and the tier picker. */
import * as Progress from '../../game/progress.ts';
import { $, esc, fmt, formatTime, ICON_CHECK, ICON_LOCK, pct } from '../dom.ts';
import { activeGame, profile, settings, tierName, today, ui } from '../state.ts';

export function renderHome(): void {
  const s = ui.summary;
  $('#home-level').textContent = `Lv ${s.level.level}`;
  $('#home-xp-bar').style.width = pct(s.level.pct);
  $('#home-xp-text').textContent = `${fmt(s.level.into)} / ${fmt(s.level.need)} XP`;

  const top = s.unlocked;
  const m = s.mastery[top];
  $('#home-rank').textContent = `${tierName(top)} · ${m.rankName}`;
  $('#home-medal').className = `medal r${m.rank}`;
  $('#home-rank-bar').style.width = pct(m.next ? m.pct : 1);
  $('#home-rank-next').textContent = m.next
    ? `${pct(m.pct)} toward ${tierName(top)} ${m.next.name} · ${m.clean}/${m.next.clean} clean${m.next.underPar ? ` · ${m.underPar}/${m.next.underPar} under par` : ''}`
    : 'Top rank reached';

  const game = activeGame();
  $('#home-continue').hidden = !game;
  if (game) {
    $('#home-continue-sub').textContent = `${Progress.MODES[game.mode].name} · ${tierName(game.tier)} · ${game.mode === 'zen' ? 'in progress' : formatTime(game.elapsed)}`;
  }

  const d = Progress.dailyInfo(today());
  $('#home-daily-sub').textContent = `${tierName(d.tierId)} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  $('#home-daily-side').innerHTML = s.dailyDoneToday
    ? `<span class="chip ok">${ICON_CHECK}Done</span>`
    : (s.dailyStreak.current ? `<span class="chip">${s.dailyStreak.current} day streak</span>` : '');

  $('#tier-list').innerHTML = Progress.TIERS.map((t) => {
    const best = s.perTier[t.id].bestTime;
    const ms = s.mastery[t.id];
    if (t.id <= s.unlocked) {
      const up = s.unlockProgress[t.id + 1];
      const qual = up && up.qualReady && t.id === s.unlocked
        ? `<button class="btn primary small qual-btn" type="button" data-qual="${t.id}">Take qualification <small>${up.quals}/${up.req.quals}</small></button>` : '';
      return `<div class="tier-row-wrap" style="--tc:var(--t${t.id})">
        <button class="card tier-row" type="button" data-play="${t.id}">
          <span class="tier-num">${t.id}</span>
          <span class="tier-text"><b>${t.name}</b><small>${esc(t.blurb)}</small></span>
          <span class="tier-side"><span class="medal r${ms.rank}" title="${ms.rankName}"></span><small>${best != null ? formatTime(best) : ''}</small></span>
        </button>${qual}</div>`;
    }
    if (t.id === s.unlocked + 1) {
      const up = s.unlockProgress[t.id];
      const below = tierName(t.id - 1);
      const line = (label: string, cur: number, req: number) => req ? `<li class="${cur >= req ? 'met' : ''}">${cur >= req ? ICON_CHECK : '<i></i>'}${label} <b>${cur} / ${req}</b></li>` : '';
      return `<div class="card tier-row locked next" style="--tc:var(--t${t.id})">
          <span class="tier-num">${ICON_LOCK}</span>
          <span class="tier-text"><b>${t.name}</b><small>${esc(t.blurb)}</small>
            <ul class="req">
              ${line(`${below} puzzles`, up.completed, up.req.completed)}
              ${line('Clean solves', up.clean, up.req.clean)}
              ${line('Qualifications', up.quals, up.req.quals)}
            </ul>
            <span class="bar"><i style="width:${pct(up.pct)}"></i></span>
          </span>
        </div>`;
    }
    return `<div class="card tier-row locked" style="--tc:var(--t${t.id})">
        <span class="tier-num">${ICON_LOCK}</span>
        <span class="tier-text"><b>${t.name}</b><small>Unlocks after ${tierName(t.id - 1)}</small></span>
      </div>`;
  }).join('');

  // Collapsible level picker: summary shows where you are and whether a qualification waits.
  const qualReady = s.unlockProgress[s.unlocked + 1]?.qualReady;
  $('#lp-sub').textContent = `${tierName(s.unlocked)} · ${s.unlocked} of ${Progress.TIERS.length} unlocked`;
  $('#lp-badge').innerHTML = qualReady ? '<span class="chip ok">Qualification ready</span>' : '';
  $<HTMLDetailsElement>('#level-picker').open = !!settings.levelsOpen;

  const earned = Object.keys(profile.achievements).length;
  $('#home-awards-sub').textContent = `${earned} / ${Progress.ACHIEVEMENTS.length} earned`;
}
