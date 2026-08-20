# API reference

Public surface of `glyph-matter`. Import from the package root
(`"glyph-matter"`) or, in this repo, from `src/lib/index.ts`.

```ts
import {
  GlyphMatter,
  World,
  Sequence,
  applyEffect,
  Automata,
  DifferentialGrowth,
  loadFont,
  sampleText,
  layoutGlyphs,
  parsePack,
  packToJSON,
  packToModule,
  translatePack,
  scalePack,
  placePack,
  sampleImage,
  sampleImageFromRgba,
  spectrumEnergy,
  spectrumCentroid,
  bandEnergy,
  windFromSpectrum,
  windFromAnalyser,
  drawSamples,
  drawParticles,
  drawAutomata,
  drawRings,
  makeView,
  screenToWorld,
  morphParticles,
  stepAutomata,
  stepGrowth,
  bridgeMask,
  ringsFromPack,
  splitLongEdges,
  createTestFont,
  DEFAULT_OPTIONS,
} from "glyph-matter";
```

Types are exported from the same module. The library is TypeScript; JSDoc
on the source is optional documentation for editors and JavaScript callers.

Internal helpers in `src/lib/path.ts` and `src/lib/sample.ts` are not part
of the public API.

---

## Pipeline

```text
font + string  →  SamplePack  →  World / Automata / DifferentialGrowth  →  canvas
image URL      ↗       ↑
              JSON or JS module (no font at runtime)
```

1. **Sample** a string from a font (`GlyphMatter` or `sampleText`), or a
   bitmap (`sampleImage` / `sampleFromImage`).
2. Optionally **export** the pack and load it later without the font.
3. **Animate** with `World` (springs / gas / effects), optional `Sequence`
   (timed words), `Automata`, or `DifferentialGrowth`.
4. **Draw** with `drawParticles`, `drawAutomata`, or `drawRings`.

---

## Defaults

`DEFAULT_OPTIONS` is a `Required<GlyphMatterOptions>`:

| Field | Default |
| --- | --- |
| `samplingMode` | `"both"` |
| `contourSpacing` | `4` |
| `fillSpacing` | `5` |
| `fontSize` | `160` |
| `fillRule` | `"nonzero"` |
| `includeSpaces` | `false` |

---

## Types

### `SamplingMode`

`"contour"` | `"fill"` | `"both"`

How a glyph becomes points when sampling from a font.

### `FillRule`

`"nonzero"` | `"evenodd"`

Used when filling interiors.

### `GlyphMatterOptions`

| Field | Type | Meaning |
| --- | --- | --- |
| `samplingMode` | `SamplingMode` | Contour, fill, or both |
| `contourSpacing` | `number` | Distance along flattened outlines between contour samples (pixels) |
| `fillSpacing` | `number` | Grid step for interior samples (pixels) |
| `fontSize` | `number` | Size used for layout and sampling (world units ≈ CSS pixels at `fit: "actual"`) |
| `fillRule` | `FillRule` | Interior test |
| `includeSpaces` | `boolean` | Keep space glyphs in the pack |

### `Vec`

`{ x: number; y: number }`

### `Bounds`

`{ x: number; y: number; w: number; h: number }` — axis-aligned box.

### `SampleKind`

`"contour"` | `"fill"` — what kind of sample a point is.

### `SamplePoint`

A sampled location that still knows its glyph.

| Field | Type | Meaning |
| --- | --- | --- |
| `x`, `y` | `number` | World position |
| `g` | `number` | Index into `SamplePack.glyphs` |
| `k` | `SampleKind` | Contour or fill |
| `c` | `number?` | Outline index when `k` is `"contour"` |
| `t` | `number?` | 0–1 position along that outline |

### `GlyphRecord`

| Field | Type | Meaning |
| --- | --- | --- |
| `i` | `number` | Index in `glyphs` (same as `SamplePoint.g`) |
| `ch` | `string` | Character |
| `x`, `y` | `number` | Layout origin of the glyph |
| `advance` | `number` | Advance width |
| `word` | `number` | Word index in the string (spaces / newlines increment it) |

### `SamplePack`

Frozen snapshot of a sampled string. Version field `v` must be `1`.

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | `1` | Pack format version |
| `text` | `string` | Source string |
| `sampling` | object | Mode, spacings, fontSize, fillRule used to sample |
| `font` | `{ familyName, unitsPerEm }` | Metadata only; the font file is not embedded |
| `bounds` | `Bounds` | Tight box of all points |
| `glyphs` | `GlyphRecord[]` | Letters in reading order |
| `points` | `SamplePoint[]` | The matter |

