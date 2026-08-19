import { Font, Glyph, Path } from "opentype.js";

function rectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  clockwise: boolean,
): Path {
  const p = new Path();
  if (clockwise) {
    p.moveTo(x, y);
    p.lineTo(x, y + h);
    p.lineTo(x + w, y + h);
    p.lineTo(x + w, y);
    p.close();
  } else {
    p.moveTo(x, y);
    p.lineTo(x + w, y);
    p.lineTo(x + w, y + h);
    p.lineTo(x, y + h);
    p.close();
  }
  return p;
}

function mergePaths(paths: Path[]): Path {
  const out = new Path();
  for (const path of paths) {
    for (const cmd of path.commands) {
      out.commands.push(cmd);
    }
  }
  return out;
}

function glyph(
  name: string,
  unicode: number,
  advanceWidth: number,
  path: Path,
): Glyph {
  return new Glyph({ name, unicode, advanceWidth, path });
}

/**
 * Tiny geometric font for tests and offline fallback.
 * Coordinates are font units, y-up, unitsPerEm 1000.
 */
export function createTestFont(): Font {
  const notdef = glyph(".notdef", 0, 500, new Path());
  const space = glyph("space", 32, 400, new Path());

  const I = glyph("I", 73, 400, rectPath(100, 0, 200, 700, false));
  const i = glyph("i", 105, 400, rectPath(100, 0, 200, 700, false));

  const Opath = mergePaths([
    rectPath(50, 0, 700, 700, false),
    rectPath(250, 200, 300, 300, true),
  ]);
  const O = glyph("O", 79, 800, Opath);
  const o = glyph("o", 111, 800, Opath);

  const L = glyph(
    "L",
    76,
    600,
    mergePaths([rectPath(80, 0, 140, 700, false), rectPath(80, 0, 440, 140, false)]),
  );

  const Vpath = new Path();
  Vpath.moveTo(40, 700);
  Vpath.lineTo(200, 0);
  Vpath.lineTo(360, 700);
  Vpath.lineTo(280, 700);
  Vpath.lineTo(200, 180);
  Vpath.lineTo(120, 700);
  Vpath.close();
  const V = glyph("V", 86, 400, Vpath);
  const v = glyph("v", 118, 400, Vpath);

  const Dpath = mergePaths([
    rectPath(80, 0, 520, 700, false),
    rectPath(220, 160, 240, 380, true),
  ]);
  const D = glyph("D", 68, 680, Dpath);
  const d = glyph("d", 100, 680, Dpath);

  return new Font({
    familyName: "GlyphMatterTest",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [notdef, space, I, i, O, o, L, V, v, D, d],
  });
}
