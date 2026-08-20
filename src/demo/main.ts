import { mountSiteNav } from "../../examples/nav.ts";
import {
  GlyphMatter,
  Sequence,
  World,
  createTestFont,
  drawParticles,
  makeView,
  screenToWorld,
} from "../lib/index.ts";
import type {
  InBetween,
  ParticleEffect,
  SamplePack,
  SamplingMode,
  View,
} from "../lib/index.ts";

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

mountSiteNav();

const canvas = must(document.querySelector<HTMLCanvasElement>("#stage"), "stage");
const menuToggle = must(
  document.querySelector<HTMLButtonElement>("#menuToggle"),
  "menuToggle",
);
const menuScrim = must(document.querySelector("#menuScrim"), "menuScrim");
const themeToggle = must(
  document.querySelector<HTMLButtonElement>("#themeToggle"),
  "themeToggle",
);
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
const loopWordsEl = must(document.querySelector<HTMLElement>("#loopWords"), "loopWords");
const addWordBtn = must(document.querySelector<HTMLButtonElement>("#addWord"), "addWord");
const morphBtn = must(document.querySelector<HTMLButtonElement>("#morph"), "morph");
const morphLoop = must(document.querySelector<HTMLInputElement>("#morphLoop"), "morphLoop");
const morphProcess = must(
  document.querySelector<HTMLSelectElement>("#morphProcess"),
  "morphProcess",
);
const fieldPanel = must(document.querySelector<HTMLElement>("#field-panel"), "field-panel");
const effectKind = must(document.querySelector<HTMLSelectElement>("#effectKind"), "effectKind");
const effectWind = must(document.querySelector<HTMLElement>("#effect-wind"), "effect-wind");
const effectPoint = must(document.querySelector<HTMLElement>("#effect-point"), "effect-point");
const effectGravity = must(
  document.querySelector<HTMLElement>("#effect-gravity"),
  "effect-gravity",
);
const windVx = must(document.querySelector<HTMLInputElement>("#windVx"), "windVx");
const windVy = must(document.querySelector<HTMLInputElement>("#windVy"), "windVy");
const windGust = must(document.querySelector<HTMLInputElement>("#windGust"), "windGust");
const windVxVal = must(document.querySelector("#windVxVal"), "windVxVal");
const windVyVal = must(document.querySelector("#windVyVal"), "windVyVal");
const windGustVal = must(document.querySelector("#windGustVal"), "windGustVal");
const windPeriod = must(document.querySelector<HTMLInputElement>("#windPeriod"), "windPeriod");
const windWave = must(document.querySelector<HTMLInputElement>("#windWave"), "windWave");
const windPeriodVal = must(document.querySelector("#windPeriodVal"), "windPeriodVal");
const windWaveVal = must(document.querySelector("#windWaveVal"), "windWaveVal");
const effectStrength = must(
  document.querySelector<HTMLInputElement>("#effectStrength"),
  "effectStrength",
);
const effectRadius = must(
  document.querySelector<HTMLInputElement>("#effectRadius"),
  "effectRadius",
);
const effectStrengthVal = must(document.querySelector("#effectStrengthVal"), "effectStrengthVal");
const effectRadiusVal = must(document.querySelector("#effectRadiusVal"), "effectRadiusVal");
const effectX = must(document.querySelector<HTMLInputElement>("#effectX"), "effectX");
const effectY = must(document.querySelector<HTMLInputElement>("#effectY"), "effectY");
const effectXVal = must(document.querySelector("#effectXVal"), "effectXVal");
const effectYVal = must(document.querySelector("#effectYVal"), "effectYVal");
const gravX = must(document.querySelector<HTMLInputElement>("#gravX"), "gravX");
const gravY = must(document.querySelector<HTMLInputElement>("#gravY"), "gravY");
const gravXVal = must(document.querySelector("#gravXVal"), "gravXVal");
const gravYVal = must(document.querySelector("#gravYVal"), "gravYVal");
const fontUrl = must(document.querySelector<HTMLInputElement>("#fontUrl"), "fontUrl");
if (fontUrl.value === "/fonts/EBGaramond-Regular.ttf") {
  fontUrl.value = `${import.meta.env.BASE_URL}fonts/EBGaramond-Regular.ttf`;
}
const fontFile = must(document.querySelector<HTMLInputElement>("#fontFile"), "fontFile");
const loadImageInput = must(
  document.querySelector<HTMLInputElement>("#loadImage"),
  "loadImage",
);
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
let sequence: Sequence | null = null;
const packCache = new Map<string, SamplePack>();
const ctx = must(canvas.getContext("2d"), "2d context");
const HOLD_T = 0.85;

