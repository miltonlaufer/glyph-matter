import { describe, expect, it } from "vitest";
import { morphParticles, type Morphable } from "../src/lib/morph.ts";

function particle(x: number, y: number): Morphable {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    homeX: x,
    homeY: y,
    g: 0,
    k: "contour",
  };
}

describe("morphParticles closest assignment", () => {
  it("fills each target with the nearest live particles", () => {
    const current = [
      particle(0, 0),
      particle(1, 0),
      particle(100, 0),
      particle(101, 0),
    ];
    const targets = [
      { x: 2, y: 0, g: 0, k: "contour" as const },
      { x: 102, y: 0, g: 1, k: "contour" as const },
    ];
    const out = morphParticles(current, targets, "origin");
    const left = out.filter((p) => p.homeX < 50);
    const right = out.filter((p) => p.homeX > 50);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.every((p) => p.x < 50)).toBe(true);
    expect(right.every((p) => p.x > 50)).toBe(true);
  });

  it("keeps the top of a letter at the top when the letter is shared", () => {
    const current: Morphable[] = [
      { ...particle(0, 0), g: 0, k: "contour", c: 0, t: 0 },
      { ...particle(0, 20), g: 0, k: "contour", c: 0, t: 0.5 },
    ];
    const targets = [
      { x: 1, y: 0, g: 0, k: "contour" as const, c: 0, t: 0 },
      { x: 1, y: 20, g: 0, k: "contour" as const, c: 0, t: 0.5 },
    ];
    const glyph = { i: 0, ch: "m", x: 0, y: 0, advance: 10, word: 0 };
    const out = morphParticles(current, targets, "origin", [glyph], [glyph]);
    const top = out.find((p) => p.y === 0);
    const bot = out.find((p) => p.y === 20);
    expect(top?.homeY).toBe(0);
    expect(bot?.homeY).toBe(20);
  });

  it("pairs the later t of matter with milton's t, not the earlier one", () => {
    const charsFrom = [..."matter"];
    const charsTo = [..."milton"];
    const fromGlyphs = charsFrom.map((ch, i) => ({
      i,
      ch,
      x: i * 10,
      y: 0,
      advance: 10,
      word: 0,
    }));
    const toGlyphs = charsTo.map((ch, i) => ({
      i,
      ch,
      x: i * 10,
      y: 0,
      advance: 10,
      word: 0,
    }));
    const current = charsFrom.map((_, i) => ({
      ...particle(i * 10, 0),
      g: i,
    }));
    const targets = charsTo.map((_, i) => ({
      x: i * 10,
      y: 0,
      g: i,
      k: "contour" as const,
    }));
    const out = morphParticles(current, targets, "origin", fromGlyphs, toGlyphs);
    const secondT = out.find((p) => p.x === 30);
    const firstT = out.find((p) => p.x === 20);
    expect(secondT?.homeX).toBe(30);
    expect(firstT?.homeX).toBe(20);
  });

  it("keeps the left of a letter on the left when the letter changes", () => {
    const current: Morphable[] = [
      { ...particle(0, 0), g: 0 },
      { ...particle(0, 10), g: 0 },
      { ...particle(0, 20), g: 0 },
      { ...particle(10, 10), g: 0 },
    ];
    const targets = [
      { x: 0, y: 0, g: 0, k: "contour" as const },
      { x: 0, y: 20, g: 0, k: "contour" as const },
      { x: 20, y: 0, g: 0, k: "contour" as const },
      { x: 20, y: 20, g: 0, k: "contour" as const },
    ];
    const fromG = { i: 0, ch: "e", x: 0, y: 0, advance: 12, word: 0 };
    const toG = { i: 0, ch: "o", x: 0, y: 0, advance: 22, word: 0 };
    const out = morphParticles(current, targets, "origin", [fromG], [toG]);
    const topLeft = out.find((p) => p.x === 0 && p.y === 0);
    const botLeft = out.find((p) => p.x === 0 && p.y === 20);
    expect(topLeft?.homeX).toBe(0);
    expect(botLeft?.homeX).toBe(0);
    const right = out.find((p) => p.x === 10);
    expect(right?.homeX).toBe(20);
  });

  it("creates extra letters from the closest existing letter", () => {
    const charsFrom = [..."ab"];
    const charsTo = [..."abc"];
    const fromGlyphs = charsFrom.map((ch, i) => ({
      i,
      ch,
      x: i * 50,
      y: 0,
      advance: 40,
      word: 0,
    }));
    const toGlyphs = charsTo.map((ch, i) => ({
      i,
      ch,
      x: i * 50,
      y: 0,
      advance: 40,
      word: 0,
    }));
    const current = charsFrom.map((_, i) => ({
      ...particle(i * 50, 0),
      g: i,
    }));
    const targets = charsTo.map((_, i) => ({
      x: i * 50,
      y: 0,
      g: i,
      k: "contour" as const,
    }));
    const out = morphParticles(current, targets, "origin", fromGlyphs, toGlyphs);
    const born = out.filter((p) => !p.exit && (p.homeX ?? 0) > 50);
    expect(born.length).toBeGreaterThan(0);
    expect(born.every((p) => p.x === 50)).toBe(true);
  });

  it("sends leftover letters evenly into every letter of the shorter word, then they exit", () => {
    const charsFrom = [..."milton"];
    const charsTo = [..."papa"];
    const fromGlyphs = charsFrom.map((ch, i) => ({
      i,
      ch,
      x: i * 10,
      y: 0,
      advance: 10,
      word: 0,
    }));
    const toGlyphs = charsTo.map((ch, i) => ({
      i,
      ch,
      x: i * 10,
      y: 0,
      advance: 10,
      word: 0,
    }));
    const current = [
      ...[0, 1, 2, 3].map((i) => ({ ...particle(i * 10, 0), g: i })),
      { ...particle(40, 0), g: 4 },
      { ...particle(41, 0), g: 4 },
      { ...particle(50, 0), g: 5 },
      { ...particle(51, 0), g: 5 },
    ];
    const targets = charsTo.map((_, i) => ({
      x: i * 10,
      y: 0,
      g: i,
      k: "contour" as const,
    }));
    const out = morphParticles(current, targets, "origin", fromGlyphs, toGlyphs);
    const extras = out.filter((p) => p.exit);
    expect(extras.some((p) => p.x === 0)).toBe(true);
    expect(extras.some((p) => p.x >= 50)).toBe(true);
  });

  it("keeps the shorter word in the middle: the becomes riz, ho/on appear on the sides", () => {
    const charsFrom = [..."the"];
    const charsTo = [..."horizon"];
    const fromGlyphs = charsFrom.map((ch, i) => ({
      i,
      ch,
      x: i * 10,
      y: 0,
      advance: 10,
      word: 0,
    }));
    const toGlyphs = charsTo.map((ch, i) => ({
      i,
      ch,
      x: i * 10,
      y: 0,
      advance: 10,
      word: 0,
    }));
    const current = charsFrom.map((_, i) => ({
      ...particle(i * 10, 0),
      g: i,
    }));
    const targets = charsTo.map((_, i) => ({
      x: i * 10,
      y: 0,
      g: i,
      k: "contour" as const,
    }));
    const out = morphParticles(current, targets, "origin", fromGlyphs, toGlyphs);
    const t = out.find((p) => p.x === 0 && !p.exit);
    const h = out.find((p) => p.x === 10 && !p.exit);
    const e = out.find((p) => p.x === 20 && !p.exit);
    expect(t?.homeX).toBe(0);
    expect(h?.homeX).toBe(10);
    expect(e?.homeX).toBe(20);
    const born = out.filter((p) => !p.exit && !current.some((c) => c.x === p.x && c.g === p.g));
    const left = born.filter((p) => (p.homeX ?? 0) < 0);
    const right = born.filter((p) => (p.homeX ?? 0) > 20);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.every((p) => p.x === 0)).toBe(true);
    expect(right.every((p) => p.x === 20)).toBe(true);

    const back = morphParticles(out, current.map((p) => ({
      x: p.x,
      y: p.y,
      g: p.g,
      k: "contour" as const,
    })), "origin", toGlyphs, fromGlyphs);
    const core = back.filter((p) => !p.exit && p.homeX >= 0 && p.homeX <= 20);
    expect(core.some((p) => p.homeX === 0)).toBe(true);
    expect(core.some((p) => p.homeX === 10)).toBe(true);
    expect(core.some((p) => p.homeX === 20)).toBe(true);
    expect(Math.max(...core.map((p) => p.homeX))).toBe(20);
  });

  it("centers a shorter word on the full width of a longer one, not the last letters", () => {
    const fromGlyphs = [
      { i: 0, ch: "m", x: 0, y: 0, advance: 50, word: 0 },
      { i: 1, ch: "i", x: 50, y: 0, advance: 10, word: 0 },
      { i: 2, ch: "l", x: 60, y: 0, advance: 10, word: 0 },
      { i: 3, ch: "t", x: 70, y: 0, advance: 10, word: 0 },
      { i: 4, ch: "o", x: 80, y: 0, advance: 20, word: 0 },
      { i: 5, ch: "n", x: 100, y: 0, advance: 20, word: 0 },
    ];
    const toGlyphs = [
      { i: 0, ch: "p", x: 0, y: 0, advance: 20, word: 0 },
      { i: 1, ch: "a", x: 20, y: 0, advance: 20, word: 0 },
      { i: 2, ch: "p", x: 40, y: 0, advance: 20, word: 0 },
      { i: 3, ch: "a", x: 60, y: 0, advance: 20, word: 0 },
    ];
    const current = fromGlyphs.map((g) => ({
      ...particle(g.x, 0),
      g: g.i,
    }));
    const targets = toGlyphs.map((g) => ({
      x: g.x,
      y: 0,
      g: g.i,
      k: "contour" as const,
    }));
    const out = morphParticles(current, targets, "origin", fromGlyphs, toGlyphs);
    const living = out.filter((p) => !p.exit);
    const minHome = Math.min(...living.map((p) => p.homeX));
    const maxHome = Math.max(...living.map((p) => p.homeX));
    const miltonCenter = 50;
    const papaCenter = (minHome + maxHome) / 2;
    expect(Math.abs(papaCenter - miltonCenter)).toBeLessThan(8);
    expect(minHome).toBeLessThan(40);
  });
});
