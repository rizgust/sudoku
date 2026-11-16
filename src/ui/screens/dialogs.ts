/* Confirmation dialog and the mode / technique pickers. */
import { TECHNIQUES, type Technique } from '../../core/sudoku.ts';
import type { ModeId } from '../../game/events.ts';
import * as Progress from '../../game/progress.ts';
import { $, formatTime, ICON_CHECK } from '../dom.ts';
import { BANK } from '../puzzle-source.ts';
import { profile, tierName, ui } from '../state.ts';

export function confirmDialog(title: string, text: string, ok: string, fn: () => void): void {
  $('#dlg-confirm-title').textContent = title;
  $('#dlg-confirm-text').textContent = text;
  const btn = $('#dlg-confirm-ok');
  btn.textContent = ok;
  btn.onclick = () => { $<HTMLDialogElement>('#dlg-confirm').close(); fn(); };
  $<HTMLDialogElement>('#dlg-confirm').showModal();
}

/** Technique list for Practice, or the tier list for Time Attack and Zen. */
export function openPicker(mode: ModeId): void {
  const list = $('#pick-list');
  if (mode === 'practice') {
    $('#dlg-pick-title').textContent = 'Practice';
    $('#dlg-pick-sub').textContent = 'Pick a technique. The board starts right where it’s needed. Practice doesn’t affect your score or unlocks.';
    const groups: Record<number, [string, Technique][]> = {};
    for (const [key, t] of Object.entries(TECHNIQUES) as [string, Technique][]) {
      const lv = Math.max(1, t.level);
      if (!BANK.some((e) => e[2].split(' ').includes(key))) continue;
      (groups[lv] = groups[lv] || []).push([key, t]);
    }
    list.innerHTML = Object.entries(groups).map(([lv, items]) => `
      <h3>${tierName(+lv)}</h3>
      ${items.map(([key, t]) => `<button class="pick-btn" type="button" data-tech="${key}">
        <span><b>${t.name}</b></span>${profile.practiced[key] ? `<span class="chip ok">${ICON_CHECK}Done</span>` : ''}</button>`).join('')}
    `).join('');
  } else {
    const s = ui.summary;
    $('#dlg-pick-title').textContent = Progress.MODES[mode].name;
    $('#dlg-pick-sub').textContent = mode === 'time'
      ? 'Solve before the par time runs out. Records are kept separately.'
      : 'No timer and no pressure. Scores are halved and don’t count toward unlocks.';
    list.innerHTML = Progress.TIERS.filter((t) => t.id <= s.unlocked).map((t) => {
      const best = s.perTier[t.id].timeAttackBest;
      const side = mode === 'time' ? (best != null ? `Best ${formatTime(best)}` : `Par ${formatTime(t.par)}`) : '';
      return `<button class="pick-btn" type="button" data-tier="${t.id}"><span><b>${t.name}</b></span><small>${side}</small></button>`;
    }).join('');
  }
  list.dataset.pickMode = mode;
  $<HTMLDialogElement>('#dlg-pick').showModal();
}
