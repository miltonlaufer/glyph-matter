import {
  GlyphMatter,
  World,
  createTestFont,
  drawParticles,
  makeView,
  screenToWorld,
} from "../lib/index.ts";
import type { SamplePack, SamplingMode, View } from "../lib/index.ts";

function must<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`Demo DOM is missing ${name}`);
  return value;
}

function debounce(fn: () => void, ms: number): () => void {
  let handle = 0;
  return () => {
    window.clearTimeout(handle);
    handle = window.setTimeout(fn, ms);
  };
}

const canvas = must(document.querySelector<HTMLCanvasElement>("#stage"), "stage");
const textInput = must(document.querySelector<HTMLInputElement>("#text"), "text");
const modeSelect = must(document.querySelector<HTMLSelectElement>("#mode"), "mode");
const contourSpacing = must(
  document.querySelector<HTMLInputElement>("#contourSpacing"),
  "contourSpacing",
);
const fillSpacing = must(
  document.querySelector<HTMLInputElement>("#fillSpacing"),
  "fillSpacing",
);
const fontSize = must(document.querySelector<HTMLInputElement>("#fontSize"), "fontSize");
const contourSpacingVal = must(
  document.querySelector("#contourSpacingVal"),
  "contourSpacingVal",
);
const fillSpacingVal = must(document.querySelector("#fillSpacingVal"), "fillSpacingVal");
const fontSizeVal = must(document.querySelector("#fontSizeVal"), "fontSizeVal");
const legibility = must(document.querySelector<HTMLInputElement>("#legibility"), "legibility");
const gas = must(document.querySelector<HTMLInputElement>("#gas"), "gas");
const legibilityVal = must(document.querySelector("#legibilityVal"), "legibilityVal");
const gasVal = must(document.querySelector("#gasVal"), "gasVal");
const scatterBtn = must(document.querySelector<HTMLButtonElement>("#scatter"), "scatter");
const homeBtn = must(document.querySelector<HTMLButtonElement>("#home"), "home");
const animationSelect = must(
  document.querySelector<HTMLSelectElement>("#animation"),
  "animation",
);
const morphPanel = must(document.querySelector<HTMLElement>("#morph-panel"), "morph-panel");
const morphToInput = must(document.querySelector<HTMLInputElement>("#morphTo"), "morphTo");
const morphBtn = must(document.querySelector<HTMLButtonElement>("#morph"), "morph");
const morphLoop = must(document.querySelector<HTMLInputElement>("#morphLoop"), "morphLoop");
const morphDissolve = must(
  document.querySelector<HTMLInputElement>("#morphDissolve"),
  "morphDissolve",
);
const fontUrl = must(document.querySelector<HTMLInputElement>("#fontUrl"), "fontUrl");
const fontFile = must(document.querySelector<HTMLInputElement>("#fontFile"), "fontFile");
const statusEl = must(document.querySelector<HTMLParagraphElement>("#status"), "status");
const sampleFontBtn = must(
  document.querySelector<HTMLButtonElement>("#sampleFont"),
  "sampleFont",
);
const sampleTestBtn = must(
  document.querySelector<HTMLButtonElement>("#sampleTest"),
  "sampleTest",
);
const exportJsonBtn = must(
  document.querySelector<HTMLButtonElement>("#exportJson"),
  "exportJson",
);
const exportJsBtn = must(document.querySelector<HTMLButtonElement>("#exportJs"), "exportJs");
const loadPackInput = must(
  document.querySelector<HTMLInputElement>("#loadPack"),
  "loadPack",
);

const gm = new GlyphMatter();
const world = new World();
let sourceLabel = "none";
let view: View | null = null;
let morphPair: { a: SamplePack; b: SamplePack; toward: "a" | "b" } | null = null;
let morphShow: {
  phase: "dissolve" | "travel" | "form" | "hold";
  elapsed: number;
  restore: number;
  holdFor: number;
} | null = null;
const packCache = new Map<string, SamplePack>();
const ctx = must(canvas.getContext("2d"), "2d context");

function ease(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

function easeOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return 1 - (1 - x) ** 3;
}

const DISSOLVE_DROP_T = 0.28;
const DISSOLVE_T = 0.75;
const TRAVEL_T = 0.85;
const FORM_T = 0.9;
const HOLD_T = 0.65;
const REST_T = 0.18;
const DISSOLVE_FLOOR = 0.04;
const DISSOLVE_LEGIBILITY = 0.3;

function dissolveLegibility(elapsed: number, restore: number): number {
  const u = Math.min(1, elapsed / DISSOLVE_DROP_T);
  return restore + (DISSOLVE_FLOOR - restore) * easeOut(u);
}

function sliderLegibility(): number {
  return Number(legibility.value) / 100;
}

