/**
 * Word → word: shared letters keep their ink; extras fly into the shorter word.
 */
import { GlyphMatter, World, drawParticles, makeView } from "../src/lib/index.ts";
import { mountSiteNav } from "./nav.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas, unionBounds } from "./shared.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/morph.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const words = ["glyph", "matter"] as const;
const matter = new GlyphMatter(SAMPLE);
await matter.sampleFromFont(FONT_URL, words[0]);
const from = matter.getPack();
if (!from) throw new Error("sampling failed");
const packs = [from, matter.samplePack(words[1])] as const;
const world = new World().load(packs[0]);
world.configure({ stiffness: 22, damping: 6 });
const setPointerView = followPointer(canvas, world);

let index = 0;
let hold = 0;
const originX = packs[0].bounds.x + packs[0].bounds.w / 2;
const viewBounds = unionBounds(
  packs[0].bounds,
  packs[1].bounds,
  packs[0].sampling.fontSize * 0.4,
);

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  world.step(dt);
  hold += dt;
  if (hold > 2.4 && world.meanHomeDistance() < 4) {
    index = 1 - index;
    world.morphTo(packs[index], "origin");
    hold = 0;
  }
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: packs[0].sampling.fontSize,
    originX,
  });
  setPointerView(view);
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
