# Contributing

Issues, experiments, and pull requests are welcome. This library is still
early: small, focused changes are easier to review than large rewrites.

## Setup

```bash
git clone https://github.com/miltonlaufer/glyph-matter.git
cd glyph-matter
npm install
npm run dev
```

The workbench is at `http://localhost:5173/`. Examples live under
`http://localhost:5173/examples/`. A static copy of the examples (for
https://www.miltonlaufer.com.ar/glyph-matter-examples) is built with:

```bash
npm run build:examples
```

Writes into `../glyph-matter-examples`.

README stills and GIFs: with the workbench running, Chrome, and ffmpeg:

```bash
npm run media
```

Writes into `docs/media/`.

## Before you open a PR

```bash
npm test
npm run typecheck
npm run lint
```

All three should pass. Do not add ad-hoc `eslint-disable`, `@ts-ignore`,
or `@ts-expect-error` comments to silence a check.

## Where to look

| File | Role |
| --- | --- |
| [docs/engine-sketch.md](docs/engine-sketch.md) | Why the runtime is matter, not SVG paths |
| [docs/api.md](docs/api.md) | Public functions, methods, and types |
| `src/lib/` | Library code |
| `src/demo/` | Interactive workbench |
| `examples/` | Small runnable sketches |
| `tests/` | Vitest coverage of sampling, morph, world, CA, growth |

## Design notes worth keeping

- OpenType outlines are a **source format**. The live object is a point
  cloud (or grid / ring) that still knows which glyph it came from.
- Word→word morph should keep shared letters when it can. Extra ink flies
  into the remaining letters instead of popping out of existence. Extra dest
  points (word→image) clone from existing particles instead of appearing at
  the target.
- In-betweens (springs, dissolve, automata, growth, differential growth)
  are ways ink travels from one word to another, not separate engines.

If you are unsure where a change belongs, open an issue first.