### `FontSource`

`string` | `ArrayBuffer` | `ArrayBufferView` | opentype.js `Font`

A URL (fetched), raw bytes, or an already-parsed font.

### `MorphAlign`

`"center"` | `"origin"`

How target points are shifted before matching:

- `"origin"` — leave target coordinates as sampled (typical for word→word
  with a locked camera).
- `"center"` — translate the target cloud so its centroid matches the
  current particles.

### `Particle` / `Morphable`

Live point in `World`. Same fields as a sample plus velocity and fade:

| Field | Type | Meaning |
| --- | --- | --- |
| `x`, `y` | `number` | Current position |
| `vx`, `vy` | `number` | Velocity |
| `homeX`, `homeY` | `number` | Rest pose (spring target) |
| `g` | `number` | Glyph index |
| `k` | `SampleKind` | Contour or fill |
| `c`, `t` | `number?` | Contour identity |
| `life` | `number?` | 0–1 opacity; new points fade in |
| `exit` | `boolean?` | Spare ink from a longer word; dies on arrival at its home |

### `WorldPointer`

`{ x: number; y: number; down: boolean }` — world-space pointer for repulsion.

### `WorldOptions`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `legibility` | `number` | `1` | `1` = rest as letters, `0` = gas |
| `stiffness` | `number` | `28` | Spring toward home |
| `damping` | `number` | `7` | Velocity decay |
| `gas` | `number` | `90` | Random force, scaled by `1 - legibility` |
| `mouseRadius` | `number` | `90` | Pointer falloff radius |
| `mouseForce` | `number` | `2800` | Pointer repulsion |
| `fade` | `number` | `0.55` | Seconds for fade in / extra points |

### `DrawFit`

`"contain"` | `"actual"`

- `"actual"` — 1 world unit = 1 CSS pixel when the pack fits (`scale === dpr`);
  shrinks if the word would be wider or taller than the canvas.
- `"contain"` — scale the bounds to fill the canvas with padding.

### `View`

Camera produced by `makeView`: `{ scale, ox, oy, dpr }`.

### `DrawSamplesOptions`

| Field | Type | Meaning |
| --- | --- | --- |
| `pointRadius` | `number` | Dot radius in canvas pixels |
| `contourColor` | `string` | Contour dots |
| `fillColor` | `string` | Fill dots |
| `fit` | `DrawFit` | Camera fit |
| `dpr` | `number` | Device pixel ratio |
| `clear` | `boolean` | Clear canvas first (default `true`) |
| `baseline` | `number` | Pin vertical placement to this world y |
| `em` | `number` | Em size used with `baseline` so different words share a line |
| `originX` | `number` | World x placed at the canvas center (locks the camera while morphing) |

### `DrawablePoint`

`{ x, y, k, life? }` — enough to draw a particle.

### `AutomataGrid`

`{ cols, rows, cell, originX, originY, cells }` — grid in world space for
`drawAutomata`. `Automata` itself is drawable as this shape.

### `AutomataRule`

`"life"` | `"seeds"` | `"brain"`

- **life** — Conway: survive 2–3, born on 3.
- **seeds** — Brian's Seeds: born on 2, never survives.
- **brain** — Brian's Brain: 0 empty, 1 firing, 2 refractory.

### `AutomataKind`

`"ca"` | `"growth"`

`"ca"` uses a Life-family rule. `"growth"` is Eden dilation into an allow
mask (organic fill), not a Life rule.

### `AutomataOptions`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `rule` | `AutomataRule` | `"life"` | Used when `kind` is `"ca"` |
| `kind` | `AutomataKind` | `"ca"` | CA vs growth |
| `speed` | `number` | `8` | Generations per second (clamped 1–24) |
| `confine` | `boolean` | `true` | Live cells only on the original letter (field mode) |

### `DiffNode`

`{ x, y, vx, vy }` — a node on a differential-growth ring.

### `DifferentialOptions`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `speed` | `number` | `10` | Simulation rate (clamped 1–24) |
| `splitLen` | `number` | `8` | Split edges longer than this (often overwritten from the pack) |
| `maxNodes` | `number` | `2800` | Cap on total nodes |

