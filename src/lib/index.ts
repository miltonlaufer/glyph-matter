/** Sample OpenType text into identity-preserving matter, then animate it. */
export { GlyphMatter } from "./GlyphMatter.ts";
export { loadFont, sampleText, layoutGlyphs } from "./font.ts";
export type { FontSource } from "./font.ts";
export { parsePack, packToJSON, packToModule, translatePack, scalePack, placePack } from "./pack.ts";
export { drawSamples, drawParticles, drawAutomata, drawRings, makeView, screenToWorld } from "./draw.ts";
export type { DrawFit, DrawSamplesOptions, View, DrawablePoint, AutomataGrid } from "./draw.ts";
export { displayInk, canvasDotRadius } from "./density.ts";
export { World } from "./world.ts";
export type { Particle, WorldOptions, WorldPointer } from "./world.ts";
export { applyEffect, windEnvelope } from "./effects.ts";
export type {
  ParticleEffect,
  WindEffect,
  AttractEffect,
  RepelEffect,
  GravityEffect,
  VortexEffect,
} from "./effects.ts";
export { Sequence } from "./sequence.ts";
export type { AnimationStep, SequenceOptions, InBetween } from "./sequence.ts";
export { sampleImage, sampleImageFromRgba, loadImagePixels } from "./image.ts";
export type { ImageSampleOptions } from "./image.ts";
export { spectrumEnergy, spectrumCentroid, bandEnergy, bandFlux, timeDomainEnergy, dominantHz, visualWavePeriod, visualBeatPeriod, lockWavePeriod, WAVE_FALLBACK_PERIOD, createOnsetPicker, pickOnset, createTempoFollow, followTempo, windFromSpectrum, windFromAnalyser } from "./audio.ts";
export type { WaveLock, OnsetPicker, TempoFollow } from "./audio.ts";
export { morphParticles } from "./morph.ts";
export type { MorphAlign, Morphable } from "./morph.ts";
export { Automata, stepAutomata, stepGrowth, bridgeMask } from "./automata.ts";
export type { AutomataRule, AutomataOptions, AutomataKind } from "./automata.ts";
export { DifferentialGrowth, ringsFromPack, splitLongEdges } from "./differential.ts";
export type { DiffNode, DifferentialOptions } from "./differential.ts";
export { createTestFont } from "./testFont.ts";
export { DEFAULT_OPTIONS } from "./types.ts";
export type {
  Bounds,
  FillRule,
  GlyphMatterOptions,
  GlyphRecord,
  SampleKind,
  SamplePack,
  SamplePoint,
  SamplingMode,
  Vec,
} from "./types.ts";
