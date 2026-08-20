import { describe, expect, it } from "vitest";
import { canvasDotRadius, displayInk } from "../src/lib/density.ts";

const BASE = { contourSpacing: 2, fillSpacing: 2.5, refCss: 680 };

describe("displayInk", () => {
  it("keeps the base spacing at the reference CSS size and 1x", () => {
    const ink = displayInk(680, 680, 1, BASE);
    expect(ink.contourSpacing).toBeCloseTo(2, 5);
    expect(ink.fillSpacing).toBeCloseTo(2.5, 5);
  });

  it("tightens spacing on a small CSS viewport", () => {
    const ink = displayInk(340, 600, 1, BASE);
    expect(ink.contourSpacing).toBeLessThan(2);
    expect(ink.fillSpacing).toBeLessThan(2.5);
  });

  it("loosens spacing on a high-DPR display of the same CSS size", () => {
    const one = displayInk(680, 680, 1, BASE);
    const two = displayInk(680, 680, 2, BASE);
    expect(two.contourSpacing).toBeGreaterThan(one.contourSpacing);
  });
});

describe("canvasDotRadius", () => {
  it("maps CSS pixels onto the backing store", () => {
    expect(canvasDotRadius(1.2, 1)).toBeCloseTo(1.2, 5);
    expect(canvasDotRadius(1.2, 2)).toBeCloseTo(2.4, 5);
  });
});
