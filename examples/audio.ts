/**
 * glyph → matter → dancing, with wind from the playing audio.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  drawParticles,
  makeView,
  windFromAnalyser,
} from "../src/lib/index.ts";
import { FONT_URL, SAMPLE, loop, sizeCanvas, unionBounds } from "./shared.ts";
import { mountSiteNav } from "./nav.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/audio.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");
const startBtn = document.querySelector<HTMLButtonElement>(".start");
const stopBtn = document.querySelector<HTMLButtonElement>(".stop");

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, "glyph");
const a = gm.samplePack("glyph");
const b = gm.samplePack("matter");
const c = gm.samplePack("dancing");
const viewBounds = unionBounds(
  unionBounds(a.bounds, b.bounds),
  c.bounds,
  a.sampling.fontSize * 0.45,
);
const originX = a.bounds.x + a.bounds.w / 2;

const world = new World().configure({
  stiffness: 22,
  damping: 6,
  gas: 90,
  legibility: 0.92,
});

const sequence = new Sequence(gm, world).addAnimationSteps([
  { word: "glyph", duration: 5.2 },
  { word: "matter", duration: 5.2, inBetween: "dissolve" },
  { word: "dancing", duration: 5.6, inBetween: "dissolve" },
]);

const audio = new Audio(`${import.meta.env.BASE_URL}audio/Terminal_Hours.mp3`);
audio.loop = true;
audio.crossOrigin = "anonymous";

let ctxAudio: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let live = false;

function showPlaying(playing: boolean): void {
  live = playing;
  startBtn?.toggleAttribute("hidden", playing);
  stopBtn?.toggleAttribute("hidden", !playing);
}

async function start(): Promise<void> {
  if (!ctxAudio) ctxAudio = new AudioContext();
  if (ctxAudio.state === "suspended") await ctxAudio.resume();
  if (!analyser) {
    const source = ctxAudio.createMediaElementSource(audio);
    analyser = ctxAudio.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    bins = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    analyser.connect(ctxAudio.destination);
  }
  await audio.play();
  sequence.play();
  showPlaying(true);
}

function stop(): void {
  audio.pause();
  audio.currentTime = 0;
  sequence.reset();
  world.clearEffects();
  void ctxAudio?.suspend();
  showPlaying(false);
}

startBtn?.addEventListener("click", () => {
  void start().catch((err) => {
    if (startBtn) startBtn.textContent = err instanceof Error ? err.message : String(err);
  });
});

stopBtn?.addEventListener("click", stop);

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  if (live && analyser && bins) {
    world.setEffects([windFromAnalyser(analyser, bins)]);
  }
  sequence.tick(dt);
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: a.sampling.fontSize,
    originX,
  });
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.35,
  });
});
