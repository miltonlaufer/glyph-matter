/**
 * Sequence + effects: timed words, dissolve in-between, a little wind.
 * Direct World.step / morphTo still work if you skip Sequence.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  drawParticles,
  makeView,
} from "../src/lib/index.ts";
import { mountSiteNav } from "./nav.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas, unionBounds } from "./shared.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/sequence.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, "glyph");
const world = new World().configure({ stiffness: 22, damping: 6, gas: 90 });
const a = gm.samplePack("glyph");
const b = gm.samplePack("matter");
const viewBounds = unionBounds(a.bounds, b.bounds, a.sampling.fontSize * 0.5);
const originX = a.bounds.x + a.bounds.w / 2;
const mid = { x: originX, y: a.bounds.y + a.bounds.h / 2 };

const show = new Sequence(gm, world)
  .addAnimationStep({ word: "glyph", duration: 1.1, effects: [] })
  .addAnimationSteps([
    {
      word: "matter",
      duration: 1.2,
      effects: [{ kind: "wind", vx: 55, vy: -8, gust: 40 }],
    },
    {
      word: "glyph",
      duration: 1.1,
      effects: [{ kind: "attract", x: mid.x, y: mid.y, strength: 110, radius: 480 }],
    },
  ])
  .play();

const setPointerView = followPointer(canvas, world);

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  show.tick(dt);
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