function applySettings(): void {
  contourSpacingVal.textContent = contourSpacing.value;
  fillSpacingVal.textContent = fillSpacing.value;
  fontSizeVal.textContent = fontSize.value;
  const legibilityN = sliderLegibility();
  legibilityVal.textContent = legibilityN.toFixed(2);
  gasVal.textContent = gas.value;
  gm.configure({
    samplingMode: modeSelect.value as SamplingMode,
    contourSpacing: Number(contourSpacing.value),
    fillSpacing: Number(fillSpacing.value),
    fontSize: Number(fontSize.value),
  });
  world.configure({
    gas: Number(gas.value),
    ...(morphShow ? {} : { legibility: legibilityN }),
  });
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function syncCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const pack = gm.getPack();
  const bounds = world.particles.length > 0 ? world.homeBounds() : pack?.bounds;
  const originX = morphPair
    ? morphPair.a.bounds.x + morphPair.a.bounds.w / 2
    : bounds
      ? bounds.x + bounds.w / 2
      : 0;
  view = bounds
    ? makeView(bounds, canvas.width, canvas.height, {
        fit: "actual",
        dpr,
        baseline: 0,
        em: world.fontSize,
        originX,
      })
    : null;
}

function paint(): void {
  syncCanvas();
  if (!view) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const pack = gm.getPack();
  drawParticles(ctx, world.particles, view, {
    pointRadius: (pack?.sampling.mode === "fill" ? 1.35 : 1.1) * view.dpr,
  });
}

function afterSample(origin: string): void {
  sourceLabel = origin;
  morphPair = null;
  morphShow = null;
  packCache.clear();
  const pack = gm.getPack();
  if (pack) world.load(pack);
  const n = pack?.points.length ?? 0;
  const glyphs = pack?.glyphs.length ?? 0;
  const sampled = pack?.text ?? "";
  setStatus(`${origin} · “${sampled}” · ${glyphs} glyphs · ${n} points`);
  requestAnimationFrame(() => warmMorphPacks());
}

function packCacheKey(text: string): string {
  return [
    text,
    modeSelect.value,
    contourSpacing.value,
    fillSpacing.value,
    fontSize.value,
  ].join("\0");
}

function packFor(text: string): SamplePack {
  const key = packCacheKey(text);
  const hit = packCache.get(key);
  if (hit) return hit;
  const current = gm.getPack();
  const pack =
    current &&
    current.text === text &&
    current.sampling.mode === modeSelect.value &&
    current.sampling.contourSpacing === Number(contourSpacing.value) &&
    current.sampling.fillSpacing === Number(fillSpacing.value) &&
    current.sampling.fontSize === Number(fontSize.value)
      ? gm.exportSamples()
      : gm.samplePack(text);
  packCache.set(key, pack);
  return pack;
}

function warmMorphPacks(): void {
  if (!gm.hasFont()) return;
  const fromText = textInput.value;
  const toText = morphToInput.value;
  if (fromText) packFor(fromText);
  if (toText) packFor(toText);
}

function applyMorph(pair: { a: SamplePack; b: SamplePack; toward: "a" | "b" }): void {
  const pack = pair.toward === "b" ? pair.b : pair.a;
  world.morphTo(pack, "origin");
  setStatus(`morph → “${pack.text}” · ${world.particles.length} points`);
}

function targetPack(pair: { a: SamplePack; b: SamplePack; toward: "a" | "b" }): SamplePack {
  return pair.toward === "b" ? pair.b : pair.a;
}

function beginDissolve(restore: number): void {
  const kick = 0.12;
  morphShow = {
    phase: "dissolve",
    elapsed: kick,
    restore,
    holdFor: REST_T,
  };
  world.configure({ legibility: dissolveLegibility(kick, restore) });
  world.reclaim();
  world.scatter(95);
  setStatus("dissolving…");
}

function startMorph(): void {
  if (!gm.hasFont()) {
    setStatus("need a live font to morph");
    return;
  }
  applySettings();
  const fromText = textInput.value;
  const toText = morphToInput.value;
  if (!toText) {
    setStatus("set a word to morph to");
    return;
  }
  const a = packFor(fromText);
  const b = packFor(toText);
  morphPair = { a, b, toward: "b" };
  const restore = sliderLegibility();
  if (morphDissolve.checked) {
    beginDissolve(restore);
  } else {
    applyMorph(morphPair);
    morphShow = {
      phase: "hold",
      elapsed: 0,
      restore,
      holdFor: HOLD_T,
    };
  }
}

function syncAnimationPanel(): void {
  morphPanel.hidden = animationSelect.value !== "morph";
  if (animationSelect.value !== "morph") {
    morphPair = null;
    morphShow = null;
    world.configure({ legibility: sliderLegibility() });
  } else {
    warmMorphPacks();
  }
}

