/**
 * glyph → sunset (image contours) → matter → book (image contours).
 */
import {
  GlyphMatter,
  Sequence,
  World,
  drawParticles,
  makeView,
  placePack,
  sampleImage,
  scalePack,
} from "../src/lib/index.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas, unionAll } from "./shared.ts";
import { mountSiteNav } from "./nav.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/image.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, "glyph");
const glyph = gm.samplePack("glyph");
const matter = gm.samplePack("matter");
const mid = {
  x: glyph.bounds.x + glyph.bounds.w / 2,
  y: glyph.bounds.y + glyph.bounds.h / 2,
};
const imageH = Math.max(glyph.bounds.h, matter.bounds.h) * 2.2;

function fitImage(pack: typeof glyph) {
  const s = imageH / Math.max(pack.bounds.h, 1);
  return placePack(scalePack(pack, s), mid.x, mid.y);
}

const sunset = fitImage(
  await sampleImage(`${import.meta.env.BASE_URL}images/sunset.png`, {
    label: "sunset",
    samplingMode: "both",
    width: 720,
    contourSpacing: 1.4,
    fillSpacing: 4.5,
    edgeThreshold: 0.1,
    maxPoints: 20000,
  }),
);
const book = fitImage(
  await sampleImage(`${import.meta.env.BASE_URL}images/book.png`, {
    label: "book",
    samplingMode: "both",
    width: 720,
    contourSpacing: 1.4,
    fillSpacing: 4.5,
    edgeThreshold: 0.1,
    maxPoints: 20000,
  }),
);

const viewBounds = unionAll(
  [glyph.bounds, sunset.bounds, matter.bounds, book.bounds],
  glyph.sampling.fontSize * 0.35,
);
const originX = glyph.bounds.x + glyph.bounds.w / 2;

const world = new World().configure({
  stiffness: 24,
  damping: 7,
  gas: 90,
  legibility: 0.82,
});

const sequence = new Sequence(gm, world)
  .addAnimationSteps([
    { word: "glyph", duration: 1.15, legibility: 0.82 },
    { pack: sunset, duration: 2.2, inBetween: "dissolve", legibility: 0.82 },
    { word: "matter", duration: 1.15, inBetween: "dissolve", legibility: 0.82 },
    { pack: book, duration: 2.2, inBetween: "dissolve", legibility: 0.82 },
  ])
  .play();

const setPointerView = followPointer(canvas, world);

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  sequence.tick(dt);
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: glyph.sampling.fontSize,
    originX,
  });
  setPointerView(view);
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.2,
  });
});
