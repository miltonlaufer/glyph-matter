import type { WindEffect } from "./effects.ts";

/** Mean 0–1 below this is analyser hiss, not a note. */
const ENERGY_FLOOR = 0.025;
const PEAK_MIN = 24;
const VISUAL_HZ_LO = 0.55;
const VISUAL_HZ_HI = 2.15;

function boostEnergy(mean01: number): number {
  return Math.min(1, Math.max(0, mean01 - ENERGY_FLOOR) * 5);
}

function bandIndex(
  freqLength: number,
  binHz: number,
  loHz: number,
  hiHz: number,
): { i0: number; i1: number } | null {
  if (freqLength === 0 || binHz <= 0 || hiHz < loHz) return null;
  const i0 = Math.max(1, Math.floor(loHz / binHz));
  const i1 = Math.min(freqLength - 1, Math.ceil(hiHz / binHz));
  if (i1 < i0) return null;
  return { i0, i1 };
}

/** Mean FFT bin, scaled 0–1. Empty spectrum is 0. */
export function spectrumEnergy(freq: ArrayLike<number>): number {
  if (freq.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freq.length; i++) sum += freq[i]!;
  return boostEnergy(sum / (freq.length * 255));
}

/** Mean energy in `[loHz, hiHz]`. `binHz` is `sampleRate / fftSize`. */
export function bandEnergy(
  freq: ArrayLike<number>,
  binHz: number,
  loHz: number,
  hiHz: number,
): number {
  const band = bandIndex(freq.length, binHz, loHz, hiHz);
  if (!band) return 0;
  let sum = 0;
  for (let i = band.i0; i <= band.i1; i++) sum += freq[i]!;
  const n = band.i1 - band.i0 + 1;
  return boostEnergy(sum / (n * 255));
}

/**
 * Half-wave spectral flux in `[loHz, hiHz]`: mean of `max(0, curr − prev)`,
 * 0–1. Sustained notes are near 0; a drum hit is a spike.
 * Pass `previous` from the last analyser read (same length as `current`).
 */
export function bandFlux(
  current: ArrayLike<number>,
  previous: ArrayLike<number> | null,
  binHz: number,
  loHz: number,
  hiHz: number,
): number {
  if (!previous || previous.length !== current.length) return 0;
  const band = bandIndex(current.length, binHz, loHz, hiHz);
  if (!band) return 0;
  let sum = 0;
  for (let i = band.i0; i <= band.i1; i++) {
    sum += Math.max(0, current[i]! - previous[i]!);
  }
  const n = band.i1 - band.i0 + 1;
  return Math.min(1, sum / (n * 255));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const a = s[mid]!;
  if (s.length % 2) return a;
  return (s[mid - 1]! + a) / 2;
}

/** Adaptive peak-picker for {@link bandFlux}. */
export type OnsetPicker = {
  hist: number[];
  until: number;
};

export function createOnsetPicker(): OnsetPicker {
  return { hist: [], until: 0 };
}

/**
 * 0–1 hit if `flux` is above a recent median, and the refractory has elapsed.
 * `time` is seconds (animation clock).
 */
export function pickOnset(
  flux: number,
  picker: OnsetPicker,
  time: number,
  options: { refractory?: number; k?: number; floor?: number; history?: number } = {},
): number {
  const refractory = options.refractory ?? 0.14;
  const k = options.k ?? 1.8;
  const floor = options.floor ?? 0.03;
  const history = options.history ?? 32;
  picker.hist.push(flux);
  if (picker.hist.length > history) picker.hist.shift();
  if (picker.hist.length < 8) return 0;
  const med = median(picker.hist);
  const gate = med * k + floor;
  if (time < picker.until || flux <= gate) return 0;
  picker.until = time + refractory;
  return Math.min(1, flux / Math.max(gate, 1e-6));
}

/** Fold an inter-onset interval into a visible wind period (~0.32–1.6 s). */
export function visualBeatPeriod(ioi: number): number {
  if (!(ioi > 0)) return 0;
  let p = ioi;
  while (p < 0.32) p *= 2;
  while (p > 1.6) p *= 0.5;
  return p;
}

/** Running beat period from onset times. */
export type TempoFollow = {
  times: number[];
  period: number;
};

export function createTempoFollow(period = 0): TempoFollow {
  return { times: [], period };
}

/**
 * On each hit, record `time` and ease `period` toward the median gap
 * between recent beats. Non-hits leave the period as-is.
 */
export function followTempo(
  follow: TempoFollow,
  hit: boolean,
  time: number,
  options: { keep?: number; minIoi?: number; maxIoi?: number; blend?: number } = {},
): number {
  if (!hit) return follow.period;
  const keep = options.keep ?? 8;
  const minIoi = options.minIoi ?? 0.22;
  const maxIoi = options.maxIoi ?? 1.8;
  const blend = options.blend ?? 0.28;
  const last = follow.times[follow.times.length - 1];
  follow.times.push(time);
  if (follow.times.length > keep + 1) follow.times.shift();
  if (last === undefined) return follow.period;
  const ioi = time - last;
  if (ioi < minIoi || ioi > maxIoi) return follow.period;
  const iois: number[] = [];
  for (let i = 1; i < follow.times.length; i++) {
    const d = follow.times[i]! - follow.times[i - 1]!;
    if (d >= minIoi && d <= maxIoi) iois.push(d);
  }
  if (iois.length === 0) return follow.period;
  const target = visualBeatPeriod(median(iois));
  follow.period =
    follow.period > 0 ? follow.period + (target - follow.period) * blend : target;
  return follow.period;
}

