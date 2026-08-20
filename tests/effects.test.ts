import { describe, expect, it } from "vitest";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { World } from "../src/lib/world.ts";
import { applyEffect, windEnvelope } from "../src/lib/effects.ts";
import { createTestFont } from "../src/lib/testFont.ts";
import type { Particle } from "../src/lib/world.ts";

const font = createTestFont();

function particle(x: number, y: number): Particle {
  return { x, y, vx: 0, vy: 0, homeX: x, homeY: y, g: 0, k: "contour" };
}

describe("effects", () => {
  it("wind accelerates along the given vector", () => {
    const p = particle(0, 0);
    applyEffect({ kind: "wind", vx: 100, vy: -20, period: 0 }, p, 0.1);
    expect(p.vx).toBeCloseTo(10);
    expect(p.vy).toBeCloseTo(-2);
  });

  it("sawtooth envelope is off then ramps", () => {
    expect(windEnvelope(0)).toBe(0);
    expect(windEnvelope(0.25)).toBe(0);
    expect(windEnvelope(0.5)).toBe(0);
    expect(windEnvelope(0.75)).toBeCloseTo(0.5);
    expect(windEnvelope(0.999)).toBeCloseTo(0.998, 2);
  });

  it("pulsing wind is still at the start of a cycle", () => {
    const p = particle(0, 0);
    applyEffect({ kind: "wind", vx: 100, vy: 0, period: 1, wavelength: 0 }, p, 0.1, 0);
    expect(p.vx).toBeCloseTo(0);
  });

  it("pulsing wind peaks late in the cycle", () => {
    const p = particle(0, 0);
    applyEffect({ kind: "wind", vx: 100, vy: 0, period: 1, wavelength: 0 }, p, 0.1, 0.99);
    expect(p.vx).toBeGreaterThan(8);
  });

  it("attract pulls toward the point", () => {
    const p = particle(10, 0);
    applyEffect({ kind: "attract", x: 0, y: 0, strength: 80 }, p, 0.1);
    expect(p.vx).toBeLessThan(0);
    expect(p.vy).toBeCloseTo(0);
  });

  it("repel pushes away from the point", () => {
    const p = particle(10, 0);
    applyEffect({ kind: "repel", x: 0, y: 0, strength: 80 }, p, 0.1);
    expect(p.vx).toBeGreaterThan(0);
  });

  it("gravity defaults downward", () => {
    const p = particle(0, 0);
    applyEffect({ kind: "gravity" }, p, 0.1);
    expect(p.vx).toBeCloseTo(0);
    expect(p.vy).toBeGreaterThan(0);
  });

  it("vortex adds a tangential kick", () => {
    const p = particle(10, 0);
    applyEffect({ kind: "vortex", x: 0, y: 0, strength: 80 }, p, 0.1);
    expect(p.vy).not.toBe(0);
  });

  it("radius cuts off attract beyond the well", () => {
    const inside = particle(10, 0);
    const outside = particle(80, 0);
    applyEffect({ kind: "attract", x: 0, y: 0, strength: 80, radius: 40 }, inside, 0.1);
    applyEffect({ kind: "attract", x: 0, y: 0, strength: 80, radius: 40 }, outside, 0.1);
    expect(inside.vx).toBeLessThan(0);
    expect(outside.vx).toBe(0);
  });

  it("wind still leans a formed word (legibility 1)", async () => {
    const gm = new GlyphMatter({ samplingMode: "contour", contourSpacing: 10, fontSize: 80 });
    await gm.sampleFromFont(font, "I");
    const world = new World()
      .configure({ legibility: 1, gas: 0, stiffness: 28 })
      .load(gm.exportSamples())
      .addEffect({ kind: "wind", vx: 200, vy: 0, period: 0 });
    const x0 = world.particles[0]?.x ?? 0;
    for (let i = 0; i < 45; i++) world.step(1 / 60);
    expect(world.particles[0]?.x ?? 0).toBeGreaterThan(x0 + 4);
  });

  it("wind still pushes a dissolved cloud", async () => {
    const gm = new GlyphMatter({ samplingMode: "contour", contourSpacing: 10, fontSize: 80 });
    await gm.sampleFromFont(font, "I");
    const world = new World()
      .configure({ legibility: 0.04, gas: 90, stiffness: 28, damping: 6 })
      .load(gm.exportSamples())
      .addEffect({ kind: "wind", vx: 240, vy: 0, period: 0 });
    const meanX = () =>
      world.particles.reduce((s, p) => s + p.x, 0) / Math.max(1, world.particles.length);
    const x0 = meanX();
    for (let i = 0; i < 40; i++) world.step(1 / 60);
    expect(meanX()).toBeGreaterThan(x0 + 6);
  });

  it("World.step applies added effects", async () => {
    const gm = new GlyphMatter({ samplingMode: "contour", contourSpacing: 10, fontSize: 80 });
    await gm.sampleFromFont(font, "I");
    const world = new World()
      .configure({ legibility: 0, gas: 0, stiffness: 0 })
      .load(gm.exportSamples())
      .addEffect({ kind: "wind", vx: 200, vy: 0, period: 0 });
    const x0 = world.particles[0]?.x ?? 0;
    for (let i = 0; i < 20; i++) world.step(1 / 60);
    expect(world.particles[0]?.x ?? 0).toBeGreaterThan(x0);
  });
});
