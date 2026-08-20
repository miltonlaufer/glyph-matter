/**
 * Field: a sampled word as springy matter. Move the pointer to push ink;
 * click to scatter.
 */
import { GlyphMatter, World, drawParticles, makeView, screenToWorld } from "../src/lib/index.ts";
import { FONT_URL, loop, sizeCanvas } from "./shared.ts";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/field.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const matter = new GlyphMatter({ samplingMode: "both", fontSize: 140, fillSpacing: 5 });
const world = new World().configure({ legibility: 0.85, gas: 40 });

await matter.sampleFromFont(FONT_URL, "glyph");
const pack = matter.getPack();
if (!pack) throw new Error("sampling failed");
world.load(pack);

canvas.addEventListener("pointermove", (event) => {
  const dpr = sizeCanvas(canvas);
  const view = makeView(world.homeBounds(), canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: pack.sampling.fontSize,
  });
  const p = screenToWorld(event.offsetX, event.offsetY, view);
  world.pointer = { x: p.x, y: p.y, down: event.buttons > 0 };
});

canvas.addEventListener("pointerleave", () => {
  world.pointer = null;
});

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
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
