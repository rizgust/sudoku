/* DOM helpers, icons and formatting. */
import { settings } from './state.ts';

/** First element matching the selector. The markup is static, so it's assumed to exist. */
export const $ = <T extends Element = HTMLElement>(s: string): T => document.querySelector(s) as T;
export const $$ = <T extends Element = HTMLElement>(s: string): T[] => [...document.querySelectorAll<T>(s)];

export const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>';
export const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
export const ICON_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
export const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
export const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function formatTime(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = (sec / 3600) | 0;
  const m = ((sec % 3600) / 60) | 0;
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export const fmt = (n: number) => Math.round(n).toLocaleString();
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const minutes = (sec: number) => `${Math.round(sec / 60)} min`;
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

/** Restarts a CSS animation by toggling its class. */
export function retrigger(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function buzz(pattern: number | number[]): void {
  if (!settings.vibrate || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* not allowed */ }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  retrigger(el, 'show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

export const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));
