import { describe, expect, it } from "vitest";
import { sampleImageFromRgba } from "../src/lib/image.ts";

function white(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  data.fill(255);
  return data;
}

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

describe("sampleImageFromRgba", () => {
  it("traces the edge of a dark rectangle", () => {
    const w = 48;
    const h = 48;
    const data = white(w, h);
    fillRect(data, w, 12, 12, 36, 36, [0, 0, 0]);
    const pack = sampleImageFromRgba(w, h, data, {
      samplingMode: "contour",
      contourSpacing: 2,
      width: 48,
      label: "rect",
    });
    expect(pack.points.length).toBeGreaterThan(20);
    expect(pack.points.every((p) => p.k === "contour")).toBe(true);
    expect(pack.text).toBe("rect");
    const cx = pack.bounds.x + pack.bounds.w / 2;
    const cy = pack.bounds.y + pack.bounds.h / 2;
    expect(cx).toBeGreaterThan(18);
    expect(cx).toBeLessThan(30);
    expect(cy).toBeGreaterThan(18);
    expect(cy).toBeLessThan(30);
  });

  it("fills the dark interior", () => {
    const w = 40;
    const h = 40;
    const data = white(w, h);
    fillRect(data, w, 8, 8, 32, 32, [20, 20, 20]);
    const pack = sampleImageFromRgba(w, h, data, {
      samplingMode: "fill",
      fillSpacing: 3,
      fillDarkness: 0.5,
      width: 40,
    });
    expect(pack.points.length).toBeGreaterThan(8);
    expect(pack.points.every((p) => p.k === "fill")).toBe(true);
    const inner = pack.points.filter((p) => p.x > 12 && p.x < 28 && p.y > 12 && p.y < 28);
    expect(inner.length).toBeGreaterThan(0);
  });

  it("does not fill a blank field", () => {
    const w = 40;
    const h = 40;
    const data = white(w, h);
    const pack = sampleImageFromRgba(w, h, data, {
      samplingMode: "both",
      width: 40,
    });
    expect(pack.points.length).toBeLessThan(8);
  });

  it("does not turn a smooth gradient into a rectangle of dots", () => {
    const w = 48;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round((x / (w - 1)) * 255);
        const i = (y * w + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const pack = sampleImageFromRgba(w, h, data, {
      samplingMode: "both",
      width: 48,
      fillSpacing: 3,
    });
    const inner = pack.points.filter(
      (p) => p.x > 6 && p.x < w - 6 && p.y > 3 && p.y < h - 3,
    );
    expect(inner.length).toBe(0);
    expect(pack.points.length).toBeLessThan(80);
  });

  it("keeps both-mode ink on the outline of a flat rectangle", () => {
    const w = 48;
    const h = 48;
    const data = white(w, h);
    fillRect(data, w, 12, 12, 36, 36, [0, 0, 0]);
    const pack = sampleImageFromRgba(w, h, data, {
      samplingMode: "both",
      contourSpacing: 2,
      fillSpacing: 3,
      width: 48,
    });
    expect(pack.points.length).toBeGreaterThan(20);
    const deep = pack.points.filter(
      (p) => p.x > 18 && p.x < 30 && p.y > 18 && p.y < 30,
    );
    expect(deep.length).toBe(0);
  });

  it("keeps ink on a circle, not the whole canvas", () => {
    const w = 64;
    const h = 64;
    const data = white(w, h);
    const cx = 32;
    const cy = 32;
    const r = 14;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          const i = (y * w + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
    const pack = sampleImageFromRgba(w, h, data, {
      samplingMode: "contour",
      contourSpacing: 2,
      width: 64,
    });
    expect(pack.points.length).toBeGreaterThan(20);
    const far = pack.points.filter((p) => Math.hypot(p.x - cx, p.y - cy) > r + 6);
    expect(far.length).toBe(0);
  });
});