---

## `GlyphMatter`

Sample text from a font, or load a pack that was sampled earlier.

```ts
const gm = new GlyphMatter(options?: GlyphMatterOptions);
```

Public fields mirror the last sampling settings: `samplingMode`,
`contourSpacing`, `fillSpacing`, `fontSize`, `fillRule`, `includeSpaces`.

### `configure(options: GlyphMatterOptions): this`

Patch sampling settings. Does not resample until `sampleFromFont` /
`resample`.

### `sampleFromFont(font: FontSource, text: string): Promise<this>`

Parse `font` (URL, bytes, or opentype `Font`), sample `text`, keep the font
in memory for `resample` / `samplePack`.

### `samplePack(text: string): SamplePack`

Sample another string from the loaded font **without** replacing the current
pack. Throws if no font is loaded (pack-only mode).

### `sampleFromImage(source: string, options?: ImageSampleOptions): Promise<SamplePack>`

Decode a bitmap URL, run Canny edges plus texture stipple (not a dark
rectangle), and set the current pack to that image. The loaded font is kept,
so `samplePack` still works for words.

### `resample(text?: string): this`

Sample again from the font last passed to `sampleFromFont`. Optional `text`
changes the string. Throws if no font is loaded.

### `exportSamples(): SamplePack`

Deep clone of the current pack. Throws if nothing has been sampled.

### `exportSamplesJSON(space = 0): string`

JSON for `loadSamples`. `space` is passed to `JSON.stringify`.

### `exportSamplesModule(exportName = "glyphPack"): string`

ES module source: `export const glyphPack = { ... }`. `exportName` must be a
valid JS identifier.

### `loadSamples(source: SamplePack | string): this`

Use a previously exported pack. No font required. Accepts an object or a JSON
string. Clears the in-memory font.

### `getPack(): SamplePack | null`

Current pack, or `null`.

### `getPoints(): SamplePoint[]`

`pack.points`, or `[]`.

### `getText(): string`

Current string.

### `hasFont(): boolean`

Whether `sampleFromFont` still has a font in memory.

---

## Sampling (font)

These are the functions `GlyphMatter` uses. Use them directly if you already
have an opentype.js `Font`.

### `loadFont(source: FontSource): Promise<Font>`

If `source` is a string, it is `fetch`ed. Bytes are parsed with opentype.js.
An existing `Font` is returned as-is.

### `layoutGlyphs(font, text, fontSize): LaidOutGlyph[]`

Horizontal layout with kerning. Newlines start a new word index without
emitting a glyph. Spaces increment `wordIndex`.

`LaidOutGlyph` (not re-exported from the barrel, but returned here):

`{ char, glyph, x, y, advance, wordIndex, isSpace }`

### `sampleText(font, text, options: Required<GlyphMatterOptions>): SamplePack`

Layout, then sample each glyph path. This is the pack builder.

---

## Sampling (image)

Turn a photograph into the same `SamplePack` a word uses, so it can morph.

### `sampleImageFromRgba(width, height, data, options?): SamplePack`

Canny contours (blur, Sobel, non-max suppression, hysteresis). Fill in
`both` mode is a local-texture stipple so smooth sky/paper stays empty;
`fill` mode still uses a darkness grid. No DOM. Good for tests and for
pixels you already have.

### `sampleImage(source: string, options?: ImageSampleOptions): Promise<SamplePack>`

`fetch`/decode via an `<img>` + canvas, then `sampleImageFromRgba`. Browser
only.

`ImageSampleOptions`: `samplingMode`, `contourSpacing` (default 1.4),
`fillSpacing` (3.5), `width` (fit, default 640), `edgeThreshold` (0.12),
`edgeFloor` (0.4), `edgeLow` (0.4 × high threshold), `fillDarkness` (0.58,
fill-only luma cutoff), `maxPoints` (8000; fill is capped, contours are
kept), `label`.

---

## Packs

### `parsePack(source: SamplePack | string | unknown): SamplePack`

Validate a pack. Parses JSON strings. Throws on missing fields or `v !== 1`.

### `packToJSON(pack: SamplePack, space = 0): string`

`JSON.stringify` of the pack.

### `packToModule(pack: SamplePack, exportName = "glyphPack"): string`

`export const <name> = <json>;`

### `translatePack(pack, x, y): SamplePack`

