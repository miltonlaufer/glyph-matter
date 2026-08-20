# Examples

Small programs that import the library from `../src/lib/index.ts`. They are
meant to be copied into a piece, not to replace the workbench.

```bash
npm install
npm run dev
```

| Sketch | URL |
| --- | --- |
| Field — springy word, click to scatter | http://localhost:5173/examples/field.html |
| Morph — `glyph` ⇄ `matter` | http://localhost:5173/examples/morph.html |
| In-between — dissolve (`glyph` ⇄ `matter`) | http://localhost:5173/examples/in-between.html |

The font is the copy in `public/fonts/EBGaramond-Regular.ttf`. Point
`FONT_URL` in `shared.ts` at another `.ttf` / `.otf` if you like.

The full workbench (all knobs) stays at http://localhost:5173/.

Captured stills and GIFs used in the root README live in
[`docs/media/`](../docs/media/). Regenerate them with `npm run media`
while the workbench is running.
