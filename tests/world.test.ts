import { describe, expect, it } from "vitest";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { World } from "../src/lib/world.ts";
import { createTestFont } from "../src/lib/testFont.ts";

const font = createTestFont();

async function packFor(text: string) {
  const gm = new GlyphMatter({
    samplingMode: "contour",
    contourSpacing: 10,
    fontSize: 80,
  });
  await gm.sampleFromFont(font, text);
  return gm.exportSamples();
}

describe("World", () => {
  it("starts on the rest pose", async () => {
    const world = new World().load(await packFor("I"));
    expect(world.particles.length).toBeGreaterThan(4);
    expect(world.meanHomeDistance()).toBe(0);
  });

  it("returns toward home after a scatter when legible", async () => {
    const world = new World()
      .configure({ legibility: 1, gas: 0 })
      .load(await packFor("I"))
      .scatter(800);
    for (let i = 0; i < 8; i++) world.step(1 / 60);
    const blown = world.meanHomeDistance();
    expect(blown).toBeGreaterThan(1);
    for (let i = 0; i < 90; i++) world.step(1 / 60);
    expect(world.meanHomeDistance()).toBeLessThan(blown * 0.25);
  });

  it("keeps live positions when a new pack is loaded so text can morph", async () => {
    const world = new World().load(await packFor("I"));
    const first = world.particles[0];
    if (!first) throw new Error("expected particles");
    first.x += 40;
    const kept = first.x;
    world.load(await packFor("O"));
    expect(world.particles[0]?.x).toBe(kept);
    expect(world.particles[0]?.homeX).not.toBe(kept);
  });

  it("morphTo retargets homes without teleporting the cloud", async () => {
    const from = await packFor("I");
    const to = await packFor("O");
    const world = new World().configure({ legibility: 1, gas: 0 }).load(from);
    const xs = world.particles.map((p) => p.x);
    world.morphTo(to);
    expect(world.particles.length).toBeGreaterThanOrEqual(to.points.length);
    expect(world.particles.some((p) => xs.includes(p.x))).toBe(true);
    expect(world.meanHomeDistance()).toBeGreaterThan(0);
    for (let i = 0; i < 90; i++) world.step(1 / 60);
    expect(world.meanHomeDistance()).toBeLessThan(2);
  });

  it("removes exiting particles once they reach home", () => {
    const p = {
      x: 10,
      y: 0,
      vx: 0,
      vy: 0,
      homeX: 10,
      homeY: 0,
      g: 0,
      k: "contour" as const,
      life: 1,
      exit: true as const,
    };
    const world = new World().configure({ gas: 0 }).load({
      v: 1,
      text: "x",
      sampling: {
        mode: "contour",
        contourSpacing: 10,
        fillSpacing: 10,
        fontSize: 80,
        fillRule: "nonzero",
      },
      font: { familyName: "t", unitsPerEm: 1000 },
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      glyphs: [{ i: 0, ch: "x", x: 0, y: 0, advance: 10, word: 0 }],
      points: [{ x: 10, y: 0, g: 0, k: "contour" }],
    });
    world.particles = [p];
    world.step(1 / 60);
    expect(world.particles).toHaveLength(0);
  });

  it("drops faded spare points so morph loops stay bounded", async () => {
    const from = await packFor("I");
    const to = await packFor("O");
    const world = new World().configure({ fade: 0.2, gas: 0 }).load(from);
    for (let i = 0; i < 8; i++) {
      world.morphTo(i % 2 === 0 ? to : from);
      for (let s = 0; s < 30; s++) world.step(1 / 60);
    }
    const living = world.particles.filter((p) => !p.exit);
    expect(living.length).toBeLessThanOrEqual(Math.max(from.points.length, to.points.length));
    expect(world.particles.length).toBeLessThan(from.points.length + to.points.length + 8);
  });
});
