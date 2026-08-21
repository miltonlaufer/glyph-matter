/**
 * Two words at once, traveling into a shared point, becoming a third.
 * Default: signified (up) + signifier (down) → sign. Collision force is a vortex;
 * override with ?effect=attract|repel|vortex and ?up=&down=&into=.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  collideVortex,
  drawParticles,
  makeView,
  type ParticleEffect,
} from "../src/lib/index.ts";
import { mountSiteNav } from "./nav.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas, unionAll } from "./shared.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/collide.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

type HitKind = "vortex" | "attract" | "repel";

const CONFIG = {
  up: "signified",
  down: "signifier",
  into: "sign",
  effect: "vortex" as HitKind,
};

function query(name: string, fallback: string): string {
  const v = new URLSearchParams(location.search).get(name);
  return v && v.trim() ? v.trim() : fallback;
}

function hitKind(raw: string): HitKind {
  if (raw === "attract" || raw === "repel" || raw === "vortex") return raw;
  return "vortex";
}

const up = query("up", CONFIG.up);
const down = query("down", CONFIG.down);
const into = query("into", CONFIG.into);
const effectKind = hitKind(query("effect", document.body.dataset.effect ?? CONFIG.effect));

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, up);
const em = gm.fontSize;
const cx = 0;
const cy = 0;

function collisionEffect(kind: HitKind): ParticleEffect {
  if (kind === "attract") {
    return { kind: "attract", x: cx, y: cy, strength: 240, radius: em * 1.85 };
  }
  if (kind === "repel") {
    return { kind: "repel", x: cx, y: cy, strength: 190, radius: em * 1.55 };
  }
  return collideVortex(cx, cy, em);
}

const world = new World().configure({
  stiffness: 34,
  damping: 10,
  gas: 90,
  legibility: 1,
});

const sequence = new Sequence(gm, world, { formT: 1.2, travelT: 0.7 })
  .collide({
    up,
    down,
    into,
    x: cx,
    y: cy,
    effect: collisionEffect(effectKind),
  })
  .play();

const viewBounds = unionAll(
  sequence.steps.map((step) => step.pack?.bounds).filter((b) => b != null),
  em * 0.55,
);

const setPointerView = followPointer(canvas, world);

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  sequence.tick(dt);
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em,
    originX: cx,
  });
  setPointerView(view);
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
