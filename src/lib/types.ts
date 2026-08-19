export type SamplingMode = "contour" | "fill" | "both";
export type FillRule = "nonzero" | "evenodd";

export type GlyphMatterOptions = {
  /** How to turn a glyph into points. Used only when sampling from a font. */
  samplingMode?: SamplingMode;
  /** Distance along flattened outlines between contour samples, in pixels. */
  contourSpacing?: number;
  /** Grid step for interior samples, in pixels. */
  fillSpacing?: number;
  fontSize?: number;
  fillRule?: FillRule;
  includeSpaces?: boolean;
};

export type Vec = {
  x: number;
  y: number;
};

export type Bounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SampleKind = "contour" | "fill";

export type SamplePoint = {
  x: number;
  y: number;
  /** Index into `SamplePack.glyphs`. */
  g: number;
  k: SampleKind;
  /** Which outline of the glyph, when `k` is `"contour"`. */
  c?: number;
  /** 0–1 position along that outline. */
  t?: number;
};

export type GlyphRecord = {
  i: number;
  ch: string;
  x: number;
  y: number;
  advance: number;
  word: number;
};

export type SamplePack = {
  v: 1;
  text: string;
  sampling: {
    mode: SamplingMode;
    contourSpacing: number;
    fillSpacing: number;
    fontSize: number;
    fillRule: FillRule;
  };
  font: {
    familyName: string;
    unitsPerEm: number;
  };
  bounds: Bounds;
  glyphs: GlyphRecord[];
  points: SamplePoint[];
};

export const DEFAULT_OPTIONS: Required<GlyphMatterOptions> = {
  samplingMode: "contour",
  contourSpacing: 4,
  fillSpacing: 6,
  fontSize: 160,
  fillRule: "nonzero",
  includeSpaces: false,
};
