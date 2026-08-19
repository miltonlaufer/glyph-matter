import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { World } from "../src/lib/world.ts";

const garamond = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../public/fonts/EBGaramond-Regular.ttf"),
);

describe("real font outlines", () => {
  it("samples distinct Garamond letters for milton", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 4,
      fontSize: 120,
    });
    await gm.sampleFromFont(garamond, "milton");
    const pack = gm.exportSamples();
    expect(pack.glyphs.map((g) => g.ch).join("")).toBe("milton");
    expect(pack.points.length).toBeGreaterThan(80);
    const widths = pack.glyphs.map((g) => g.advance);
    expect(new Set(widths.map((w) => Math.round(w))).size).toBeGreaterThan(1);
  });

  it("keeps the leading m of milton on the m of matter", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 5,
      fontSize: 100,
    });
    await gm.sampleFromFont(garamond, "milton");
    const from = gm.exportSamples();
    gm.resample("matter");
    const to = gm.exportSamples();
    const world = new World().load(from);
    const mPoints = world.particles.filter((p) => p.g === 0);
    world.morphTo(to, "origin");
    const mHomes = world.particles
      .filter((p) => mPoints.some((m) => m.x === p.x && m.y === p.y))
      .map((p) => p.homeX);
    const mTarget = to.points.filter((p) => p.g === 0);
    const minX = Math.min(...mTarget.map((p) => p.x));
    const maxX = Math.max(...mTarget.map((p) => p.x));
    const kept = mHomes.filter((x) => x >= minX - 2 && x <= maxX + 2);
    expect(kept.length / mHomes.length).toBeGreaterThan(0.75);
    const travel = world.particles
      .filter((p) => mPoints.some((m) => m.x === p.x && m.y === p.y))
      .map((p) => Math.hypot(p.homeX - p.x, p.homeY - p.y));
    const mean = travel.reduce((a, b) => a + b, 0) / Math.max(travel.length, 1);
    expect(mean).toBeLessThan(1);
  });

  it("does not send the left of an o to the right of an e", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 5,
      fontSize: 180,
    });
    await gm.sampleFromFont(garamond, "milton");
    const from = gm.exportSamples();
    gm.resample("matter");
    const to = gm.exportSamples();
    const world = new World().load(from);
    const oSrc = from.points.filter((p) => p.g === 4);
    const eDst = to.points.filter((p) => p.g === 4);
    const midO = (Math.min(...oSrc.map((p) => p.x)) + Math.max(...oSrc.map((p) => p.x))) / 2;
    const midE = (Math.min(...eDst.map((p) => p.x)) + Math.max(...eDst.map((p) => p.x))) / 2;
    world.morphTo(to, "origin");
    let keep = 0;
    let n = 0;
    for (const p of world.particles) {
      if (p.exit) continue;
      if (!oSrc.some((s) => s.x === p.x && s.y === p.y)) continue;
      n += 1;
      if (p.x < midO === p.homeX < midE) keep += 1;
    }
    expect(n).toBeGreaterThan(20);
    expect(keep / n).toBeGreaterThan(0.8);
  });
});
