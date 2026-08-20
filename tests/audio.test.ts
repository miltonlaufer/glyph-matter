import { describe, expect, it } from "vitest";
import { spectrumCentroid, spectrumEnergy, windFromSpectrum } from "../src/lib/audio.ts";

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

  it("maps energy to stronger, faster wind", () => {
    const quiet = windFromSpectrum(0.1, 0.2);
    const loud = windFromSpectrum(0.9, 0.8);
    expect(loud.vx).toBeGreaterThan(quiet.vx);
    expect(loud.gust ?? 0).toBeGreaterThan(quiet.gust ?? 0);
    expect(loud.period ?? 1).toBeLessThan(quiet.period ?? 1);
  });
});
