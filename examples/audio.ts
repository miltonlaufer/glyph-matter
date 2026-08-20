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
const transport = document.querySelector(".transport");
const lowpassToggle = document.querySelector<HTMLInputElement>(".lowpass input");
const cutoffSlider = document.querySelector<HTMLInputElement>(".cutoff input");
const cutoffVal = document.querySelector(".cutoff-val");

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
let source: MediaElementAudioSourceNode | null = null;
let lowpass: BiquadFilterNode | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let live = false;

function showPlaying(playing: boolean): void {
  live = playing;
  startBtn?.toggleAttribute("hidden", playing);
  transport?.toggleAttribute("hidden", !playing);
}

const CUTOFF_MIN = 80;
const CUTOFF_MAX = 8000;

function cutoffHz(): number {
  const t = Number(cutoffSlider?.value ?? 30) / 100;
  return Math.round(CUTOFF_MIN * (CUTOFF_MAX / CUTOFF_MIN) ** t);
}

function applyCutoff(): void {
  const hz = cutoffHz();
  const on = Boolean(lowpassToggle?.checked);
  if (cutoffVal) cutoffVal.textContent = on ? `${hz} Hz` : "off";
  if (lowpass) lowpass.frequency.value = hz;
}

function setLowpassEnabled(on: boolean): void {
  if (cutoffSlider) cutoffSlider.disabled = !on;
  applyCutoff();
  wireAnalyser(on);
}

/** Analyser path only. Playback stays a dry tap from the source. */
function wireAnalyser(useLowpass: boolean): void {
  if (!ctxAudio || !source || !analyser || !lowpass) return;
  source.disconnect();
  lowpass.disconnect();
  source.connect(ctxAudio.destination);
  if (useLowpass) {
    applyCutoff();
    source.connect(lowpass);
    lowpass.connect(analyser);
  } else {
    source.connect(analyser);
  }
}

async function start(): Promise<void> {
  if (!ctxAudio) ctxAudio = new AudioContext();
  if (ctxAudio.state === "suspended") await ctxAudio.resume();
  if (!analyser) {
    source = ctxAudio.createMediaElementSource(audio);
    lowpass = ctxAudio.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.Q.value = 0.7;
    applyCutoff();
    analyser = ctxAudio.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;
    bins = new Uint8Array(analyser.frequencyBinCount);
  }
  setLowpassEnabled(lowpassToggle?.checked ?? false);
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
lowpassToggle?.addEventListener("change", () => {
  setLowpassEnabled(lowpassToggle.checked);
});
cutoffSlider?.addEventListener("input", applyCutoff);
applyCutoff();

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
