import { describe, expect, it } from "vitest";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { Sequence } from "../src/lib/sequence.ts";
import { World } from "../src/lib/world.ts";
import { createTestFont } from "../src/lib/testFont.ts";

const font = createTestFont();

async function ready() {
  const gm = new GlyphMatter({
    samplingMode: "contour",
    contourSpacing: 10,
    fontSize: 80,
  });
  await gm.sampleFromFont(font, "I");
  const world = new World().configure({ gas: 0, stiffness: 40, damping: 8 });
  return { gm, world };
}

describe("Sequence", () => {
  it("addAnimationStep and addAnimationSteps append", async () => {
    const { gm, world } = await ready();
    const seq = new Sequence(gm, world)
      .addAnimationStep({ word: "I", duration: 0.2, inBetween: "spring" })
      .addAnimationSteps([
        { word: "O", duration: 0.2, inBetween: "spring" },
        { word: "I", duration: 0.2, inBetween: "spring" },
      ]);
    expect(seq.steps).toHaveLength(3);
  });

  it("play loads the first word", async () => {
    const { gm, world } = await ready();
    new Sequence(gm, world)
      .addAnimationStep({ word: "I", duration: 1, inBetween: "spring" })
      .play();
    expect(world.glyphs.some((g) => g.ch === "I" || g.ch === "i")).toBe(true);
  });

  it("spring in-between morphs to the second word after the hold", async () => {
    const { gm, world } = await ready();
    const seq = new Sequence(gm, world, { loop: false })
      .addAnimationSteps([
        { word: "I", duration: 0.15, inBetween: "spring" },
        { word: "O", duration: 0.5, inBetween: "spring" },
      ])
      .play();
    for (let i = 0; i < 6; i++) seq.tick(1 / 60);
    expect(world.glyphs.some((g) => g.ch === "I" || g.ch === "i")).toBe(true);
    for (let i = 0; i < 30; i++) seq.tick(1 / 60);
    expect(world.glyphs.some((g) => g.ch === "O" || g.ch === "o")).toBe(true);
    for (let i = 0; i < 90; i++) seq.tick(1 / 60);
    expect(world.meanHomeDistance()).toBeLessThan(4);
  });

  it("first dissolve goes to the second word, not back to the first", async () => {
    const { gm, world } = await ready();
    const seq = new Sequence(gm, world, {
      loop: false,
      dissolveT: 0.2,
      dissolveDropT: 0.05,
      travelT: 0.1,
      formT: 0.1,
    })
      .addAnimationSteps([
        { word: "I", duration: 0.1 },
        { word: "O", duration: 0.4 },
      ])
      .play();
    for (let i = 0; i < 4; i++) seq.tick(1 / 60);
    expect(seq.phase).toBe("hold");
    for (let i = 0; i < 40; i++) seq.tick(1 / 60);
    expect(world.glyphs.some((g) => g.ch === "O" || g.ch === "o")).toBe(true);
  });

  it("x/y shifts the rest pose", async () => {
    const { gm, world } = await ready();
    new Sequence(gm, world)
      .addAnimationStep({ word: "I", x: 40, y: -10, duration: 1, inBetween: "spring" })
      .play();
    const home = world.homeBounds();
    const unshifted = gm.samplePack("I").bounds;
    expect(home.x).toBeCloseTo(unshifted.x + 40, 0);
    expect(home.y).toBeCloseTo(unshifted.y - 10, 0);
  });

  it("can morph to a ready-made pack instead of a word", async () => {
    const { gm, world } = await ready();
    const dest = gm.samplePack("O");
    const seq = new Sequence(gm, world, { loop: false })
      .addAnimationSteps([
        { word: "I", duration: 0.12, inBetween: "spring" },
        { pack: dest, duration: 0.5, inBetween: "spring" },
      ])
      .play();
    for (let i = 0; i < 40; i++) seq.tick(1 / 60);
    expect(world.glyphs.some((g) => g.ch === "O" || g.ch === "o")).toBe(true);
  });

  it("collide appends stacked-pair then result steps", async () => {
    const { gm, world } = await ready();
    const seq = new Sequence(gm, world, {
      loop: false,
      dissolveT: 0.2,
      dissolveDropT: 0.05,
      travelT: 0.1,
      formT: 0.1,
    }).collide({
      up: "I",
      down: "O",
      into: "V",
      effect: false,
      apart: 0.1,
      collide: 0.1,
      hold: 0.3,
    });
    expect(seq.steps).toHaveLength(3);
    seq.play();
    expect(world.particles.length).toBeGreaterThan(4);
    for (let i = 0; i < 80; i++) seq.tick(1 / 60);
    expect(world.glyphs.some((g) => g.ch === "V" || g.ch === "v")).toBe(true);
  });
});
