/* The settings dialog and theme. */
import { play, unlockAudio } from '../../effects/audio.ts';
import { render } from '../board.ts';
import { $, $$ } from '../dom.ts';
import { saveSettings, settings } from '../state.ts';

type SettingInput = HTMLInputElement | HTMLSelectElement;

// Keep the phone's status/address bar color in sync with a manually chosen theme.
const themeMetas = () => $$<HTMLMetaElement>('meta[name="theme-color"]');

export function initTheme(): void {
  themeMetas().forEach((m) => { m.dataset.auto = m.content; });
  applyTheme();
}

export function applyTheme(): void {
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', settings.theme);
  const forced = settings.theme === 'dark' ? '#1a2023' : settings.theme === 'light' ? '#f2f4ef' : null;
  themeMetas().forEach((m) => { m.content = forced || m.dataset.auto || m.content; });
}

export function openSettings(): void {
  for (const el of $$<SettingInput>('[data-setting]')) {
    const value = (settings as unknown as Record<string, unknown>)[el.dataset.setting!];
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!value;
    else el.value = String(value);
  }
  $<HTMLDialogElement>('#dlg-settings').showModal();
}

export function bindSettings(): void {
  for (const el of $$<SettingInput>('[data-setting]')) {
    const kind = el instanceof HTMLInputElement ? el.type : 'select';
    const read = () => (kind === 'checkbox' ? (el as HTMLInputElement).checked : kind === 'range' ? Number(el.value) : el.value);
    el.addEventListener('change', () => {
      (settings as unknown as Record<string, unknown>)[el.dataset.setting!] = read();
      saveSettings();
      applyTheme();
      render();
      // Let the player hear the new level or the sound they just enabled.
      if (kind === 'range' || el.dataset.setting === 'sfx') { unlockAudio(); play('click'); }
      else if (el.dataset.setting === 'chainSfx') { unlockAudio(); play('kachink', { chainLength: 3 }); }
      else if (el.dataset.setting === 'celebrationSfx') { unlockAudio(); play('celebrate'); }
    });
  }
  if (typeof navigator.vibrate !== 'function') $('#setting-vibrate').hidden = true;
}
