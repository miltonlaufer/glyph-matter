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

/** ES module source: `export const <exportName> = { ... }`. */
export function packToModule(pack: SamplePack, exportName = "glyphPack"): string {
  if (!IDENT.test(exportName)) {
    throw new Error(`Invalid JS export name: ${exportName}`);
  }
  return `export const ${exportName} = ${JSON.stringify(pack)};\n`;
}