Shift in world space.

### `scalePack(pack, scale): SamplePack`

Scale about the pack's top-left bound.

### `placePack(pack, cx, cy): SamplePack`

Move the pack so its center sits on `(cx, cy)`.

---

## `World`

Particle field. Homes are the rest pose. `step` springs toward homes, adds
gas when `legibility < 1`, and repels from `pointer`.

```ts
const world = new World();
world.load(pack);
world.configure({ legibility: 0.2, gas: 90 });
world.step(dt);
```

Public fields: `particles`, `glyphs`, `fontSize`, `legibility`, `stiffness`,
`damping`, `gas`, `mouseRadius`, `mouseForce`, `fade`, `pointer`.

### `configure(options: WorldOptions): this`

Patch physics knobs.

### `load(pack: SamplePack): this`

Set rest poses from the pack. If a previous particle exists at the same
index, it keeps `x, y, vx, vy` so a naive reload can still animate. Prefer
`morphTo` for word→word.

### `reclaim(): this`

Clear `exit` and restore `life` on every particle so leftover ink can rematch
on the next morph instead of dying in a dissolving cloud.

### `scatter(strength = 420): this`

Add a random impulse to living particles.

### `home(): this`

Snap every particle to its home and zero velocity.

### `morphTo(pack: SamplePack, align: MorphAlign = "origin"): this`

Retarget homes to another sampled word. Live positions stay put. Matching
rules (see `morphParticles` below). Updates `glyphs` and `fontSize`.

### `homeBounds(): Bounds`

Bounds of living particles' homes (or all particles if none are living).

### `meanHomeDistance(): number`

Average distance from living particles to their homes. Useful as a “settled”
signal.

### `step(dt: number): this`

Integrate springs, gas, pointer, extra effects, and drag. `dt` is seconds,
clamped to at most 1/30. Exiting particles that have arrived at home are
removed. Fading-in particles increase `life`.

### `addEffect(effect: ParticleEffect): this`

