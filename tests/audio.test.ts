import { describe, expect, it } from "vitest";
import {
  spectrumCentroid,
  spectrumEnergy,
  bandEnergy,
  timeDomainEnergy,
  dominantHz,
  visualWavePeriod,
  lockWavePeriod,
  windFromSpectrum,
  bandFlux,
  createOnsetPicker,
  pickOnset,
  visualBeatPeriod,
  createTempoFollow,
  followTempo,
} from "../src/lib/audio.ts";

describe("audio wind", () => {
  it("reads silence as no energy", () => {
    expect(spectrumEnergy(new Uint8Array(32))).toBe(0);
  });

  it("caps a loud flat spectrum", () => {
    const freq = new Uint8Array(16);
    freq.fill(255);
    expect(spectrumEnergy(freq)).toBe(1);
  });

  it("puts bass energy at a low centroid", () => {
    const freq = new Uint8Array(32);
    freq[1] = 200;
    freq[2] = 180;
    expect(spectrumCentroid(freq)).toBeLessThan(0.2);
  });

  it("maps energy to stronger wind", () => {
    const quiet = windFromSpectrum(0.1, 0.2);
    const loud = windFromSpectrum(0.9, 0.8);
    expect(loud.vx).toBeGreaterThan(quiet.vx);
    expect(loud.gust ?? 0).toBeGreaterThan(quiet.gust ?? 0);
    expect(quiet.period).toBe(0);
    expect(loud.period).toBe(0);
  });

  it("uses a folded musical frequency as the gust period", () => {
    const a = visualWavePeriod(110);
    const octave = visualWavePeriod(220);
    expect(a).toBeGreaterThan(0.4);
    expect(a).toBeLessThan(2);
    expect(octave).toBeCloseTo(a, 5);
    const wind = windFromSpectrum(0.6, 0.4, 110);
    expect(wind.period).toBeCloseTo(a, 5);
    expect(wind.wavelength ?? 0).toBeGreaterThan(0);
  });

  it("finds the loudest bin in the fundamental band", () => {
    const freq = new Uint8Array(64);
    freq[8] = 180;
    freq[20] = 40;
    expect(dominantHz(freq, 20, 70, 520)).toBe(160);
    expect(dominantHz(new Uint8Array(64), 20)).toBe(0);
  });

  it("locks the wave period instead of chasing the mix", () => {
    let lock = { period: 0, centroid: 0, armed: 0, silent: 0 };
    for (let i = 0; i < 20; i++) lock = lockWavePeriod(lock, 0.4, 1.2, 0.3);
    expect(lock.period).toBeCloseTo(1.2, 5);
    lock = lockWavePeriod(lock, 0.9, 0.45, 0.8);
    expect(lock.period).toBeCloseTo(1.2, 5);
    for (let i = 0; i < 48; i++) lock = lockWavePeriod(lock, 0, 0.45, 0.8);
    expect(lock.period).toBe(0);
  });

  it("maps silence to no traveling wind", () => {
    const still = windFromSpectrum(0, 0.5);
    expect(still.vx).toBe(0);
    expect(still.vy).toBe(0);
    expect(still.gust).toBe(0);
    expect(still.period).toBe(0);
  });

  it("ignores analyser hiss", () => {
    const hiss = new Uint8Array(32);
    hiss.fill(4);
    expect(spectrumEnergy(hiss)).toBe(0);
  });

  it("reads a silent waveform as no energy", () => {
    const wave = new Uint8Array(64);
    wave.fill(128);
    expect(timeDomainEnergy(wave)).toBe(0);
  });

  it("reads a full-scale square wave as loud", () => {
    const wave = new Uint8Array(64);
    for (let i = 0; i < wave.length; i++) wave[i] = i % 2 === 0 ? 0 : 255;
    expect(timeDomainEnergy(wave)).toBe(1);
  });

  it("isolates a low band from a high band", () => {
    const freq = new Uint8Array(64);
    freq[2] = 200;
    freq[50] = 200;
    const binHz = 20;
    expect(bandEnergy(freq, binHz, 20, 80)).toBeGreaterThan(0.1);
    expect(bandEnergy(freq, binHz, 900, 1400)).toBeGreaterThan(0);
    expect(bandEnergy(freq, binHz, 20, 80)).not.toBe(bandEnergy(freq, binHz, 900, 1400));
    expect(bandEnergy(freq, binHz, 2000, 4000)).toBe(0);
  });

  it("reads flux on a rise and zero on a hold", () => {
    const prev = new Uint8Array(64);
    const curr = new Uint8Array(64);
    prev[2] = 20;
    curr[2] = 180;
    curr[50] = 180;
    const binHz = 20;
    expect(bandFlux(curr, prev, binHz, 20, 80)).toBeGreaterThan(0);
    expect(bandFlux(curr, curr, binHz, 20, 80)).toBe(0);
    expect(bandFlux(curr, prev, binHz, 2000, 4000)).toBe(0);
  });

  it("picks an onset once, then waits out the refractory", () => {
    const picker = createOnsetPicker();
    for (let i = 0; i < 8; i++) pickOnset(0.02, picker, i * 0.02);
    const first = pickOnset(0.4, picker, 0.2);
    const again = pickOnset(0.4, picker, 0.22);
    expect(first).toBeGreaterThan(0);
    expect(again).toBe(0);
  });

  it("folds a fast IOI up into a visible beat period", () => {
    expect(visualBeatPeriod(0.25)).toBeCloseTo(0.5, 5);
    expect(visualBeatPeriod(0.5)).toBeCloseTo(0.5, 5);
  });

  it("eases the wind period toward the median kick gap", () => {
    const tempo = createTempoFollow(0);
    followTempo(tempo, true, 0);
    followTempo(tempo, true, 0.5);
    followTempo(tempo, true, 1.0);
    followTempo(tempo, true, 1.5);
    expect(tempo.period).toBeGreaterThan(0.35);
    expect(tempo.period).toBeLessThan(0.7);
    const held = tempo.period;
    followTempo(tempo, false, 1.6);
    expect(tempo.period).toBe(held);
  });
});
