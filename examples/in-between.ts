/**
 * Dissolve as the in-between: the word loosens into gas, then retargets
 * and forms the next word. Same phase timings as the workbench.
 *
 * The camera is locked to the union of both words. Framing `homeBounds()`
 * would snap to the target at `morphTo`, which looks like particles
 * vanishing and new ones popping in.
 */
import { GlyphMatter, World, drawParticles, makeView } from "../src/lib/index.ts";
import { FONT_URL, loop, sizeCanvas, unionBounds } from "./shared.ts";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/in-between.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const REST = 1;
const FLOOR = 0.04;
const GAS = 0.3;
const DROP_T = 0.28;
const DISSOLVE_T = 0.75;
const TRAVEL_T = 0.85;
const FORM_T = 0.9;
const HOLD_T = 0.65;

function ease(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

function easeOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return 1 - (1 - x) ** 3;
}

function dissolveLegibility(elapsed: number): number {
  const u = Math.min(1, elapsed / DROP_T);
  return REST + (FLOOR - REST) * easeOut(u);
}

const matter = new GlyphMatter({ samplingMode: "both", fontSize: 140, fillSpacing: 5 });
await matter.sampleFromFont(FONT_URL, "glyph");
const from = matter.getPack();
if (!from) throw new Error("sampling failed");
const packs = [from, matter.samplePack("matter")] as const;

const world = new World().load(packs[0]).configure({
  stiffness: 22,
  damping: 6,
  gas: 90,
  legibility: REST,
});

const originX = packs[0].bounds.x + packs[0].bounds.w / 2;
const viewBounds = unionBounds(
  packs[0].bounds,
  packs[1].bounds,
  packs[0].sampling.fontSize * 0.4,
);
/** Next pack to morph into. Flip only after a word has formed. */
let toward = 1;
let phase: "dissolve" | "travel" | "form" | "hold" = "hold";
let elapsed = 0;

function beginDissolve(): void {
  phase = "dissolve";
  elapsed = 0.12;
  world.reclaim();
  world.scatter(95);
  world.configure({ legibility: dissolveLegibility(elapsed) });
}

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  elapsed += dt;

  if (phase === "hold" && elapsed >= HOLD_T) {
    beginDissolve();
  } else if (phase === "dissolve") {
    world.configure({ legibility: dissolveLegibility(elapsed) });
    if (elapsed >= DISSOLVE_T) {
      world.morphTo(packs[toward], "origin");
      phase = "travel";
      elapsed = 0;
      world.configure({ legibility: GAS });
    }
  } else if (phase === "travel") {
    world.configure({ legibility: GAS });
    if (elapsed >= TRAVEL_T) {
      phase = "form";
      elapsed = 0;
    }
  } else if (phase === "form") {
    const u = Math.min(1, elapsed / FORM_T);
    world.configure({
      legibility: GAS + (REST - GAS) * ease(u),
    });
    if (u >= 1) {
      phase = "hold";
      elapsed = 0;
      toward = 1 - toward;
      world.configure({ legibility: REST });
    }
  }

  world.step(dt);
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: packs[0].sampling.fontSize,
    originX,
  });
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
