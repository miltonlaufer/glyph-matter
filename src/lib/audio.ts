import type { WindEffect } from "./effects.ts";

/** Mean FFT bin, scaled 0–1. Empty spectrum is 0. */
export function spectrumEnergy(freq: ArrayLike<number>): number {
  if (freq.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freq.length; i++) sum += freq[i]!;
  return Math.min(1, (sum / (freq.length * 255)) * 5);
}

/** Mean energy in `[loHz, hiHz]`. `binHz` is `sampleRate / fftSize`. */
export function bandEnergy(
  freq: ArrayLike<number>,
  binHz: number,
  loHz: number,
  hiHz: number,
): number {
  if (freq.length === 0 || binHz <= 0 || hiHz < loHz) return 0;
  const i0 = Math.max(0, Math.floor(loHz / binHz));
  const i1 = Math.min(freq.length - 1, Math.ceil(hiHz / binHz));
  if (i1 < i0) return 0;
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += freq[i]!;
  const n = i1 - i0 + 1;
  return Math.min(1, (sum / (n * 255)) * 5);
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
 * Map loudness + brightness to a traveling wind. Energy raises speed and
 * gust; centroid raises the pulse rate and shortens the wavelength.
 */
export function windFromSpectrum(energy: number, centroid: number): WindEffect {
  const e = Math.min(1, Math.max(0, energy));
  const c = Math.min(1, Math.max(0, centroid));
  return {
    kind: "wind",
    vx: 30 + e * 320,
    vy: (c - 0.35) * 90,
    gust: 8 + e * 140,
    period: 0.28 + (1 - c) * 1.6,
    wavelength: 70 + c * 560,
  };
}

/** Read an `AnalyserNode` and return wind for this frame. */
export function windFromAnalyser(
  analyser: AnalyserNode,
  bins: Uint8Array<ArrayBuffer>,
): WindEffect {
  analyser.getByteFrequencyData(bins);
  return windFromSpectrum(spectrumEnergy(bins), spectrumCentroid(bins));
}
