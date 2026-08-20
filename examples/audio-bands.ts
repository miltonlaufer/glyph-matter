/**
 * glyph → matter → dancing.
 * Bass (20–280 Hz) drives a vortex below the word; treble (2–8 kHz)
 * drives wind with a fixed traveling-wave rate.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  bandEnergy,
  drawParticles,
  makeView,
} from "../src/lib/index.ts";
import { FONT_URL, SAMPLE, loop, sizeCanvas, unionBounds } from "./shared.ts";
import { mountSiteNav } from "./nav.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/audio-bands.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");
const startBtn = document.querySelector<HTMLButtonElement>(".start");
const stopBtn = document.querySelector<HTMLButtonElement>(".stop");
const transport = document.querySelector(".transport");

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, "glyph");
const a = gm.samplePack("glyph");
const b = gm.samplePack("matter");
const c = gm.samplePack("dancing");
const viewBounds = unionBounds(
  unionBounds(a.bounds, b.bounds),
  c.bounds,
  a.sampling.fontSize * 0.55,
);
const originX = a.bounds.x + a.bounds.w / 2;

const world = new World().configure({
  stiffness: 28,
  damping: 6,
  gas: 90,
  legibility: 0.96,
});

const sequence = new Sequence(gm, world).addAnimationSteps([
  { word: "glyph", duration: 5.2, legibility: 0.96 },
  { word: "matter", duration: 5.2, inBetween: "dissolve", legibility: 0.96 },
  { word: "dancing", duration: 5.6, inBetween: "dissolve", legibility: 0.96 },
]);

const audio = new Audio(`${import.meta.env.BASE_URL}audio/Terminal_Hours.mp3`);
audio.loop = true;
audio.crossOrigin = "anonymous";

let ctxAudio: AudioContext | null = null;
let source: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let live = false;

function showPlaying(playing: boolean): void {
  live = playing;
  startBtn?.toggleAttribute("hidden", playing);
  transport?.toggleAttribute("hidden", !playing);
}

async function start(): Promise<void> {
  if (!ctxAudio) ctxAudio = new AudioContext();
  if (ctxAudio.state === "suspended") await ctxAudio.resume();
  if (!analyser) {
    source = ctxAudio.createMediaElementSource(audio);
    analyser = ctxAudio.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.65;
    bins = new Uint8Array(analyser.frequencyBinCount);
    source.connect(ctxAudio.destination);
    source.connect(analyser);
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

/** Same traveling gust audio-bands used before analyser lock existed. */
const TREBLE = 0.72;
const WIND_SCALE = 0.62;

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  if (live && analyser && bins) {
    analyser.getByteFrequencyData(bins);
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const low = bandEnergy(bins, binHz, 20, 280);
    const high = bandEnergy(bins, binHz, 2000, 8000);
    const box = world.homeBounds();
    world.setEffects([
      {
        kind: "wind",
        vx: (30 + high * 320) * WIND_SCALE,
        vy: (TREBLE - 0.35) * 90 * WIND_SCALE,
        gust: (8 + high * 140) * WIND_SCALE,
        period: 0.28 + (1 - TREBLE) * 1.6,
        wavelength: 70 + TREBLE * 560,
      },
      {
        kind: "vortex",
        x: box.x + box.w / 2,
        y: box.y + box.h / 2 + a.sampling.fontSize * 0.65,
        strength: low * low * 180,
        radius: a.sampling.fontSize * 0.9,
      },
    ]);
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
