/* The achievements screen. */
import * as Progress from '../../game/progress.ts';
import type { Achievement } from '../../game/progress.ts';
import { $, esc, fmt, ICON_CHECK, pct } from '../dom.ts';
import { profile, ui } from '../state.ts';

export function renderAwards(): void {
  const s = ui.summary;
  const got = profile.achievements;
  const earnedXp = Object.values(got).reduce((x, a) => x + (a.xp || 0), 0);
  const groups: Record<string, Achievement[]> = {};
  for (const a of Progress.ACHIEVEMENTS) (groups[a.group] = groups[a.group] || []).push(a);
  $('#awards-root').innerHTML = `
    <div class="tiles two">
      <div class="tile"><b>${Object.keys(got).length} / ${Progress.ACHIEVEMENTS.length}</b><span>Earned</span></div>
      <div class="tile"><b>${fmt(earnedXp)}</b><span>XP from achievements</span></div>
    </div>
    ${Object.entries(groups).map(([g, list]) => `
      <h2 class="section-title">${g}</h2>
      <div class="card ach-list">
        ${list.map((a) => {
          const done = !!got[a.id];
          const [cur, target] = a.progress(s);
          const secret = a.hidden && !done;
          return `<div class="ach ${done ? 'done' : ''}">
            <span class="ach-icon">${done ? ICON_CHECK : secret ? '?' : ''}</span>
            <span class="ach-text">
              <b>${secret ? 'Hidden achievement' : esc(a.name)}</b>
              <small>${secret ? 'Keep playing to discover it' : esc(a.desc)}</small>
              ${!done && !secret && target > 1 ? `<span class="bar"><i style="width:${pct(Math.min(1, cur / target))}"></i></span><small class="prog">${fmt(Math.min(cur, target))} / ${fmt(target)}</small>` : ''}
            </span>
            <span class="ach-xp">+${a.xp}</span>
          </div>`;
        }).join('')}
      </div>`).join('')}
  `;
}