Append a force applied every `step`. See [Particle effects](#particle-effects).

### `clearEffects(): this`

Drop extra forces. Pointer repulsion (`world.pointer`) is unchanged.

### `setEffects(effects: ParticleEffect[]): this`

Replace the whole force list (useful when wind is rebuilt every frame).

`effects` is a public array of the active forces.

---

## Particle effects

Extra accelerations on `World`. They stack with springs, gas, and the pointer.
`World.step` scales extra forces by rest stiffness so they still lean a
formed word, and still push a dissolved cloud (legibility does not mute them). Radius on attract /
repel / vortex is a **cutoff distance** from the well: inside it the force
falls off linearly; beyond it the force is zero.

| `kind` | Fields | Behavior |
| --- | --- | --- |
| `"wind"` | `vx`, `vy`, `gust?`, `period?`, `wavelength?` | Traveling gust: positive half of a sawtooth along the wind. `period` 0 = constant. `wavelength` 0 = all particles pulse together. Defaults `1.35` s and `240` units. |
| `"attract"` | `x`, `y`, `strength`, `radius?` | Pull toward a point (point gravity). No `radius` = infinite range |
| `"repel"` | `x`, `y`, `strength`, `radius?` | Push away from a point |
| `"gravity"` | `x?`, `y?` | Constant acceleration. Default `{ x: 0, y: 420 }` (down in this engine) |
| `"vortex"` | `x`, `y`, `strength`, `radius?` | Tangential swirl (positive = counterclockwise), slight inward bias |

```ts
world.addEffect({ kind: "wind", vx: 80, vy: 0, gust: 30, period: 1.4, wavelength: 240 });
world.addEffect({ kind: "attract", x: 120, y: 40, strength: 160, radius: 500 });
```

### `windFromSpectrum(energy, centroid): WindEffect`

Map loudness (0–1) and spectral centroid (0–1, bass→treble) to traveling
wind. `spectrumEnergy` / `spectrumCentroid` read an FFT buffer;
`windFromAnalyser(analyser, bins)` does both for a Web Audio `AnalyserNode`.
`bandEnergy(freq, binHz, loHz, hiHz)` is the same mean as `spectrumEnergy`
but only for bins in that Hertz range (`binHz` is `sampleRate / fftSize`).

`applyEffect(effect, particle, dt, time?)` is the same function `World.step` uses,
exported for tests and custom integrators. `time` is seconds; wind uses it for
the sawtooth. `windEnvelope(phase)` is the 0–1 pulse.

---

## `Sequence`

Timed list of words. Samples through a `GlyphMatter` that already has a font,
morphs on a `World`. You still run the animation frame and draw.

```ts
const show = new Sequence(gm, world, { loop: true })
  .addAnimationStep({ word: "glyph", duration: 1 })
  .addAnimationSteps([
    { word: "matter", duration: 1.2, gas: 90, inBetween: "dissolve" },
    { word: "glyph", x: 40, y: 0, inBetween: "spring" },
  ])
  .play();

show.tick(dt); // timeline + world.step
```

Driving `world.morphTo`, `world.configure`, and `world.step` yourself is still
the fully manual path — `Sequence` is optional sugar.

### `AnimationStep`

| Field | Type | Meaning |
| --- | --- | --- |
| `word` | `string?` | Sampled with the current `GlyphMatter` settings. Omit when `pack` is set |
| `pack` | `SamplePack?` | Ready-made rest pose (image contours, a shipped pack). Wins over `word` |
| `x`, `y` | `number?` | World-space shift of the layout origin |
| `gas`, `legibility`, `stiffness`, `damping` | `number?` | Passed to `World.configure` for this step |
| `duration` | `number?` | Seconds at rest as this word (default `0.8`) |
| `inBetween` | `"spring"` \| `"dissolve"` | How ink travels *to* this word. Ignored on the first step. Default `"dissolve"` |
| `effects` | `ParticleEffect[]?` | Replace `world.effects` for this step. Omit to leave them; `[]` to clear |

### `SequenceOptions`

`loop` (default `true`), `dissolveDropT`, `dissolveT`, `travelT`, `formT`
(same timings as the workbench dissolve).

### Methods

| Method | Meaning |
| --- | --- |
| `addAnimationStep(step)` | Append one step |
| `addAnimationSteps(steps)` | Append many |
| `play()` | Load the first word; `tick` will advance |
| `pause()` | Freeze the timeline (`tick` still steps physics) |
| `reset()` | First word, paused |
| `clear()` | Drop all steps |
| `tick(dt)` | Advance timeline if playing, then `world.step(dt)` |
| `currentStep()` | Active step, or `null` |

Public fields: `steps`, `index`, `phase`, `elapsed`, `loop`, `playing`, `restore`.

### `translatePack(pack, x, y): SamplePack`

Shift points, glyphs, and bounds. Used by `Sequence` when a step has `x`/`y`.

---

## Morph

### `morphParticles(current, targets, align?, currentGlyphs?, targetGlyphs?): Morphable[]`

Low-level rematch used by `World.morphTo`.

- Shared letters keep their ink.
- Same-length words pair per character slot.
- Different-length words pair the middle N glyphs and shift by visual center.
- Extra letters of a longer source fly evenly into every letter of the
  shorter target (`exit: true`) and die on arrival.
- Spare points inside a matched letter do the same.
- New letters of a longer target bud from the closest existing letter.
- When one side is a single glyph (a photo pack) and the other is a word,
  matching is one cloud, not a middle-letter slot. Extra dest points clone
  from existing particles so they bloom out of the current ink.

`align` is applied before matching (`"origin"` default).

---

## `Automata`

Pixel grid over letter masks. Field mode (`seedFromPack`) or morph mode
(`seedMorph`).

```ts
const ca = new Automata().configure({ kind: "ca", rule: "life", speed: 8 });
ca.seedMorph(fromPack, toPack);
ca.setProgress(u); // 0–1 along the morph
ca.tick(dt);
drawAutomata(ctx, ca, view);
```

Public fields: `cols`, `rows`, `cell`, `originX`, `originY`, `cells`, `mask`,
`fromMask`, `toMask`, `bridge`, `rule`, `kind`, `speed`, `confine`,
`progress`, `morphing`.

`cells` values: `0` empty, `1` live / firing, `2` refractory (Brain only).

### `configure(options: AutomataOptions): this`

### `empty: boolean`

True when the grid has no columns or rows.

### `liveCount(): number`

Count of cells with value `1`.

### `seedFromPack(pack: SamplePack): this`

Rasterize one word. Field / playground mode. `confine` limits life to that
mask unless turned off.

### `seedMorph(from: SamplePack, to: SamplePack): this`

Shared grid for a word→word in-between. Ink starts on `from`. A bridge
corridor connects the two masks. `setProgress` grows the allow region
toward `to`.

### `setProgress(u: number): this`

`u` in 0–1. Updates the allow mask. At `u >= 0.86`, snaps live cells onto
the target mask.

### `fillTarget(): this`

Copy `toMask` into `cells`.

### `reset(): this`

Restore the seed (source word) and progress `0`.

### `clear(): this`

Empty the grid.

### `step(): this`

One generation (`stepAutomata` or `stepGrowth`).

### `tick(dt: number): this`

Accumulate `dt * speed` and run a bounded number of `step`s.

### `paint(x, y, radius): this`

Stamp live cells in world space (pointer drawing). Honors confine / allow.

### `stepAutomata(prev, next, cols, rows, rule, mask): void`

One Life / Seeds / Brain generation. `mask` `1` = allowed cell; `null` =
unbounded. Brain uses 0/1/2; Life and Seeds use 0/1.

### `stepGrowth(prev, next, cols, rows, allow): void`

Eden dilation: live cells stay; empty allowed neighbors become live; cells
outside `allow` die.

### `bridgeMask(from, to, cols, rows): Uint8Array`

Shortest-path corridor between two letter masks (used by `seedMorph`).

---

## `DifferentialGrowth`

Closed rings grown by splitting long edges, local repulsion, and smoothing.
As `progress` rises, nodes are pulled onto the target word.

```ts
const dg = new DifferentialGrowth();
dg.seedMorph(fromPack, toPack);
dg.setProgress(u);
dg.tick(dt);
drawRings(ctx, dg.rings, view);
```

Public fields: `rings`, `splitLen`, `maxNodes`, `speed`, `progress`.

### `configure(options: DifferentialOptions): this`

### `empty: boolean`

No rings.

### `nodeCount(): number`

Total nodes across rings.

### `seedMorph(from: SamplePack, to: SamplePack): this`

Rings from `from` (contours if present, otherwise a ring per filled glyph).
Targets from `to`. Chooses `splitLen` from median edge length.

### `setProgress(u: number): this`

0 = grow freely, 1 = settle onto the target.

### `clear(): this`

### `step(dt: number): this`

One integration slice (`dt` seconds, clamped).

### `tick(dt: number): this`

Speed-scaled substeps.

### `ringsFromPack(pack: SamplePack): DiffNode[][]`

Contour rings grouped by glyph and outline index; falls back to fill rings.

### `splitLongEdges(ring, maxLen, budget): DiffNode[]`

Insert nodes on edges longer than `maxLen`, up to `budget` insertions.

---

## Drawing

All drawing functions take a `CanvasRenderingContext2D`. Canvas backing-store
size should already include device pixel ratio.

### `makeView(bounds, canvasWidth, canvasHeight, options?): View`

| Option | Type | Meaning |
| --- | --- | --- |
| `fit` | `DrawFit` | `"actual"` (default) or `"contain"` |
| `dpr` | `number` | Default `1` |
| `baseline` | `number` | World y to pin |
| `em` | `number` | With `baseline`, keeps different words on one line |
| `originX` | `number` | World x at canvas center |

### `screenToWorld(cssX, cssY, view): Vec`

Convert CSS pixel coordinates (not backing-store pixels) to world space.
Uses `view.dpr`.

### `drawParticles(ctx, points, view, options?): void`

Dots for fill then contour. `life` becomes alpha.

### `drawAutomata(ctx, grid, view, options?): void`

| Option | Type | Meaning |
| --- | --- | --- |
| `liveColor` | `string` | Live / firing cells |
| `dyingColor` | `string` | Refractory (`2`) |
| `clear` | `boolean` | Default `true` |

### `drawRings(ctx, rings, view, options?): void`

Stroke closed rings and draw nodes.

| Option | Type | Meaning |
| --- | --- | --- |
| `color` | `string` | Stroke and nodes |
| `clear` | `boolean` | Default `true` |
| `lineWidth` | `number` | Stroke width |

### `drawSamples(ctx, pack, options?): void`

`makeView(pack.bounds, …)` then `drawParticles` of the pack (static, no world).

---

## Test font

### `createTestFont(): Font`

Tiny opentype.js font (block letters I, O, L, …) for unit tests. Coordinates
are font units, y-up, `unitsPerEm` 1000. Not for production pieces.
