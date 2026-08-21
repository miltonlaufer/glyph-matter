import { describe, expect, it } from "vitest";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { mergePacks, placePack } from "../src/lib/pack.ts";
import { createTestFont } from "../src/lib/testFont.ts";

const font = createTestFont();

describe("mergePacks", () => {
  it("stacks two sampled words and remaps glyph indices", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 12,
      fontSize: 80,
    });
    await gm.sampleFromFont(font, "I");
    const a = placePack(gm.exportSamples(), 0, -40);
    const b = placePack(gm.samplePack("O"), 0, 40);
    const merged = mergePacks(a, b);
    expect(merged.points.length).toBe(a.points.length + b.points.length);
    expect(merged.glyphs.length).toBe(a.glyphs.length + b.glyphs.length);
    expect(merged.points.some((p) => p.g >= a.glyphs.length)).toBe(true);
    expect(merged.bounds.h).toBeGreaterThan(a.bounds.h);
    expect(merged.bounds.y).toBeLessThan(b.bounds.y);
  });
});
