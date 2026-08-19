import { describe, expect, it } from "vitest";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { createTestFont } from "../src/lib/testFont.ts";
import { parsePack } from "../src/lib/pack.ts";

const font = createTestFont();

describe("GlyphMatter live sampling", () => {
  it("samples contour points from a font", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 8,
      fontSize: 100,
    });
    await gm.sampleFromFont(font, "I");
    const points = gm.getPoints();
    expect(points.length).toBeGreaterThan(8);
    expect(points.every((p) => p.k === "contour")).toBe(true);
    expect(gm.hasFont()).toBe(true);
    expect(gm.getText()).toBe("I");
  });

  it("keeps the hole of O empty in fill mode", async () => {
    const gm = new GlyphMatter({
      samplingMode: "fill",
      fillSpacing: 6,
      fontSize: 100,
    });
    await gm.sampleFromFont(font, "O");
    const pack = gm.exportSamples();
    expect(pack.points.length).toBeGreaterThan(10);
    expect(pack.points.every((p) => p.k === "fill")).toBe(true);

    const { x, y, w, h } = pack.bounds;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const inner = pack.points.filter(
      (p) => Math.abs(p.x - cx) < w * 0.12 && Math.abs(p.y - cy) < h * 0.12,
    );
    expect(inner).toHaveLength(0);
  });

  it("fills the interior of I", async () => {
    const gm = new GlyphMatter({
      samplingMode: "fill",
      fillSpacing: 6,
      fontSize: 100,
    });
    await gm.sampleFromFont(font, "I");
    const pack = gm.exportSamples();
    const { x, y, w, h } = pack.bounds;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const inner = pack.points.filter(
      (p) => Math.abs(p.x - cx) < w * 0.3 && Math.abs(p.y - cy) < h * 0.3,
    );
    expect(inner.length).toBeGreaterThan(0);
  });

  it("resamples after samplingMode changes when a font is loaded", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 10,
      fillSpacing: 8,
      fontSize: 100,
    });
    await gm.sampleFromFont(font, "IO");
    const contourOnly = gm.getPoints().length;
    gm.configure({ samplingMode: "both" }).resample();
    expect(gm.getPoints().length).toBeGreaterThan(contourOnly);
    expect(gm.getPoints().some((p) => p.k === "fill")).toBe(true);
    expect(gm.getPoints().some((p) => p.k === "contour")).toBe(true);
  });

  it("resamples a new string without reloading the font", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 12,
      fontSize: 80,
    });
    await gm.sampleFromFont(font, "I");
    gm.resample("O");
    expect(gm.getText()).toBe("O");
    expect(gm.exportSamples().glyphs.map((g) => g.ch).join("")).toBe("O");
  });

  it("scales sampled bounds when fontSize changes", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 10,
      fontSize: 80,
    });
    await gm.sampleFromFont(font, "I");
    const small = gm.exportSamples().bounds.h;
    gm.configure({ fontSize: 160 }).resample();
    expect(gm.exportSamples().bounds.h).toBeGreaterThan(small * 1.5);
  });

  it("keeps glyph identity on each point", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 12,
      fontSize: 80,
    });
    await gm.sampleFromFont(font, "VOID");
    const pack = gm.exportSamples();
    expect(pack.glyphs.map((g) => g.ch).join("")).toBe("VOID");
    expect(pack.points.every((p) => p.g >= 0 && p.g < pack.glyphs.length)).toBe(
      true,
    );
  });
});

describe("GlyphMatter shipped packs", () => {
  it("round-trips through JSON without a font", async () => {
    const live = new GlyphMatter({
      samplingMode: "both",
      contourSpacing: 10,
      fillSpacing: 10,
      fontSize: 90,
    });
    await live.sampleFromFont(font, "void");
    const json = live.exportSamplesJSON();

    const shipped = new GlyphMatter().loadSamples(json);
    expect(shipped.hasFont()).toBe(false);
    expect(shipped.getText()).toBe("void");
    expect(shipped.getPoints()).toEqual(live.getPoints());
    expect(shipped.samplingMode).toBe("both");
  });

  it("exports an ES module string", async () => {
    const gm = new GlyphMatter({ samplingMode: "contour", fontSize: 80 });
    await gm.sampleFromFont(font, "I");
    const mod = gm.exportSamplesModule("voidPack");
    expect(mod.startsWith("export const voidPack = ")).toBe(true);
    expect(mod.endsWith(";\n")).toBe(true);
    const json = mod.slice("export const voidPack = ".length, -2);
    const pack = parsePack(json);
    expect(pack.points.length).toBe(gm.getPoints().length);
  });

  it("refuses resample() when only a pack is loaded", async () => {
    const live = new GlyphMatter({ samplingMode: "contour", fontSize: 80 });
    await live.sampleFromFont(font, "I");
    const shipped = new GlyphMatter().loadSamples(live.exportSamples());
    expect(() => shipped.resample()).toThrow(/No font loaded/);
  });

  it("rejects an unknown pack version", () => {
    expect(() => parsePack({ v: 99, text: "", points: [], glyphs: [] })).toThrow(
      /Unsupported sample pack version/,
    );
  });
});
