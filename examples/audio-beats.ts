/**
 * glyph → matter → dancing.
 * Kick onsets punch the traveling gust and set its period (beat gap).
 * Bass energy drives the vortex; hat/snare onsets add to the gust.
 */
import {
  GlyphMatter,
  Sequence,
  World,
  bandEnergy,
  bandFlux,
  createOnsetPicker,
  createTempoFollow,
  drawParticles,
  followTempo,
  makeView,
  pickOnset,
} from "../src/lib/index.ts";
import { FONT_URL, SAMPLE, loop, sizeCanvas, unionBounds } from "./shared.ts";
import { mountSiteNav } from "./nav.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/audio-beats.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");
const startBtn = document.querySelector<HTMLButtonElement>(".start");
const stopBtn = document.querySelector<HTMLButtonElement>(".stop");
const transport = document.querySelector(".transport");
const readout = {
  kick: document.querySelector<HTMLElement>('[data-k="kick"]'),
  hats: document.querySelector<HTMLElement>('[data-k="hats"]'),
  gust: document.querySelector<HTMLElement>('[data-k="gust"]'),
  bass: document.querySelector<HTMLElement>('[data-k="bass"]'),
  period: document.querySelector<HTMLElement>('[data-k="period"]'),
};
const readoutBar = {
  kick: document.querySelector<HTMLElement>('[data-bar="kick"]'),
  hats: document.querySelector<HTMLElement>('[data-bar="hats"]'),
  gust: document.querySelector<HTMLElement>('[data-bar="gust"]'),
  bass: document.querySelector<HTMLElement>('[data-bar="bass"]'),
  period: document.querySelector<HTMLElement>('[data-bar="period"]'),
};

function setReadout(key: keyof typeof readout, label: string, unit01: number): void {
  const val = readout[key];
  const bar = readoutBar[key];
  if (val) val.textContent = label;
  if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, unit01))})`;
}

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
  stiffness: 52,
  damping: 11,
  gas: 40,
  legibility: 0.99,
});

const sequence = new Sequence(gm, world).addAnimationSteps([
  { word: "glyph", duration: 5.2, stiffness: 52, legibility: 0.99 },
  { word: "matter", duration: 5.2, inBetween: "dissolve", stiffness: 52, legibility: 0.99 },
  { word: "dancing", duration: 5.6, inBetween: "dissolve", stiffness: 52, legibility: 0.99 },
]);

const audio = new Audio(`${import.meta.env.BASE_URL}audio/Terminal_Hours.mp3`);
audio.loop = true;
audio.crossOrigin = "anonymous";

let ctxAudio: AudioContext | null = null;
let source: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let prev: Uint8Array<ArrayBuffer> | null = null;
let primed = false;
let live = false;
let clock = 0;
let kickEnv = 0;
let hatEnv = 0;
let kickPick = createOnsetPicker();
let hatPick = createOnsetPicker();
let snarePick = createOnsetPicker();
let tempo = createTempoFollow(0.72);

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
    analyser.smoothingTimeConstant = 0.22;
    bins = new Uint8Array(analyser.frequencyBinCount);
    prev = new Uint8Array(analyser.frequencyBinCount);
    source.connect(ctxAudio.destination);
    source.connect(analyser);
  }
  primed = false;
  clock = 0;
  kickEnv = 0;
  hatEnv = 0;
  kickPick = createOnsetPicker();
  hatPick = createOnsetPicker();
  snarePick = createOnsetPicker();
  tempo = createTempoFollow(0.72);
  await audio.play();
  sequence.play();
  showPlaying(true);
}

function stop(): void {
  audio.pause();
  audio.currentTime = 0;
  sequence.reset();
  world.clearEffects();
  primed = false;
  kickEnv = 0;
  hatEnv = 0;
  tempo = createTempoFollow(0.72);
  void ctxAudio?.suspend();
  showPlaying(false);
}

startBtn?.addEventListener("click", () => {
  void start().catch((err) => {
    if (startBtn) startBtn.textContent = err instanceof Error ? err.message : String(err);
  });
});

stopBtn?.addEventListener("click", stop);

const TREBLE = 0.72;

function hold(env: number, hit: number, dt: number, tau: number): number {
  return Math.max(hit, env * Math.exp(-dt / tau));
}

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  if (live && analyser && bins && prev) {
    clock += dt;
    analyser.getByteFrequencyData(bins);
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    if (primed) {
      const kickHit = pickOnset(bandFlux(bins, prev, binHz, 35, 140), kickPick, clock, {
        refractory: 0.14,
        k: 1.55,
        floor: 0.02,
        history: 28,
      });
      const snareHit = pickOnset(bandFlux(bins, prev, binHz, 150, 400), snarePick, clock, {
        refractory: 0.11,
      });
      const hatHit = pickOnset(bandFlux(bins, prev, binHz, 6000, 12000), hatPick, clock, {
        refractory: 0.05,
        k: 1.55,
      });
      kickEnv = hold(kickEnv, kickHit, dt, 0.2);
      hatEnv = hold(hatEnv, Math.max(hatHit, snareHit * 0.75), dt, 0.1);
      const period = followTempo(tempo, kickHit > 0, clock);
      const beat = Math.min(1, kickEnv * 0.7 + hatEnv * 0.4);
      const bass = bandEnergy(bins, binHz, 20, 280);
      setReadout("kick", kickEnv.toFixed(2), kickEnv);
      setReadout("hats", hatEnv.toFixed(2), hatEnv);
      setReadout("gust", beat.toFixed(2), beat);
      setReadout("bass", bass.toFixed(2), bass);
      setReadout(
        "period",
        `${period.toFixed(2)}s ${Math.round(60 / Math.max(period, 0.01))}bpm`,
        (period - 0.32) / (1.6 - 0.32),
      );
      const box = world.homeBounds();
      world.setEffects([
        {
          kind: "wind",
          vx: 20 + beat * 260,
          vy: (TREBLE - 0.35) * 70,
          gust: 8 + beat * 110,
          period,
          wavelength: 80 + period * 380,
        },
        {
          kind: "vortex",
          x: box.x + box.w / 2,
          y: box.y + box.h / 2 + a.sampling.fontSize * 0.65,
          strength: bass * bass * 180,
          radius: a.sampling.fontSize * 0.9,
        },
      ]);
    } else {
      primed = true;
    }
    prev.set(bins);
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
