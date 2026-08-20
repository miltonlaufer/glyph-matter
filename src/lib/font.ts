import { parse, type Font, type Glyph } from "opentype.js";
import { samplePath } from "./sample.ts";
import { boundsOf, round } from "./path.ts";
import type {
  GlyphRecord,
  GlyphMatterOptions,
  SamplePack,
  SamplePoint,
} from "./types.ts";
import { DEFAULT_OPTIONS } from "./types.ts";

export type FontSource = string | ArrayBuffer | ArrayBufferView | Font;

/** Glyph after horizontal layout (kerning applied). */
export type LaidOutGlyph = {
  char: string;
  glyph: Glyph;
  x: number;
  y: number;
  advance: number;
  wordIndex: number;
  isSpace: boolean;
};

function kerningBetween(font: Font, left: Glyph, right: Glyph): number {
  const f = font as Font & {
    kerningPairs?: Record<string, number>;
    position?: { defaultKerningTables?: unknown };
  };
  if (!f.position?.defaultKerningTables && !f.kerningPairs) return 0;
  return font.getKerningValue(left, right);
}

function isFont(source: FontSource): source is Font {
  return (
    typeof source === "object" &&
    source !== null &&
    "unitsPerEm" in source &&
    "charToGlyph" in source
  );
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

/** Parse a font from a URL, bytes, or an existing opentype.js `Font`. */
export async function loadFont(source: FontSource): Promise<Font> {
  if (isFont(source)) return source;
  if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Font fetch failed (${res.status}): ${source}`);
    }
    return parse(await res.arrayBuffer());
  }
  return parse(toArrayBuffer(source));
}

export function fontFamilyName(font: Font): string {
  const names = font.names as unknown as Record<string, { en?: string } | undefined>;
  return (
    names.fontFamily?.en ??
    names.fullName?.en ??
    names.postScriptName?.en ??
    "unknown"
  );
}

/** Horizontal layout with kerning. Newlines bump `wordIndex` without emitting a glyph. */
export function layoutGlyphs(
  font: Font,
  text: string,
  fontSize: number,
): LaidOutGlyph[] {
  const scale = fontSize / font.unitsPerEm;
  const chars = [...text];
  const out: LaidOutGlyph[] = [];
  let x = 0;
  let prev: Glyph | null = null;
  let wordIndex = 0;

  for (const ch of chars) {
    if (ch === "\n") {
      wordIndex += 1;
      prev = null;
      continue;
    }
    const glyph = font.charToGlyph(ch);
    if (prev) {
      x += kerningBetween(font, prev, glyph) * scale;
    }
    const isSpace = /\s/.test(ch);
    out.push({
      char: ch,
      glyph,
      x,
      y: 0,
      advance: (glyph.advanceWidth ?? 0) * scale,
      wordIndex,
      isSpace,
    });
    x += (glyph.advanceWidth ?? 0) * scale;
    if (isSpace) wordIndex += 1;
    prev = glyph;
  }
  return out;
}

/** Layout `text` and sample each glyph path into a {@link SamplePack}. */
export function sampleText(
  font: Font,
  text: string,
  options: Required<GlyphMatterOptions>,
): SamplePack {
  const laid = layoutGlyphs(font, text, options.fontSize);
  const glyphs: GlyphRecord[] = [];
  const points: SamplePoint[] = [];

  for (const g of laid) {
    if (g.isSpace && !options.includeSpaces) continue;
    const path = g.glyph.getPath(g.x, g.y, options.fontSize);
    const sampled = samplePath(path.commands, {
      samplingMode: options.samplingMode,
      contourSpacing: options.contourSpacing,
      fillSpacing: options.fillSpacing,
      fillRule: options.fillRule,
    });
    const i = glyphs.length;
    glyphs.push({
      i,
      ch: g.char,
      x: round(g.x),
      y: round(g.y),
      advance: round(g.advance),
      word: g.wordIndex,
    });
    for (const p of sampled.points) {
      points.push({ ...p, g: i });
    }
  }

  const bounds = boundsOf(points);
  return {
    v: 1,
    text,
    sampling: {
      mode: options.samplingMode,
      contourSpacing: options.contourSpacing,
      fillSpacing: options.fillSpacing,
      fontSize: options.fontSize,
      fillRule: options.fillRule,
    },
    font: {
      familyName: fontFamilyName(font),
      unitsPerEm: font.unitsPerEm,
    },
    bounds,
    glyphs,
    points,
  };
}

export function resolvedOptions(
  options: GlyphMatterOptions,
): Required<GlyphMatterOptions> {
  return { ...DEFAULT_OPTIONS, ...options };
}
