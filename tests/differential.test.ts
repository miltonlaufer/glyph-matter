import { describe, expect, it } from "vitest";
import {
  DifferentialGrowth,
  ringsFromPack,
  splitLongEdges,
  type DiffNode,
} from "../src/lib/differential.ts";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { createTestFont } from "../src/lib/testFont.ts";

function node(x: number, y: number): DiffNode {
  return { x, y, vx: 0, vy: 0 };
}

describe("splitLongEdges", () => {
  it("inserts a vertex on edges longer than the split length", () => {
    const ring = [node(0, 0), node(40, 0), node(20, 30)];
    const out = splitLongEdges(ring, 12, 8);
    expect(out.length).toBeGreaterThan(ring.length);
    expect(out.some((p) => p.x > 0 && p.x < 40 && Math.abs(p.y) < 8)).toBe(true);
  });

  it("respects the insert budget", () => {
    const ring = [node(0, 0), node(40, 0), node(20, 30)];
    const out = splitLongEdges(ring, 4, 1);
    expect(out.length).toBe(ring.length + 1);
  });
});

describe("DifferentialGrowth", () => {
  it("grows node count by splitting", () => {
    const dg = new DifferentialGrowth().configure({ splitLen: 10, maxNodes: 80, speed: 24 });
    dg.rings = [[node(0, 0), node(50, 0), node(50, 50), node(0, 50)]];
    const before = dg.nodeCount();
    for (let i = 0; i < 12; i++) dg.step(1 / 60);
    expect(dg.nodeCount()).toBeGreaterThan(before);
  });

  it("pulls nodes toward the target word as progress rises", async () => {
    const gm = new GlyphMatter({
      samplingMode: "contour",
      contourSpacing: 10,
      fontSize: 80,
    });
    await gm.sampleFromFont(createTestFont(), "I");
    const from = gm.exportSamples();
    gm.resample("O");
    const to = gm.exportSamples();
    const dg = new DifferentialGrowth().seedMorph(from, to);
    expect(dg.empty).toBe(false);
    expect(ringsFromPack(from).length).toBeGreaterThan(0);
    const start = dg.rings[0]?.[0];
    if (!start) throw new Error("expected a ring");
    const x0 = start.x;
    const y0 = start.y;
    dg.setProgress(1);
    for (let i = 0; i < 40; i++) dg.step(1 / 60);
    const after = dg.rings[0]?.[0];
    if (!after) throw new Error("expected a ring");
    const dest = to.points.filter((p) => p.k === "contour");
    const dist = (x: number, y: number) =>
      Math.min(...dest.map((p) => Math.hypot(p.x - x, p.y - y)));
    expect(dist(after.x, after.y)).toBeLessThan(dist(x0, y0) + 0.01);
  });
});
