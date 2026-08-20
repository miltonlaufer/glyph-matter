# glyph-matter

A browser library for electronic literature: sample a word from an OpenType
font into **matter** (points that still know which letter they are), then let
that matter rest as a word, loosen into gas, or become another word.

![The word “glyph” sampled as contour and fill particles](docs/media/field.png)

SVG and OpenType outlines are a source format, not the runtime. Path morphing
is one possible behavior. This engine refuses to treat it as the whole story.
The architecture sketch is in [docs/engine-sketch.md](docs/engine-sketch.md).

This is an early public library. Issues, patches, and experiments are welcome
— see [CONTRIBUTING.md](CONTRIBUTING.md).

## Install

The package is not on npm yet. Use git, or clone the repo:

```bash
npm install github:miltonlaufer/glyph-matter
```

```bash
git clone https://github.com/miltonlaufer/glyph-matter.git
cd glyph-matter
npm install
```

Peer runtime: a bundler that can resolve TypeScript (Vite, or any tool that
understands `"exports"` pointing at `src/lib/index.ts`). The only runtime
dependency is [opentype.js](https://github.com/opentypejs/opentype.js).

```ts
import { GlyphMatter, World, drawParticles, makeView } from "glyph-matter";
```

From this repo, import the source directly:

```ts
import { GlyphMatter, World } from "./src/lib/index.ts";
```

### Workbench

```bash
npm run dev
```

Open `http://localhost:5173/` for the interactive workbench (font sampling,
word→word morph, dissolve, automata, growth, differential growth).

![The glyph-matter workbench: sidebar controls and a dissolving word on the canvas](docs/media/workbench.png)

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite workbench + examples |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck, then production build of the workbench |

## Quick start

Sample a font, load the pack into a particle world, draw on a canvas:

```ts
import {
  GlyphMatter,
  World,
  drawParticles,
  makeView,
} from "glyph-matter";

const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const matter = new GlyphMatter({ samplingMode: "both", fontSize: 160 });
await matter.sampleFromFont("/fonts/YourFont.ttf", "glyph");

const pack = matter.getPack()!;
const world = new World().load(pack);

function frame(dt: number) {
  world.step(dt);
  const view = makeView(world.homeBounds(), canvas.width, canvas.height, {
    fit: "contain",
    dpr: window.devicePixelRatio,
    baseline: 0,
    em: pack.sampling.fontSize,
  });
  drawParticles(ctx, world.particles, view, {
    contourColor: "#1a1a1a",
    fillColor: "#6a6a6a",
  });
  requestAnimationFrame((now) => frame(now));
}
```

Ship a work **without** the font by exporting a pack once, then loading it:

```ts
const json = matter.exportSamplesJSON();
// later, in the published piece:
matter.loadSamples(json);
```

Word→word morph (shared letters keep their ink):

```ts
const next = matter.samplePack("matter");
world.morphTo(next, "origin");
```

Runnable copies of these sketches live in [`examples/`](examples/). After
`npm run dev`:

| Example | URL |
| --- | --- |
| Field: a word as springy matter | http://localhost:5173/examples/field.html |
| Word → word morph | http://localhost:5173/examples/morph.html |
| Dissolve as the in-between | http://localhost:5173/examples/in-between.html |

**Field** — pointer push, click to scatter:

![Sampled word scattering into a cloud of points, then settling](docs/media/field.gif)

**Morph** — `glyph` ⇄ `matter`, shared letters keep their ink:

![Particle morph from the word glyph to the word matter](docs/media/morph.gif)

**Dissolve** — word → gas → word:

![The word glyph dissolving into gas and forming the word matter](docs/media/dissolve.gif)

## Documentation

- **[docs/api.md](docs/api.md)** — every public class, function, method, and type
- **[docs/engine-sketch.md](docs/engine-sketch.md)** — why matter, not SVG morph
- **[examples/](examples/)** — small programs you can run and copy
- Types and JSDoc live next to the code in `src/lib/`. The library is
  TypeScript-first; editors pick up types from `src/lib/index.ts`. JSDoc is
  there for hover text and for JavaScript callers — it is not a second API.

## Related work

There are strong libraries for **adjacent** slices. None of them is this
stack: OpenType sampling with glyph identity, a shippable point pack, letter-aware
word→word morph, and cellular automata / organic growth / differential growth
as ways ink travels between words.

| Library | What it does | Gap |
| --- | --- | --- |
| [glyphdust](https://github.com/dgreenheck/glyphdust) | R3F: text → GPU particles → next glyph, often scroll-driven | Motion graphic; no glyph ids, no CA / growth, no shipped packs |
| [jl-particle-interactive](https://github.com/JLpensador/jl-particle-interactive), [canvas-text-particle](https://github.com/wangyasai/canvas-text-particle), masoneffect-style demos | Draw text, sample **pixels**, spring to homes, mouse scatter | Raster sampling; no linguistic morph, no identity |
| [tsparticles](https://github.com/tsparticles/tsparticles) | General particle engine | Text is a shape emitter, not a word with letters |
| [flubber](https://github.com/veltman/flubber), [GSAP MorphSVG](https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/), Kute.js | Interpolate **SVG paths** | The behavior this engine treats as one plugin, not the runtime |
| [opentype.js](https://github.com/opentypejs/opentype.js) | Parse fonts, get glyph paths | A dependency here, not a particle engine |
| [p5.Font](https://p5js.org/reference/p5.Font/), Paper.js | Rasterize or draw text | Drawing tools, not a morphing word field |
| [jasonwebb/2d-differential-growth-experiments](https://github.com/jasonwebb/2d-differential-growth-experiments), adrianton3-style DG sketches | Differential growth on polylines / SVG | Growth experiments, not a word engine |

If you know a closer relative, please open an issue — that comparison belongs
in this list.

## Status

v0.1. Public API may still move. Sampling, packs, `World`, morph matching,
automata, growth, and differential growth are covered by tests. A published
npm tarball with emitted `.js` + `.d.ts` is not set up yet; until then, consume
the TypeScript source through a bundler.

## License

[MIT](LICENSE) © Milton Läufer
