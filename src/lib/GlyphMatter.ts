import { loadFont, resolvedOptions, sampleText, type FontSource } from "./font.ts";
import { packToJSON, packToModule, parsePack } from "./pack.ts";
import type { Font } from "opentype.js";
import type {
  GlyphMatterOptions,
  SamplePack,
  SamplePoint,
  SamplingMode,
} from "./types.ts";

export class GlyphMatter {
  samplingMode: SamplingMode;
  contourSpacing: number;
  fillSpacing: number;
  fontSize: number;
  fillRule: Required<GlyphMatterOptions>["fillRule"];
  includeSpaces: boolean;

  private font: Font | null = null;
  private text = "";
  private pack: SamplePack | null = null;

  constructor(options: GlyphMatterOptions = {}) {
    const resolved = resolvedOptions(options);
    this.samplingMode = resolved.samplingMode;
    this.contourSpacing = resolved.contourSpacing;
    this.fillSpacing = resolved.fillSpacing;
    this.fontSize = resolved.fontSize;
    this.fillRule = resolved.fillRule;
    this.includeSpaces = resolved.includeSpaces;
  }

  configure(options: GlyphMatterOptions): this {
    if (options.samplingMode !== undefined) this.samplingMode = options.samplingMode;
    if (options.contourSpacing !== undefined) this.contourSpacing = options.contourSpacing;
    if (options.fillSpacing !== undefined) this.fillSpacing = options.fillSpacing;
    if (options.fontSize !== undefined) this.fontSize = options.fontSize;
    if (options.fillRule !== undefined) this.fillRule = options.fillRule;
    if (options.includeSpaces !== undefined) this.includeSpaces = options.includeSpaces;
    return this;
  }

  /**
   * Parse a font now and sample `text`. Keep the font in memory so
   * `resample()` can run again after changing sampling settings.
   */
  async sampleFromFont(font: FontSource, text: string): Promise<this> {
    this.font = await loadFont(font);
    this.text = text;
    this.pack = sampleText(this.font, this.text, this.snapshotOptions());
    return this;
  }

  /**
   * Sample `text` from the loaded font without replacing the current pack.
   * Throws if the current samples came from a pack and no font is loaded.
   */
  samplePack(text: string): SamplePack {
    if (!this.font) {
      throw new Error(
        "No font loaded. Call sampleFromFont() for live sampling, or loadSamples() for a shipped pack.",
      );
    }
    return sampleText(this.font, text, this.snapshotOptions());
  }

  /**
   * Sample again from the font last passed to `sampleFromFont`.
   * Pass `text` to change the string without reloading the font.
   * Throws if the current samples came from a pack and no font is loaded.
   */
  resample(text?: string): this {
    if (text !== undefined) this.text = text;
    this.pack = this.samplePack(this.text);
    return this;
  }

  /** Frozen sample pack to ship with a work (also see exportSamplesJSON / Module). */
  exportSamples(): SamplePack {
    if (!this.pack) throw new Error("Nothing sampled yet");
    return structuredClone(this.pack);
  }

  exportSamplesJSON(space = 0): string {
    return packToJSON(this.exportSamples(), space);
  }

  /** Embeddable ES module: `export const glyphPack = { ... }` */
  exportSamplesModule(exportName = "glyphPack"): string {
    return packToModule(this.exportSamples(), exportName);
  }

  /**
   * Use samples that were exported earlier. No font is required.
   * Accepts a pack object or a JSON string.
   */
  loadSamples(source: SamplePack | string): this {
    const pack = parsePack(source);
    this.pack = pack;
    this.text = pack.text;
    this.samplingMode = pack.sampling.mode;
    this.contourSpacing = pack.sampling.contourSpacing;
    this.fillSpacing = pack.sampling.fillSpacing;
    this.fontSize = pack.sampling.fontSize;
    this.fillRule = pack.sampling.fillRule;
    this.font = null;
    return this;
  }

  getPack(): SamplePack | null {
    return this.pack;
  }

  getPoints(): SamplePoint[] {
    return this.pack?.points ?? [];
  }

  getText(): string {
    return this.text;
  }

  hasFont(): boolean {
    return this.font !== null;
  }

  private snapshotOptions(): Required<GlyphMatterOptions> {
    return {
      samplingMode: this.samplingMode,
      contourSpacing: this.contourSpacing,
      fillSpacing: this.fillSpacing,
      fontSize: this.fontSize,
      fillRule: this.fillRule,
      includeSpaces: this.includeSpaces,
    };
  }
}
