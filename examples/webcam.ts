/**
 * glyph → webcam still → matter → webcam still, like the image sketch.
 * Each time the sequence enters a camera step, one mirrored frame is sampled
 * (not a live feed). The mic drives wind (no filter, analyser-only).
 */
import {
  GlyphMatter,
  Sequence,
  World,
  drawParticles,
  makeView,
  placePack,
  sampleImageFromRgba,
  scalePack,
  windFromAnalyser,
  type AnimationStep,
  type ImageSampleOptions,
  type SamplePack,
} from "../src/lib/index.ts";
import { FONT_URL, SAMPLE, followPointer, loop, sizeCanvas, unionAll } from "./shared.ts";
import { mountSiteNav } from "./nav.ts";

mountSiteNav();

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("examples/webcam.html is missing <canvas>");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");
const startBtn = document.querySelector<HTMLButtonElement>(".start");
const stopBtn = document.querySelector<HTMLButtonElement>(".stop");
const transport = document.querySelector(".transport");
const meter = document.querySelector<HTMLElement>(".meter");
const meterBar = document.querySelector<HTMLElement>(".meter-bar");

const CAM_SAMPLE: ImageSampleOptions = {
  label: "webcam",
  samplingMode: "both",
  width: 560,
  contourSpacing: 1.4,
  fillSpacing: 4.5,
  edgeThreshold: 0.1,
  maxPoints: 12000,
};

const gm = new GlyphMatter(SAMPLE);
await gm.sampleFromFont(FONT_URL, "glyph");
const glyph = gm.samplePack("glyph");
const matter = gm.samplePack("matter");
const mid = {
  x: glyph.bounds.x + glyph.bounds.w / 2,
  y: glyph.bounds.y + glyph.bounds.h / 2,
};
const imageH = Math.max(glyph.bounds.h, matter.bounds.h) * 2.2;
const camBox = {
  x: mid.x - imageH * 0.9,
  y: mid.y - imageH * 0.55,
  w: imageH * 1.8,
  h: imageH * 1.1,
};
const viewBounds = unionAll(
  [glyph.bounds, matter.bounds, camBox],
  glyph.sampling.fontSize * 0.35,
);
const originX = glyph.bounds.x + glyph.bounds.w / 2;

const world = new World().configure({
  stiffness: 22,
  damping: 7,
  gas: 90,
  legibility: 0.82,
});
world.load(glyph);
const setPointerView = followPointer(canvas, world);

const video = document.createElement("video");
video.playsInline = true;
video.muted = true;
video.autoplay = true;

const scratch = document.createElement("canvas");
const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
if (!scratchCtx) throw new Error("2d context unavailable");
const cam2d: CanvasRenderingContext2D = scratchCtx;

let stream: MediaStream | null = null;
let ctxAudio: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let wave: Uint8Array<ArrayBuffer> | null = null;
let sequence: Sequence | null = null;
let camSteps: AnimationStep[] = [];
let live = false;
let meterLevel = 0;
let destPrimed = false;

function fitCam(pack: SamplePack): SamplePack {
  const s = imageH / Math.max(pack.bounds.h, 1);
  return placePack(scalePack(pack, s), mid.x, mid.y);
}

function grabFrame(): SamplePack | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w < 8 || h < 8) return null;
  scratch.width = w;
  scratch.height = h;
  cam2d.save();
  cam2d.translate(w, 0);
  cam2d.scale(-1, 1);
  cam2d.drawImage(video, 0, 0);
  cam2d.restore();
  const { data } = cam2d.getImageData(0, 0, w, h);
  const raw = sampleImageFromRgba(w, h, data, CAM_SAMPLE);
  if (raw.points.length < 24) return null;
  return fitCam(raw);
}

function showPlaying(playing: boolean): void {
  live = playing;
  startBtn?.toggleAttribute("hidden", playing);
  transport?.toggleAttribute("hidden", !playing);
  if (!playing) setMeter(0);
}

function setMeter(level: number): void {
  const u = Math.min(1, Math.max(0, level));
  meterLevel = u;
  if (meterBar) meterBar.style.transform = `scaleX(${u})`;
  meter?.setAttribute("aria-valuenow", String(Math.round(u * 100)));
}

function micLevel(): number {
  if (!analyser || !wave) return 0;
  analyser.getByteTimeDomainData(wave);
  let sum = 0;
  for (let i = 0; i < wave.length; i++) {
    const v = (wave[i]! - 128) / 128;
    sum += v * v;
  }
  const rms = Math.min(1, Math.sqrt(sum / wave.length) * 4.2);
  return meterLevel + (rms - meterLevel) * 0.38;
}

async function waitForVideo(): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    if (video.videoWidth >= 8 && video.videoHeight >= 8) return;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  throw new Error("camera produced no frames");
}

/** One still per visit to a camera step, taken while dissolving toward it. */
function snapCamIfNeeded(): void {
  const show = sequence;
  const step = show?.currentStep();
  if (!show || !step || !camSteps.includes(step)) {
    destPrimed = false;
    return;
  }
  if (show.phase !== "dissolve") return;
  if (destPrimed) return;
  const next = grabFrame();
  if (next) step.pack = next;
  destPrimed = true;
}

async function start(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("camera and mic need a secure context");
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  video.srcObject = stream;
  await video.play();
  await waitForVideo();
  await new Promise((resolve) => setTimeout(resolve, 180));

  if (!ctxAudio) ctxAudio = new AudioContext();
  if (ctxAudio.state === "suspended") await ctxAudio.resume();
  source?.disconnect();
  source = ctxAudio.createMediaStreamSource(stream);
  if (!analyser) {
    analyser = ctxAudio.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    bins = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
  }
  source.connect(analyser);

  const first = grabFrame();
  if (!first) throw new Error("could not sample the camera");
  const camA: AnimationStep = {
    pack: first,
    duration: 2.4,
    inBetween: "dissolve",
    legibility: 0.82,
  };
  const camB: AnimationStep = {
    pack: first,
    duration: 2.4,
    inBetween: "dissolve",
    legibility: 0.82,
  };
  camSteps = [camA, camB];
  destPrimed = false;
  sequence = new Sequence(gm, world)
    .addAnimationSteps([
      { word: "glyph", duration: 1.15, legibility: 0.82 },
      camA,
      { word: "matter", duration: 1.15, inBetween: "dissolve", legibility: 0.82 },
      camB,
    ])
    .play();
  showPlaying(true);
}

function stop(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  source?.disconnect();
  source = null;
  void ctxAudio?.suspend();
  sequence?.reset();
  sequence = null;
  camSteps = [];
  destPrimed = false;
  world.clearEffects();
  world.load(glyph);
  world.configure({ legibility: 0.82 });
  showPlaying(false);
}

startBtn?.addEventListener("click", () => {
  void start().catch((err) => {
    stop();
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.textContent = err instanceof Error ? err.message : String(err);
    }
  });
});

stopBtn?.addEventListener("click", stop);

loop((dt) => {
  const dpr = sizeCanvas(canvas);
  if (live && analyser && bins) {
    world.setEffects([windFromAnalyser(analyser, bins)]);
    setMeter(micLevel());
  }
  if (live) snapCamIfNeeded();
  if (sequence) sequence.tick(dt);
  else world.step(dt);
  const view = makeView(viewBounds, canvas.width, canvas.height, {
    fit: "contain",
    dpr,
    baseline: 0,
    em: glyph.sampling.fontSize,
    originX,
  });
  setPointerView(view);
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1c1b19",
    fillColor: "#7a756c",
    pointRadius: 1.2,
  });
});
