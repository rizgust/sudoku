/* The settings dialog and theme. */
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
    el.addEventListener('change', () => {
      const value = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
      (settings as unknown as Record<string, unknown>)[el.dataset.setting!] = value;
      saveSettings();
      applyTheme();
      render();
    });
  }
  if (typeof navigator.vibrate !== 'function') $('#setting-vibrate').hidden = true;
}
