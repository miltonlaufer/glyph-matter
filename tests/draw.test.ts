import { describe, expect, it } from "vitest";
import { makeView } from "../src/lib/draw.ts";

const box = { x: 0, y: 0, w: 800, h: 40 };

describe("makeView", () => {
  it("keeps actual at dpr when the pack fits", () => {
    const view = makeView({ x: 0, y: 0, w: 80, h: 40 }, 800, 600, {
      fit: "actual",
      dpr: 2,
    });
    expect(view.scale).toBe(2);
  });

  it("shrinks actual when the pack is wider than the canvas", () => {
    const view = makeView(box, 400, 300, { fit: "actual", dpr: 2 });
    expect(view.scale).toBeLessThan(2);
    expect(box.w * view.scale).toBeLessThanOrEqual(400 - 96);
  });
});
