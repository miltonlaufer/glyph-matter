import { describe, expect, it } from "vitest";
import { Automata, bridgeMask, stepAutomata, stepGrowth } from "../src/lib/automata.ts";
import { GlyphMatter } from "../src/lib/GlyphMatter.ts";
import { createTestFont } from "../src/lib/testFont.ts";

function gridFrom(rows: string[]): Uint8Array {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      cells[y * w + x] = ch === "2" ? 2 : ch === "1" || ch === "#" ? 1 : 0;
    }
  }
  return cells;
}

function show(cells: Uint8Array, cols: number): string[] {
  const rows = (cells.length / cols) | 0;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = "";
    for (let x = 0; x < cols; x++) {
      const s = cells[y * cols + x] ?? 0;
      row += s === 2 ? "2" : s === 1 ? "#" : ".";
    }
    out.push(row);
  }
  return out;
}

describe("stepAutomata", () => {
  it("blinks a Conway oscillator", () => {
    const cols = 5;
    const rows = 5;
    const prev = gridFrom([".....", "..#..", "..#..", "..#..", "....."]);
    const next = new Uint8Array(cols * rows);
    stepAutomata(prev, next, cols, rows, "life", null);
    expect(show(next, cols)).toEqual([".....", ".....", ".###.", ".....", "....."]);
    stepAutomata(next, prev, cols, rows, "life", null);
    expect(show(prev, cols)).toEqual([".....", "..#..", "..#..", "..#..", "....."]);
  });

  it("keeps a 2x2 block still in Life", () => {
    const cols = 4;
    const rows = 4;
    const prev = gridFrom(["....", ".##.", ".##.", "...."]);
    const next = new Uint8Array(cols * rows);
    stepAutomata(prev, next, cols, rows, "life", null);
    expect(show(next, cols)).toEqual(["....", ".##.", ".##.", "...."]);
  });

  it("Seeds births from exactly two neighbors and never survives", () => {
    const cols = 4;
    const rows = 4;
    const prev = gridFrom(["....", ".##.", "....", "...."]);
    const next = new Uint8Array(cols * rows);
    stepAutomata(prev, next, cols, rows, "seeds", null);
    expect(next[1 * cols + 1]).toBe(0);
    expect(next[1 * cols + 2]).toBe(0);
    expect(next.some((s) => s === 1)).toBe(true);
  });

  it("Brian's Brain turns firing cells refractory, then empty", () => {
    const cols = 3;
    const rows = 3;
    const prev = gridFrom(["...", ".#.", "..."]);
    const next = new Uint8Array(cols * rows);
    stepAutomata(prev, next, cols, rows, "brain", null);
    expect(next[1 * cols + 1]).toBe(2);
    stepAutomata(next, prev, cols, rows, "brain", null);
    expect(prev[1 * cols + 1]).toBe(0);
  });

  it("confine forbids births outside the letter mask", () => {
    const cols = 5;
    const rows = 5;
    const prev = gridFrom([".....", ".###.", ".....", ".....", "....."]);
    const mask = new Uint8Array(cols * rows);
    mask[2 * cols + 2] = 1;
    const next = new Uint8Array(cols * rows);
    stepAutomata(prev, next, cols, rows, "life", mask);
    for (let i = 0; i < next.length; i++) {
      if (mask[i] === 0) expect(next[i]).toBe(0);
    }
  });
});

describe("Automata", () => {
  it("seeds live cells from a sampled letter", async () => {
    const gm = new GlyphMatter({
      samplingMode: "fill",
      fillSpacing: 6,
      fontSize: 80,
    });
    await gm.sampleFromFont(createTestFont(), "I");
    const ca = new Automata().configure({ confine: true }).seedFromPack(gm.exportSamples());
    expect(ca.empty).toBe(false);
    expect(ca.liveCount()).toBeGreaterThan(4);
    ca.step();
    expect(ca.cells.length).toBe(ca.cols * ca.rows);
  });

  it("reset restores the seeded word", async () => {
    const gm = new GlyphMatter({
      samplingMode: "fill",
      fillSpacing: 8,
      fontSize: 80,
    });
    await gm.sampleFromFont(createTestFont(), "O");
    const ca = new Automata().seedFromPack(gm.exportSamples());
    const before = ca.liveCount();
    for (let i = 0; i < 6; i++) ca.step();
    ca.reset();
    expect(ca.liveCount()).toBe(before);
  });

  it("paint only writes inside the mask when confined", () => {
    const ca = new Automata();
    ca.cols = 4;
    ca.rows = 4;
    ca.cell = 10;
    ca.originX = 0;
    ca.originY = 0;
    ca.cells = new Uint8Array(16);
    ca.mask = new Uint8Array(16);
    ca.mask[1 * 4 + 1] = 1;
    ca.confine = true;
    ca.paint(15, 15, 40);
    expect(ca.cells[1 * 4 + 1]).toBe(1);
    expect(ca.cells[0]).toBe(0);
  });
});

describe("growth and morph grids", () => {
  it("dilates live ink into the allow mask and dies outside it", () => {
    const cols = 5;
    const rows = 3;
    const prev = gridFrom(["#....", ".....", "....."]);
    const allow = gridFrom(["#####", "#####", "....."]);
    const next = new Uint8Array(cols * rows);
    stepGrowth(prev, next, cols, rows, allow);
    expect(next[0]).toBe(1);
    expect(next[1]).toBe(1);
    expect(next[1 * cols + 0]).toBe(1);
    expect(next[2 * cols + 0]).toBe(0);
  });

  it("builds a corridor between two separate blobs", () => {
    const cols = 6;
    const rows = 1;
    const from = gridFrom(["#....."]);
    const to = gridFrom([".....#"]);
    const bridge = bridgeMask(from, to, cols, rows);
    expect(bridge[0]).toBe(1);
    expect(bridge[5]).toBe(1);
    expect(bridge[2]).toBe(1);
  });

  it("grows from one sampled letter toward another", async () => {
    const gm = new GlyphMatter({
      samplingMode: "fill",
      fillSpacing: 8,
      fontSize: 80,
    });
    await gm.sampleFromFont(createTestFont(), "I");
    const from = gm.exportSamples();
    gm.resample("O");
    const to = gm.exportSamples();
    const ca = new Automata().configure({ kind: "growth", speed: 24 }).seedMorph(from, to);
    expect(ca.morphing).toBe(true);
    expect(ca.liveCount()).toBeGreaterThan(0);
    expect(ca.cell).toBeLessThanOrEqual(2);
    const start = ca.liveCount();
    ca.setProgress(0.3);
    for (let i = 0; i < 12; i++) ca.step();
    expect(ca.liveCount()).toBeGreaterThanOrEqual(start);
    ca.setProgress(1);
    expect(ca.liveCount()).toBeGreaterThan(0);
    const toLive = [...ca.toMask].filter((v) => v === 1).length;
    expect(ca.liveCount()).toBe(toLive);
  });
});