function sliderLegibility(): number {
  return Number(legibility.value) / 100;
}

function sequenceDriving(): boolean {
  return Boolean(sequence?.playing);
}

function loopWords(): string[] {
  const first = textInput.value.trim();
  const extras = [...loopWordsEl.querySelectorAll<HTMLInputElement>(".loop-word")]
    .map((input) => input.value.trim())
    .filter(Boolean);
  return first ? [first, ...extras] : extras;
}

function morphInBetween(): InBetween {
  return morphProcess.value === "spring" ? "spring" : "dissolve";
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
    ...(sequenceDriving() && sequence?.phase !== "hold" ? {} : { legibility: legibilityN }),
  });
  if (sequence) sequence.restore = legibilityN;
  syncEffectLabels();
  applyEffectFromUi();
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function effectAnchor(): { x: number; y: number } {
  const pack = gm.getPack();
  if (!pack) return { x: 0, y: 0 };
  return {
    x: pack.bounds.x + pack.bounds.w / 2,
    y: pack.bounds.y + pack.bounds.h / 2,
  };
}

function pointWell(): { x: number; y: number } {
  const at = effectAnchor();
  return {
    x: at.x + Number(effectX.value),
    y: at.y + Number(effectY.value),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function placeWellAt(worldX: number, worldY: number): void {
  const at = effectAnchor();
  const min = Number(effectX.min);
  const max = Number(effectX.max);
  effectX.value = String(Math.round(clamp(worldX - at.x, min, max)));
  effectY.value = String(Math.round(clamp(worldY - at.y, Number(effectY.min), Number(effectY.max))));
  applySettings();
}

function syncEffectLabels(): void {
  windVxVal.textContent = windVx.value;
  windVyVal.textContent = windVy.value;
  windGustVal.textContent = windGust.value;
  windPeriodVal.textContent = (Number(windPeriod.value) / 10).toFixed(1);
  windWaveVal.textContent = windWave.value;
  effectXVal.textContent = effectX.value;
  effectYVal.textContent = effectY.value;
  effectStrengthVal.textContent = effectStrength.value;
  effectRadiusVal.textContent = effectRadius.value;
  gravXVal.textContent = gravX.value;
  gravYVal.textContent = gravY.value;
}

function syncEffectPanels(): void {
  const kind = effectKind.value;
  effectWind.hidden = kind !== "wind";
  effectPoint.hidden = kind !== "attract" && kind !== "repel" && kind !== "vortex";
  effectGravity.hidden = kind !== "gravity";
}

function applyEffectFromUi(): void {
  world.clearEffects();
  const kind = effectKind.value;
  if (kind === "none") return;
  const at = pointWell();
  const strength = Number(effectStrength.value);
  const radius = Number(effectRadius.value);
  let effect: ParticleEffect | null = null;
  if (kind === "wind") {
    effect = {
      kind: "wind",
      vx: Number(windVx.value),
      vy: Number(windVy.value),
      gust: Number(windGust.value),
      period: Number(windPeriod.value) / 10,
      wavelength: Number(windWave.value),
    };
  } else if (kind === "attract") {
    effect = { kind: "attract", x: at.x, y: at.y, strength, radius };
  } else if (kind === "repel") {
    effect = { kind: "repel", x: at.x, y: at.y, strength, radius };
  } else if (kind === "vortex") {
    effect = { kind: "vortex", x: at.x, y: at.y, strength, radius };
  } else if (kind === "gravity") {
    effect = { kind: "gravity", x: Number(gravX.value), y: Number(gravY.value) };
  }
  if (effect) world.addEffect(effect);
}

function originXForView(): number {
  const words = loopWords();
  if (sequenceDriving() && words[0] && gm.hasFont()) {
    try {
      const pack = packFor(words[0]);
      return pack.bounds.x + pack.bounds.w / 2;
    } catch {
      /* fall through */
    }
  }
  const pack = gm.getPack();
  const bounds = world.particles.length > 0 ? world.homeBounds() : pack?.bounds;
  return bounds ? bounds.x + bounds.w / 2 : 0;
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
  view = bounds
    ? makeView(bounds, canvas.width, canvas.height, {
        fit: "actual",
        dpr,
        baseline: 0,
        em: world.fontSize,
        originX: originXForView(),
      })
    : null;
}

function animationKind(): "field" | "morph" {
  return animationSelect.value === "morph" ? "morph" : "field";
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function inkColors() {
  return {
    contour: cssVar("--ink", "#1c1b18"),
    fill: cssVar("--ink-soft", "#4a4740"),
  };
}

function applyTheme(theme: "dark" | "light"): void {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  try {
    localStorage.setItem("glyph-matter-theme", theme);
  } catch {
    /* ignore quota / private mode */
  }
}

function storedTheme(): "dark" | "light" {
  try {
    const value = localStorage.getItem("glyph-matter-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* ignore */
  }
  return "light";
}

function paint(): void {
  syncCanvas();
  const ink = inkColors();
  if (!view) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const pack = gm.getPack();
  drawParticles(ctx, world.particles, view, {
    pointRadius: (pack?.sampling.mode === "fill" ? 1.35 : 1.1) * view.dpr,
    contourColor: ink.contour,
    fillColor: ink.fill,
  });
}

function stopSequence(): void {
  sequence?.pause();
  sequence = null;
  world.configure({ legibility: sliderLegibility() });
}

function afterSample(origin: string): void {
  sourceLabel = origin;
  stopSequence();
  packCache.clear();
  const pack = gm.getPack();
  if (pack) world.load(pack);
  applyEffectFromUi();
  const n = pack?.points.length ?? 0;
  const glyphs = pack?.glyphs.length ?? 0;
  const sampled = pack?.text ?? "";
  setStatus(`${origin} · “${sampled}” · ${glyphs} glyphs · ${n} points`);
  requestAnimationFrame(() => warmMorphPacks());
  if (animationKind() === "morph" && morphLoop.checked) startMorph();
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
  for (const word of loopWords()) packFor(word);
}

function startMorph(): void {
  if (!gm.hasFont()) {
    setStatus("need a live font to morph");
    return;
  }
  applySettings();
  const words = loopWords();
  if (words.length < 2) {
    setStatus("add at least two words to the loop");
    return;
  }
  const travel = morphInBetween();
  const restore = sliderLegibility();
  stopSequence();
  sequence = new Sequence(gm, world, { loop: morphLoop.checked })
    .addAnimationSteps(
      words.map((word) => ({
        word,
        duration: HOLD_T,
        inBetween: travel,
        gas: Number(gas.value),
        legibility: restore,
      })),
    )
    .play();
  applyEffectFromUi();
  setStatus(`loop · ${words.join(" → ")}`);
}

function syncAnimationPanel(): void {
  const kind = animationKind();
  fieldPanel.hidden = kind !== "field";
  morphPanel.hidden = kind !== "morph";
  if (kind !== "morph") {
    stopSequence();
  } else {
    warmMorphPacks();
  }
}

function bindWordRow(row: HTMLElement): void {
  const input = row.querySelector<HTMLInputElement>(".loop-word");
  const remove = row.querySelector<HTMLButtonElement>(".word-remove");
  input?.addEventListener("input", debounce(warmMorphPacks, 80));
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startMorph();
  });
  remove?.addEventListener("click", () => {
    const rows = loopWordsEl.querySelectorAll(".word-row");
    if (rows.length <= 1) return;
    row.remove();
  });
}

function addWordRow(value = ""): void {
  const label = document.createElement("label");
  label.className = "word-row";
  const caption = document.createElement("span");
  caption.textContent = "then";
  const inner = document.createElement("span");
  inner.className = "word-row-inner";
  const input = document.createElement("input");
  input.className = "loop-word";
  input.type = "text";
  input.spellcheck = false;
  input.value = value;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "word-remove";
  remove.setAttribute("aria-label", "remove word");
  remove.textContent = "×";
  inner.append(input, remove);
  label.append(caption, inner);
  loopWordsEl.append(label);
  bindWordRow(label);
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

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
});
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
addWordBtn.addEventListener("click", () => {
  addWordRow("");
});
animationSelect.addEventListener("change", syncAnimationPanel);
morphLoop.addEventListener("change", () => {
  if (sequence) sequence.loop = morphLoop.checked;
  if (morphLoop.checked && !sequenceDriving()) startMorph();
});
morphProcess.addEventListener("change", () => {
  if (sequenceDriving()) startMorph();
});
effectKind.addEventListener("change", () => {
  syncEffectPanels();
  applyEffectFromUi();
});

for (const el of [
  windVx,
  windVy,
  windGust,
  windPeriod,
  windWave,
  effectX,
  effectY,
  effectStrength,
  effectRadius,
  gravX,
  gravY,
]) {
  el.addEventListener("input", applySettings);
}

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

loadImageInput.addEventListener("change", async () => {
  const file = loadImageInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    stopSequence();
    await gm.sampleFromImage(url, {
      width: 720,
      contourSpacing: 1.4,
      fillSpacing: 4.5,
      edgeThreshold: 0.1,
      maxPoints: 20000,
      label: file.name,
    });
    sourceLabel = file.name;
    packCache.clear();
    const pack = gm.getPack();
    if (pack) world.load(pack);
    applyEffectFromUi();
    setStatus(`${file.name} · image contours · ${pack?.points.length ?? 0} points`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  } finally {
    URL.revokeObjectURL(url);
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
  if (pos) world.pointer = { ...pos, down: event.buttons !== 0 };
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const pos = pointerWorld(event);
  if (!pos) return;
  const kind = effectKind.value;
  if (kind === "attract" || kind === "repel" || kind === "vortex") {
    placeWellAt(pos.x, pos.y);
  }
  world.pointer = { ...pos, down: true };
});
canvas.addEventListener("pointerup", (event) => {
  const pos = pointerWorld(event);
  world.pointer = pos ? { ...pos, down: false } : null;
});
canvas.addEventListener("pointerleave", () => {
  world.pointer = null;
});

function setMenuOpen(open: boolean): void {
  document.body.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "close menu" : "open menu");
}

menuToggle.addEventListener("click", () => {
  setMenuOpen(!document.body.classList.contains("menu-open"));
});
menuScrim.addEventListener("click", () => setMenuOpen(false));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});
window.matchMedia("(max-width: 800px)").addEventListener("change", (event) => {
  if (!event.matches) setMenuOpen(false);
});

window.addEventListener("resize", syncCanvas);

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (sequenceDriving()) sequence?.tick(dt);
  else world.step(dt);
  paint();
  requestAnimationFrame(tick);
}

for (const row of loopWordsEl.querySelectorAll<HTMLElement>(".word-row")) {
  bindWordRow(row);
}

applyTheme(storedTheme());
syncEffectPanels();
applySettings();
syncAnimationPanel();
void sampleFromUrl();
requestAnimationFrame(tick);
