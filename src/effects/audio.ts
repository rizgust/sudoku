/* Synthesized sound effects (Web Audio, no files). Short, quiet and distinguishable (§F).

   Layers: input (clicks, knocks) and reward (region chimes) follow the "Sound effects"
   setting; chain sounds and celebrations have their own switches. Everything goes through
   one master gain set by the volume slider. The audio context is created on the first user
   gesture, as browsers require. */
import { settings } from '../ui/state.ts';
import type { SoundName } from './moment.ts';

type Layer = 'input' | 'reward' | 'chain' | 'celebration';

const LAYER: Record<SoundName, Layer> = {
  click: 'input', knock: 'input',
  row: 'reward', col: 'reward', block: 'reward', double: 'reward', jackpot: 'reward',
  kachink: 'chain', kachink2: 'chain', rising: 'chain', ascend: 'chain', fanfare: 'chain', close: 'chain',
  complete: 'celebration', perfect: 'celebration', celebrate: 'celebration',
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/** Creates or resumes the audio context. Call from a user gesture. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      // A gentle compressor keeps stacked notes from clipping at high volume.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio unavailable */ }
}

/** Master gain from the 0–100 volume (squared, so the slider feels even). */
const masterLevel = () => Math.pow(Math.max(0, Math.min(100, settings.volume)) / 100, 2) * 0.9;

function enabled(layer: Layer): boolean {
  if (!settings.volume) return false;
  if (layer === 'chain') return settings.chainSfx;
  if (layer === 'celebration') return settings.celebrationSfx;
  return settings.sfx;
}

interface Note {
  freq: number;
  at?: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  /** Glide to this frequency over the note. */
  to?: number;
}

function note(t0: number, { freq, at = 0, dur, gain, type = 'sine', to }: Note): void {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  const start = t0 + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A metallic bell: inharmonic partials with a fast decay. */
function bell(t0: number, freq: number, at: number, gain: number, dur = 0.35): void {
  note(t0, { freq, at, dur, gain });
  note(t0, { freq: freq * 2.01, at, dur: dur * 0.7, gain: gain * 0.45 });
  note(t0, { freq: freq * 2.76, at, dur: dur * 0.5, gain: gain * 0.28 });
  note(t0, { freq: freq * 5.4, at, dur: dur * 0.25, gain: gain * 0.12 });
}

/** The "ka" of ka-chink: a short band-passed noise tick. */
function tick(t0: number, at: number, gain: number, freq = 2400): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = c.createGain();
  const start = t0 + at;
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);
  src.connect(bp).connect(g).connect(master!);
  src.start(start);
  src.stop(start + 0.05);
}

const semis = (n: number) => Math.pow(2, n / 12);
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

const SOUNDS: Record<SoundName, (t: number, p: number) => void> = {
  // Input: soft, slightly metallic click.
  click: (t) => { note(t, { freq: 2100, dur: 0.04, gain: 0.08 }); note(t, { freq: 3150, dur: 0.025, gain: 0.03, type: 'triangle' }); },
  // Muted low knock, never a reward sound.
  knock: (t) => { note(t, { freq: 190, to: 90, dur: 0.15, gain: 0.32 }); note(t, { freq: 120, dur: 0.1, gain: 0.12, type: 'triangle' }); },
  // Reward: two-note rising chimes (column a little lower), deeper ka-chink for a block.
  row: (t) => { note(t, { freq: E5, dur: 0.16, gain: 0.12, type: 'triangle' }); note(t, { freq: 987.8, at: 0.09, dur: 0.24, gain: 0.12, type: 'triangle' }); },
  col: (t) => { note(t, { freq: 587.3, dur: 0.16, gain: 0.12, type: 'triangle' }); note(t, { freq: A5, at: 0.09, dur: 0.24, gain: 0.12, type: 'triangle' }); },
  block: (t) => { tick(t, 0, 0.18, 1600); bell(t, 700, 0.045, 0.12, 0.45); },
  double: (t) => { tick(t, 0, 0.16); bell(t, E6, 0.04, 0.09); bell(t, E6, 0.15, 0.1); },
  jackpot: (t) => { [C5, E5, G5, C6, E6].forEach((f, k) => note(t, { freq: f, at: k * 0.06, dur: 0.22, gain: 0.1, type: 'triangle' })); bell(t, G6, 0.32, 0.09, 0.6); },
  // Chain: metallic, pitch rising with chain length.
  kachink: (t, p) => { tick(t, 0, 0.16); bell(t, 1200 * p, 0.05, 0.1); },
  kachink2: (t, p) => { tick(t, 0, 0.16); bell(t, 1200 * p, 0.05, 0.09); bell(t, 1400 * p, 0.14, 0.09); },
  rising: (t, p) => { [C6, E6, G6].forEach((f, k) => bell(t, f * p * 0.8, k * 0.07, 0.07, 0.3)); },
  ascend: (t, p) => { [C5, E5, G5, C6].forEach((f, k) => bell(t, f * p, k * 0.075, 0.08, 0.32)); },
  fanfare: (t, p) => {
    [G5, C6, E6].forEach((f, k) => note(t, { freq: f * p * 0.9, at: k * 0.08, dur: 0.16, gain: 0.09, type: 'triangle' }));
    note(t, { freq: G6 * p * 0.9, at: 0.24, dur: 0.5, gain: 0.1, type: 'triangle' });
    bell(t, G6 * p * 0.9, 0.24, 0.08, 0.7);
  },
  // Soft closing sound when an activated chain runs out of time.
  close: (t) => { note(t, { freq: 660, to: 440, dur: 0.22, gain: 0.05 }); },
  // Celebration.
  complete: (t) => {
    [C5, E5, G5, C6].forEach((f, k) => note(t, { freq: f, at: k * 0.1, dur: 0.35, gain: 0.1, type: 'triangle' }));
    note(t, { freq: C5 / 2, at: 0.3, dur: 0.6, gain: 0.08 });
  },
  perfect: (t) => {
    SOUNDS.complete(t, 1);
    [G6, C6 * 2].forEach((f, k) => bell(t, f, 0.45 + k * 0.08, 0.06, 0.6));
  },
  celebrate: (t) => { [G5, C6, E6, G6].forEach((f, k) => note(t, { freq: f, at: k * 0.07, dur: 0.2, gain: 0.08, type: 'triangle' })); bell(t, C6 * 2, 0.3, 0.06, 0.5); },
};

/**
 * Plays a sound if its layer is enabled. `chainLength` raises chain sounds by a semitone
 * per placement after three, capped so long chains stay pleasant (§F).
 */
export function play(name: SoundName, { chainLength = 0, delay = 0 } = {}): void {
  if (!ctx || !master || ctx.state !== 'running' || !enabled(LAYER[name])) return;
  master.gain.setValueAtTime(masterLevel(), ctx.currentTime);
  const p = semis(Math.min(Math.max(0, chainLength - 3), 9));
  try { SOUNDS[name](ctx.currentTime + 0.005 + delay, p); } catch { /* ignore */ }
}