function stepMorphShow(dt: number): void {
  if (!morphShow || !morphPair) return;
  morphShow.elapsed += dt;
  const { restore } = morphShow;

  if (morphShow.phase === "dissolve") {
    world.configure({
      legibility: dissolveLegibility(morphShow.elapsed, restore),
    });
    if (morphShow.elapsed >= DISSOLVE_T) {
      applyMorph(morphPair);
      morphShow.phase = "travel";
      morphShow.elapsed = 0;
    }
    return;
  }

  if (morphShow.phase === "travel") {
    world.configure({ legibility: DISSOLVE_LEGIBILITY });
    if (morphShow.elapsed >= TRAVEL_T) {
      morphShow.phase = "form";
      morphShow.elapsed = 0;
      const pack = targetPack(morphPair);
      setStatus(`forming “${pack.text}” · ${world.particles.length} points`);
    }
    return;
  }

  if (morphShow.phase === "form") {
    const u = Math.min(1, morphShow.elapsed / FORM_T);
    world.configure({
      legibility: DISSOLVE_LEGIBILITY + (restore - DISSOLVE_LEGIBILITY) * ease(u),
    });
    if (u >= 1) {
      morphShow.phase = "hold";
      morphShow.elapsed = 0;
      morphShow.holdFor = REST_T;
      world.configure({ legibility: restore });
      const pack = targetPack(morphPair);
      setStatus(`“${pack.text}” · ${world.particles.length} points`);
    }
    return;
  }

  world.configure({ legibility: restore });
  if (morphLoop.checked && morphShow.elapsed >= morphShow.holdFor) {
    morphPair.toward = morphPair.toward === "b" ? "a" : "b";
    if (morphDissolve.checked) {
      beginDissolve(restore);
    } else {
      applyMorph(morphPair);
      morphShow.elapsed = 0;
    }
    return;
  }
  if (!morphLoop.checked) morphShow = null;
}

function resampleLoadedFont(): void {
  applySettings();
  packCache.clear();
  if (!gm.hasFont()) {
    if (gm.getPack()) {
      setStatus(`${sourceLabel} · pack is frozen; sample from a font to resample`);
    }
    return;
  }
  gm.resample(textInput.value);
  afterSample(sourceLabel);
}

async function sampleFromUrl(): Promise<void> {
  applySettings();
  setStatus("fetching font…");
  try {
    await gm.sampleFromFont(fontUrl.value.trim(), textInput.value);
    afterSample(fontUrl.value.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`font failed: ${message}`);
  }
}

async function sampleFromTestFont(): Promise<void> {
  applySettings();
  await gm.sampleFromFont(createTestFont(), textInput.value);
  afterSample("test font (geometric, few letters)");
}

function download(filename: string, body: string, type: string): void {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pointerWorld(event: PointerEvent) {
  if (!view) return null;
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(event.clientX - rect.left, event.clientY - rect.top, view);
}

sampleFontBtn.addEventListener("click", () => {
  void sampleFromUrl();
});
sampleTestBtn.addEventListener("click", () => {
  void sampleFromTestFont();
});
scatterBtn.addEventListener("click", () => {
  world.scatter();
});
homeBtn.addEventListener("click", () => {
  world.home();
});
morphBtn.addEventListener("click", () => {
  startMorph();
});
animationSelect.addEventListener("change", syncAnimationPanel);
morphLoop.addEventListener("change", () => {
  if (morphLoop.checked && !morphPair) startMorph();
});
morphToInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") startMorph();
});
morphToInput.addEventListener("input", debounce(warmMorphPacks, 80));

exportJsonBtn.addEventListener("click", () => {
  try {
    download("glyph-pack.json", gm.exportSamplesJSON(2), "application/json");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
});

exportJsBtn.addEventListener("click", () => {
  try {
    download("glyph-pack.js", gm.exportSamplesModule(), "text/javascript");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
});

loadPackInput.addEventListener("change", async () => {
  const file = loadPackInput.files?.[0];
  if (!file) return;
  try {
    gm.loadSamples(await file.text());
    afterSample(`pack (${file.name})`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
});

fontFile.addEventListener("change", async () => {
  const file = fontFile.files?.[0];
  if (!file) return;
  applySettings();
  try {
    await gm.sampleFromFont(await file.arrayBuffer(), textInput.value);
    afterSample(file.name);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  }
});

textInput.addEventListener("input", debounce(resampleLoadedFont, 80));

for (const el of [modeSelect, contourSpacing, fillSpacing, fontSize]) {
  el.addEventListener("input", debounce(resampleLoadedFont, 30));
}

for (const el of [legibility, gas]) {
  el.addEventListener("input", applySettings);
}

canvas.addEventListener("pointermove", (event) => {
  const pos = pointerWorld(event);
  if (!pos) return;
  world.pointer = { ...pos, down: event.buttons !== 0 };
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const pos = pointerWorld(event);
  if (!pos) return;
  world.pointer = { ...pos, down: true };
});
canvas.addEventListener("pointerup", (event) => {
  const pos = pointerWorld(event);
  world.pointer = pos ? { ...pos, down: false } : null;
});
canvas.addEventListener("pointerleave", () => {
  world.pointer = null;
});

window.addEventListener("resize", syncCanvas);

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  stepMorphShow(dt);
  world.step(dt);
  paint();
  requestAnimationFrame(tick);
}

applySettings();
syncAnimationPanel();
void sampleFromUrl();
requestAnimationFrame(tick);
