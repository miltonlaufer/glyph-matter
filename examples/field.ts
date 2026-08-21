/**
 * Field: a sampled word as springy matter. Move the pointer to push ink;
 * click to scatter.
 */
import { GlyphMatter, World, drawParticles, makeView } from "../src/lib/index.ts";
import { mountSiteNav } from "./nav.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas } from "./shared.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/field.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const matter = new GlyphMatter(SAMPLE);
const world = new World().configure({ legibility: 0.85, gas: 40 });

await matter.sampleFromFont(FONT_URL, "glyph");
const pack = matter.getPack();
if (!pack) throw new Error("sampling failed");
world.load(pack);

const setPointerView = followPointer(canvas, world);

canvas.addEventListener("click", () => {
  world.scatter(520);
});

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  world.step(dt);
  const view = makeView(world.homeBounds(), canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: pack.sampling.fontSize,
  });
  setPointerView(view);
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
