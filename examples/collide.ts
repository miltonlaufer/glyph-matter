/**
 * Two words at once, traveling into a shared point, becoming a third.
 * Default: signified (up) + signifier (down) → sign. Collision force is a vortex;
 * override with ?effect=attract|repel|vortex and ?up=&down=&into=.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  drawParticles,
  makeView,
  mergePacks,
  placePack,
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
  /** Vertical offset of the stacked words, in em. */
  gap: 0.95,
  /** How close they sit at the meeting point, in em. */
  meet: 0.12,
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
const rawUp = gm.exportSamples();
const rawDown = gm.samplePack(down);
const rawInto = gm.samplePack(into);

const cx = 0;
const cy = 0;
const placedUp = placePack(rawUp, cx, cy - em * CONFIG.gap);
const placedDown = placePack(rawDown, cx, cy + em * CONFIG.gap);
const pairApart = mergePacks(placedUp, placedDown);
const pairMeet = mergePacks(
  placePack(rawUp, cx, cy - em * CONFIG.meet),
  placePack(rawDown, cx, cy + em * CONFIG.meet),
);
const result = placePack(rawInto, cx, cy);
const hit = { x: cx, y: cy };

function collisionEffect(kind: HitKind): ParticleEffect {
  const radius = em * 1.55;
  if (kind === "attract") {
    return { kind: "attract", x: hit.x, y: hit.y, strength: 240, radius: em * 1.85 };
  }
  if (kind === "repel") {
    return { kind: "repel", x: hit.x, y: hit.y, strength: 190, radius };
  }
  return { kind: "vortex", x: hit.x, y: hit.y, strength: 420, radius: em * 1.4 };
}

const smash = collisionEffect(effectKind);
const viewBounds = unionAll(
  [pairApart.bounds, pairMeet.bounds, result.bounds],
  em * 0.55,
);

const world = new World().configure({
  stiffness: 34,
  damping: 10,
  gas: 90,
  legibility: 1,
});

const sequence = new Sequence(gm, world, { formT: 1.2, travelT: 0.7 })
  .addAnimationSteps([
    {
      pack: pairApart,
      duration: 1.55,
      stiffness: 34,
      damping: 10,
      legibility: 1,
      effects: [],
    },
    {
      pack: pairMeet,
      duration: 1.4,
      inBetween: "spring",
      stiffness: 22,
      damping: 7,
      legibility: 0.88,
      effects: [smash],
    },
    {
      pack: result,
      duration: 2.8,
      inBetween: "dissolve",
      stiffness: 52,
      damping: 14,
      gas: 40,
      legibility: 1,
      effects: [],
    },
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
