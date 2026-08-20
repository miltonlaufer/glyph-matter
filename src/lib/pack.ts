import type { SamplePack } from "./types.ts";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Validate a pack object or JSON string. Throws if `v` is not `1` or fields are missing. */
export function parsePack(source: SamplePack | string | unknown): SamplePack {
  const data: unknown = typeof source === "string" ? JSON.parse(source) : source;
  if (!data || typeof data !== "object") {
    throw new Error("Sample pack is not an object");
  }
  const pack = data as SamplePack;
  if (pack.v !== 1) {
    throw new Error(`Unsupported sample pack version: ${String(pack.v)}`);
  }
  if (typeof pack.text !== "string") {
    throw new Error("Sample pack is missing text");
  }
  if (!Array.isArray(pack.points) || !Array.isArray(pack.glyphs)) {
    throw new Error("Sample pack is missing points or glyphs");
  }
  if (!pack.sampling || !pack.bounds || !pack.font) {
    throw new Error("Sample pack is missing sampling, bounds, or font metadata");
  }
  return pack;
}

/** `JSON.stringify` of a pack. */
export function packToJSON(pack: SamplePack, space = 0): string {
  return JSON.stringify(pack, null, space);
}

/** Shift a pack in world space without resampling. */
export function translatePack(pack: SamplePack, x: number, y: number): SamplePack {
  if (x === 0 && y === 0) return pack;
  return {
    ...pack,
    bounds: {
      x: pack.bounds.x + x,
      y: pack.bounds.y + y,
      w: pack.bounds.w,
      h: pack.bounds.h,
    },
    glyphs: pack.glyphs.map((g) => ({ ...g, x: g.x + x, y: g.y + y })),
    points: pack.points.map((p) => ({ ...p, x: p.x + x, y: p.y + y })),
  };
}

/** Scale about the pack's top-left bound. */
export function scalePack(pack: SamplePack, scale: number): SamplePack {
  if (scale === 1) return pack;
  const ox = pack.bounds.x;
  const oy = pack.bounds.y;
  const mapX = (x: number) => ox + (x - ox) * scale;
  const mapY = (y: number) => oy + (y - oy) * scale;
  return {
    ...pack,
    bounds: {
      x: ox,
      y: oy,
      w: pack.bounds.w * scale,
      h: pack.bounds.h * scale,
    },
    glyphs: pack.glyphs.map((g) => ({
      ...g,
      x: mapX(g.x),
      y: mapY(g.y),
      advance: g.advance * scale,
    })),
    points: pack.points.map((p) => ({ ...p, x: mapX(p.x), y: mapY(p.y) })),
    sampling: {
      ...pack.sampling,
      fontSize: pack.sampling.fontSize * scale,
      contourSpacing: pack.sampling.contourSpacing * scale,
      fillSpacing: pack.sampling.fillSpacing * scale,
    },
  };
}

/** Translate so the pack center sits on `(cx, cy)`. */
export function placePack(pack: SamplePack, cx: number, cy: number): SamplePack {
  const dx = cx - (pack.bounds.x + pack.bounds.w / 2);
  const dy = cy - (pack.bounds.y + pack.bounds.h / 2);
  return translatePack(pack, dx, dy);
}

/** ES module source: `export const <exportName> = { ... }`. */
export function packToModule(pack: SamplePack, exportName = "glyphPack"): string {
  if (!IDENT.test(exportName)) {
    throw new Error(`Invalid JS export name: ${exportName}`);
  }
  return `export const ${exportName} = ${JSON.stringify(pack)};\n`;
}
