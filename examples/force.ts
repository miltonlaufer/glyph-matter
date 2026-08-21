/**
 * Force sketches matching the workbench screenshots:
 * attract (offset 0, 76 / strength 202 / radius 511),
 * wind (140, 0 / gust 50 / period 1.4 s / wavelength 677),
 * vortex (offset 0, 160 / strength 577 / radius 289).
 *
 * Offsets are from the word center, same as the workbench.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  drawParticles,
  makeView,
  type ParticleEffect,
} from "../src/lib/index.ts";
import { mountSiteNav } from "./nav.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas, unionBounds } from "./shared.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("force example is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const kind = document.body.dataset.force;
if (kind !== "attract" && kind !== "wind" && kind !== "vortex") {
  throw new Error("set data-force to attract, wind, or vortex");
}

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, "glyph");
const a = gm.samplePack("glyph");
const b = gm.samplePack("matter");
const pad = kind === "wind" ? a.sampling.fontSize * 0.55 : a.sampling.fontSize * 0.85;
const viewBounds = unionBounds(a.bounds, b.bounds, pad);
const originX = a.bounds.x + a.bounds.w / 2;
const mid = { x: originX, y: a.bounds.y + a.bounds.h / 2 };

const world = new World().configure({
  stiffness: 28,
  damping: 7,
  gas: 90,
  legibility: 1,
});
const setPointerView = followPointer(canvas, world);

function forceFor(which: typeof kind): ParticleEffect {
  if (which === "attract") {
    return {
      kind: "attract",
      x: mid.x + 0,
      y: mid.y + 76,
      strength: 202,
      radius: 511,
    };
  }
  if (which === "wind") {
    return {
      kind: "wind",
      vx: 140,
      vy: 0,
      gust: 50,
      period: 1.4,
      wavelength: 677,
    };
  }
  return {
    kind: "vortex",
    x: mid.x + 0,
    y: mid.y + 160,
    strength: 577,
    radius: 289,
  };
}

world.addEffect(forceFor(kind));

const sequence = new Sequence(gm, world)
  .addAnimationSteps([
    { word: "glyph", duration: 1.15 },
    { word: "matter", duration: 1.15, inBetween: "dissolve" },
  ])
  .play();

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  sequence.tick(dt);
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: a.sampling.fontSize,
    originX,
  });
  setPointerView(view);
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