/** Spectral centroid 0–1 (low = bass, high = treble). */
export function spectrumCentroid(freq: ArrayLike<number>): number {
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < freq.length; i++) {
    const v = freq[i]!;
    sum += v;
    weighted += v * i;
  }
  if (sum < 1e-6) return 0.2;
  return weighted / sum / Math.max(1, freq.length - 1);
}

/**
 * Strongest bin in `[loHz, hiHz]`, in Hertz. `0` if the peak is hiss.
 * Defaults cover bass/low-mid fundamentals (not cymbal splash).
 */
export function dominantHz(
  freq: ArrayLike<number>,
  binHz: number,
  loHz = 70,
  hiHz = 520,
): number {
  const band = bandIndex(freq.length, binHz, loHz, hiHz);
  if (!band) return 0;
  let bestI = band.i0;
  let bestV = -1;
  for (let i = band.i0; i <= band.i1; i++) {
    const v = freq[i]!;
    if (v > bestV) {
      bestV = v;
      bestI = i;
    }
  }
  if (bestV < PEAK_MIN) return 0;
  return bestI * binHz;
}

/**
 * Fold a musical frequency into a visible wind rate (~0.55–2.15 Hz).
 * Octaves land on the same pulse (110 Hz and 220 Hz share a period).
 * Returns seconds, or `0` if `hz` is not a frequency.
 */
export function visualWavePeriod(hz: number): number {
  if (!(hz > 0)) return 0;
  let f = hz;
  while (f >= VISUAL_HZ_HI) f *= 0.5;
  while (f < VISUAL_HZ_LO) f *= 2;
  if (f >= VISUAL_HZ_HI) f *= 0.5;
  return 1 / f;
}

/**
 * RMS of `getByteTimeDomainData` (0–1). Silence is 0.
 * Use this for loudness; mean FFT bins stay high for the whole mix.
 */
export function timeDomainEnergy(wave: ArrayLike<number>): number {
  if (wave.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < wave.length; i++) {
    const x = (wave[i]! - 128) / 128;
    sum += x * x;
  }
  const rms = Math.sqrt(sum / wave.length);
  return Math.min(1, Math.max(0, rms - 0.02) * 4.2);
}

function windFromEnergy(energy: number, centroid: number, period: number): WindEffect {
  const e = Math.min(1, Math.max(0, energy));
  const c = Math.min(1, Math.max(0, centroid));
  const pulse = e > 0 && period > 0;
  return {
    kind: "wind",
    vx: e * 350,
    vy: e * (c - 0.35) * 90,
    gust: e * 28,
    period: pulse ? period : 0,
    wavelength: pulse ? 100 + period * 220 : 0,
  };
}

/**
 * Map loudness + brightness to wind. Pass `hz` (dominant musical frequency)
 * to get a traveling gust whose period is that pitch folded into view.
 * Omit `hz` for a lean with no wave (energy this frame only).
 */
export function windFromSpectrum(energy: number, centroid: number, hz = 0): WindEffect {
  return windFromEnergy(energy, centroid, visualWavePeriod(hz));
}

/** Locked traveling-wave rate. Beats change amplitude, not this period. */
export type WaveLock = {
  period: number;
  centroid: number;
  armed: number;
  silent: number;
};

export const WAVE_FALLBACK_PERIOD = 1.18;
const ARM_FRAMES = 20;
const SILENCE_FRAMES = 48;

export function lockWavePeriod(
  prev: WaveLock,
  energy: number,
  targetPeriod: number,
  centroid: number,
): WaveLock {
  if (energy <= 0.03) {
    const silent = prev.silent + 1;
    if (silent >= SILENCE_FRAMES) {
      return { period: 0, centroid: 0, armed: 0, silent };
    }
    return { ...prev, silent };
  }
  if (prev.period > 0) return { ...prev, silent: 0 };
  const armed = prev.armed + 1;
  if (armed < ARM_FRAMES) return { period: 0, centroid: 0, armed, silent: 0 };
  return {
    period: targetPeriod > 0 ? targetPeriod : WAVE_FALLBACK_PERIOD,
    centroid,
    armed,
    silent: 0,
  };
}

type AnalyserWind = {
  wave: Uint8Array<ArrayBuffer>;
  lock: WaveLock;
};

const follow = new WeakMap<AnalyserNode, AnalyserWind>();

function followFor(analyser: AnalyserNode): AnalyserWind {
  let state = follow.get(analyser);
  if (!state || state.wave.length !== analyser.fftSize) {
    state = {
      wave: new Uint8Array(analyser.fftSize),
      lock: { period: 0, centroid: 0, armed: 0, silent: 0 },
    };
    follow.set(analyser, state);
  }
  return state;
}

/**
 * Wind from waveform RMS (how hard) and a **locked** traveling-wave period
 * (how the gust moves through the letters). Dominant Hz is sampled once
 * after a short arm, then held until silence so it does not fight the beat.
 */
export function windFromAnalyser(
  analyser: AnalyserNode,
  bins: Uint8Array<ArrayBuffer>,
): WindEffect {
  const state = followFor(analyser);
  analyser.getByteTimeDomainData(state.wave);
  analyser.getByteFrequencyData(bins);
  const energy = timeDomainEnergy(state.wave);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const centroid = spectrumCentroid(bins);
  state.lock = lockWavePeriod(
    state.lock,
    energy,
    visualWavePeriod(dominantHz(bins, binHz)),
    centroid,
  );
  const period =
    state.lock.period || (energy > 0.03 ? WAVE_FALLBACK_PERIOD : 0);
  return windFromEnergy(energy, state.lock.centroid || centroid, period);
}
