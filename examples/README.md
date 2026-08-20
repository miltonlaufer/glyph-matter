# Examples

Live sketches — workbench plus examples:
[miltonlaufer.com.ar/glyph-matter-examples](https://www.miltonlaufer.com.ar/glyph-matter-examples).

Small programs that import the library from `../src/lib/index.ts`. They are
meant to be copied into a piece, not to replace the workbench.

```bash
npm install
npm run dev
```

| Sketch | Local | Live |
| --- | --- | --- |
| Workbench | http://localhost:5173/ | [workbench](https://www.miltonlaufer.com.ar/glyph-matter-examples/) |
| Field — springy word, click to scatter | http://localhost:5173/examples/field.html | [field](https://www.miltonlaufer.com.ar/glyph-matter-examples/field.html) |
| Morph — `glyph` ⇄ `matter` | http://localhost:5173/examples/morph.html | [morph](https://www.miltonlaufer.com.ar/glyph-matter-examples/morph.html) |
| In-between — dissolve (`glyph` ⇄ `matter`) | http://localhost:5173/examples/in-between.html | [in-between](https://www.miltonlaufer.com.ar/glyph-matter-examples/in-between.html) |
| Attract — point well below the word | http://localhost:5173/examples/attract.html | [attract](https://www.miltonlaufer.com.ar/glyph-matter-examples/attract.html) |
| Wind — traveling gust (sawtooth) | http://localhost:5173/examples/wind.html | [wind](https://www.miltonlaufer.com.ar/glyph-matter-examples/wind.html) |
| Vortex — swirl well below the word | http://localhost:5173/examples/vortex.html | [vortex](https://www.miltonlaufer.com.ar/glyph-matter-examples/vortex.html) |
| Sequence — `addAnimationSteps` + wind / attract | http://localhost:5173/examples/sequence.html | [sequence](https://www.miltonlaufer.com.ar/glyph-matter-examples/sequence.html) |
| Image — `glyph` → sunset → `matter` → book (Canny contours) | http://localhost:5173/examples/image.html | [image](https://www.miltonlaufer.com.ar/glyph-matter-examples/image.html) |
| Webcam — one still per camera step + mic wind and meter | http://localhost:5173/examples/webcam.html | [webcam](https://www.miltonlaufer.com.ar/glyph-matter-examples/webcam.html) |
| Audio — wind from *Terminal Hours* (stop, optional analyser lowpass) | http://localhost:5173/examples/audio.html | [audio](https://www.miltonlaufer.com.ar/glyph-matter-examples/audio.html) |
| Audio bands — treble wind, bass vortex | http://localhost:5173/examples/audio-bands.html | [audio-bands](https://www.miltonlaufer.com.ar/glyph-matter-examples/audio-bands.html) |
| Audio beats — kick gust, bass vortex, period from beat gap | http://localhost:5173/examples/audio-beats.html | [audio-beats](https://www.miltonlaufer.com.ar/glyph-matter-examples/audio-beats.html) |

The font is the copy in `public/fonts/EBGaramond-Regular.ttf`. Point
`FONT_URL` in `shared.ts` at another `.ttf` / `.otf` if you like.

Dots are sized in CSS pixels (not backing-store pixels), so a Retina
screen does not shrink them to a 1-device-pixel spray.

The full workbench (all knobs; hamburger menu on a narrow screen) is
http://localhost:5173/ locally and
https://www.miltonlaufer.com.ar/glyph-matter-examples/ when hosted.

Captured stills, GIFs, and example MP4s live in [`docs/media/`](../docs/media/).
With the workbench running, Chrome, and ffmpeg:

```bash
npm run media         # stills + GIFs for the README
npm run media:video   # MP4s (skips webcam; audio muxed on audio / audio-bands / audio-beats)
```

The hosted folder is built with `npm run build:examples` (from this repo)
into `../glyph-matter-examples`.
