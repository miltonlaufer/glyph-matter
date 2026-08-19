import { describe, expect, it } from "vitest";
import { pointInContours, windingNumber, samplePolyline } from "../src/lib/path.ts";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("windingNumber", () => {
  it("counts a ccw square as inside", () => {
    expect(windingNumber(5, 5, square)).not.toBe(0);
    expect(windingNumber(20, 5, square)).toBe(0);
  });
});

describe("pointInContours", () => {
  it("treats an opposite inner contour as a hole under nonzero", () => {
    const outer = square;
    const inner = [
      { x: 3, y: 3 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 3 },
    ];
    expect(pointInContours(5, 5, [outer, inner], "nonzero")).toBe(false);
    expect(pointInContours(1, 1, [outer, inner], "nonzero")).toBe(true);
    expect(pointInContours(20, 1, [outer, inner], "nonzero")).toBe(false);
  });
});

describe("samplePolyline", () => {
  it("walks a closed loop at roughly the requested spacing", () => {
    const pts = samplePolyline(square, 5);
    expect(pts.length).toBeGreaterThan(4);
    expect(pts[0]?.t).toBe(0);
    expect(pts[pts.length - 1]?.t).toBeLessThan(1);
  });
});
