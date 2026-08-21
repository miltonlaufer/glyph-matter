import type { GlyphMatter } from "./GlyphMatter.ts";
import { mergePacks, placePack, translatePack } from "./pack.ts";
import type { SamplePack } from "./types.ts";
import { collideVortex, type World } from "./world.ts";
import type { ParticleEffect } from "./effects.ts";

export type InBetween = "spring" | "dissolve";

export type AnimationStep = {
  /** Sampled with the current `GlyphMatter` settings. Omit when `pack` is set. */
  word?: string;
  /** Ready-made rest pose (image contours, a shipped pack). Wins over `word`. */
  pack?: SamplePack;
  /** World-space shift of the sampled word (layout origin). */
  x?: number;
  y?: number;
  gas?: number;
  legibility?: number;
  stiffness?: number;
  damping?: number;
  /** Seconds to rest as this word before the next step. */
  duration?: number;
  /**
   * How ink travels *to* this word from the previous one.
   * Ignored on the first step (that one is loaded, not morphed).
   */
  inBetween?: InBetween;
  /** Replace {@link World.effects} while this step is active. Omit to leave them. */
  effects?: ParticleEffect[];
};

export type SequenceOptions = {
  loop?: boolean;
  dissolveDropT?: number;
  dissolveT?: number;
  travelT?: number;
  formT?: number;
};

/** Timed two-words-into-one recipe for {@link Sequence.collide}. */
export type CollideSteps = {
  up: string | SamplePack;
  down: string | SamplePack;
  into: string | SamplePack;
  x?: number;
  y?: number;
  /** Vertical half-gap of the stacked pair, in em. Default `0.95`. */
  gap?: number;
  /** How close the pair sits at the meeting point, in em. Default `0.12`. */
  meet?: number;
  /** Force while they meet. Omit for a vortex; `false` for none. */
  effect?: ParticleEffect | false;
  apart?: number;
  collide?: number;
  hold?: number;
  gas?: number;
  stiffness?: number;
  damping?: number;
  legibility?: number;
};

type Phase = "idle" | "hold" | "dissolve" | "travel" | "form";

const DEFAULT_HOLD = 0.8;
const DISSOLVE_FLOOR = 0.04;
const DISSOLVE_GAS_LEGIBILITY = 0.3;

function ease(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

function easeOut(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return 1 - (1 - x) ** 3;
}

function dissolveLegibility(elapsed: number, restore: number, dropT: number): number {
  const u = Math.min(1, elapsed / Math.max(dropT, 1e-3));
  return restore + (DISSOLVE_FLOOR - restore) * easeOut(u);
}

/**
 * Timed list of words. Owns the dissolve / spring in-between; {@link World}
 * still does the physics. Call {@link Sequence.tick} from your own loop, or
 * skip this class and drive `world.morphTo` / `world.step` yourself.
 */
export class Sequence {
  steps: AnimationStep[] = [];
  index = -1;
  phase: Phase = "idle";
  elapsed = 0;
  loop: boolean;
  playing = false;
  /** Rest pose after dissolve / spring. The workbench slider writes this live. */
  restore = 1;

  dissolveDropT: number;
  dissolveT: number;
  travelT: number;
  formT: number;

  private dissolveFrom = 1;
  private nextIndex = 0;

  constructor(
    readonly gm: GlyphMatter,
    readonly world: World,
    options: SequenceOptions = {},
  ) {
    this.loop = options.loop ?? true;
    this.dissolveDropT = options.dissolveDropT ?? 0.28;
    this.dissolveT = options.dissolveT ?? 0.75;
    this.travelT = options.travelT ?? 0.85;
    this.formT = options.formT ?? 0.9;
  }

  addAnimationStep(step: AnimationStep): this {
    this.steps.push(step);
    return this;
  }

  addAnimationSteps(steps: AnimationStep[]): this {
    for (const step of steps) this.steps.push(step);
    return this;
  }

  /**
   * Abbreviation: stacked `up` + `down`, spring together, dissolve into `into`.
   * Uses {@link World.collide}'s layout; the vortex only runs on the meeting step.
   */
  collide(options: CollideSteps): this {
    const up = this.asPack(options.up);
    const down = this.asPack(options.down);
    const into = this.asPack(options.into);
    const em = up.sampling.fontSize;
    const x = options.x ?? 0;
    const y = options.y ?? 0;
    const gap = (options.gap ?? 0.95) * em;
    const meet = (options.meet ?? 0.12) * em;
    const pairApart = mergePacks(placePack(up, x, y - gap), placePack(down, x, y + gap));
    const pairMeet = mergePacks(placePack(up, x, y - meet), placePack(down, x, y + meet));
    const result = placePack(into, x, y);
    const smash =
      options.effect === false ? [] : [options.effect ?? collideVortex(x, y, em)];
    const restore = options.legibility ?? 1;
    return this.addAnimationSteps([
      {
        pack: pairApart,
        duration: options.apart ?? 1.55,
        stiffness: options.stiffness ?? 34,
        damping: options.damping ?? 10,
        gas: options.gas,
        legibility: restore,
        effects: [],
      },
      {
        pack: pairMeet,
        duration: options.collide ?? 1.4,
        inBetween: "spring",
        stiffness: 22,
        damping: 7,
        legibility: Math.max(0.72, restore * 0.88),
        effects: smash,
      },
      {
        pack: result,
        duration: options.hold ?? 2.8,
        inBetween: "dissolve",
        stiffness: 52,
        damping: 14,
        gas: 40,
        legibility: restore,
        effects: [],
      },
    ]);
  }

  clear(): this {
    this.steps = [];
    this.index = -1;
    this.phase = "idle";
    this.elapsed = 0;
    this.playing = false;
    return this;
  }

  /** Load the first word and start advancing on {@link Sequence.tick}. */
  play(): this {
    if (this.steps.length === 0) {
      throw new Error("Sequence has no steps. Call addAnimationStep() first.");
    }
    this.playing = true;
    if (this.phase === "idle" || this.index < 0) this.loadFirst();
    return this;
  }

  pause(): this {
    this.playing = false;
    return this;
  }

  /** Back to the first word, paused. */
  reset(): this {
    this.playing = false;
    this.phase = "idle";
    this.index = -1;
    this.elapsed = 0;
    if (this.steps[0]) this.applyPack(this.packFor(this.steps[0]), "load");
    return this;
  }

  /**
   * Advance the timeline, then {@link World.step}. Safe to call from rAF
   * even while paused (physics still run).
   */
  tick(dt: number): this {
    if (this.playing && this.steps.length > 0) this.advance(dt);
    this.world.step(dt);
    return this;
  }

  currentStep(): AnimationStep | null {
    return this.steps[this.index] ?? null;
  }

  private loadFirst(): void {
    const first = this.steps[0];
    if (!first) return;
    this.index = 0;
    this.nextIndex = 1 % this.steps.length;
    this.applyStepPhysics(first);
    this.applyPack(this.packFor(first), "load");
    this.phase = "hold";
    this.elapsed = 0;
    this.restore = first.legibility ?? 1;
    this.world.configure({ legibility: this.restore });
  }

  private asPack(source: string | SamplePack): SamplePack {
    return typeof source === "string" ? this.gm.samplePack(source) : source;
  }

  private packFor(step: AnimationStep): SamplePack {
    const packed = step.pack
      ? step.pack
      : step.word
        ? this.gm.samplePack(step.word)
        : null;
    if (!packed) {
      throw new Error("AnimationStep needs a word or a pack.");
    }
    return translatePack(packed, step.x ?? 0, step.y ?? 0);
  }

  private applyPack(pack: SamplePack, mode: "load" | "morph"): void {
    if (mode === "load") this.world.load(pack);
    else this.world.morphTo(pack, "origin");
  }

  private applyStepPhysics(step: AnimationStep): void {
    this.world.configure({
      gas: step.gas,
      stiffness: step.stiffness,
      damping: step.damping,
    });
    if (step.effects) {
      this.world.clearEffects();
      for (const effect of step.effects) this.world.addEffect(effect);
    }
  }

  private beginDissolve(fromLeg: number): void {
    this.phase = "dissolve";
    this.elapsed = 0.12;
    this.dissolveFrom = fromLeg;
    this.world.reclaim();
    this.world.scatter(95);
    this.world.configure({
      legibility: dissolveLegibility(this.elapsed, fromLeg, this.dissolveDropT),
    });
  }

  private goToNext(): void {
    if (this.steps.length === 0) {
      this.playing = false;
      this.phase = "idle";
      return;
    }
    if (this.nextIndex === 0 && !this.loop) {
      this.playing = false;
      this.phase = "hold";
      return;
    }
    const step = this.steps[this.nextIndex];
    if (!step) return;
    this.index = this.nextIndex;
    this.nextIndex = (this.index + 1) % this.steps.length;
    this.applyStepPhysics(step);
    this.restore = step.legibility ?? 1;
    const travel = step.inBetween ?? "dissolve";
    if (travel === "spring") {
      this.applyPack(this.packFor(step), "morph");
      this.phase = "hold";
      this.elapsed = 0;
      this.world.configure({ legibility: this.restore });
      return;
    }
    this.beginDissolve(this.world.legibility);
  }

  private advance(dt: number): void {
    this.elapsed += dt;
    const step = this.steps[this.index];
    const holdFor = step?.duration ?? DEFAULT_HOLD;

    if (this.phase === "hold" && this.elapsed >= holdFor) {
      this.goToNext();
    } else if (this.phase === "dissolve") {
      this.world.configure({
        legibility: dissolveLegibility(this.elapsed, this.dissolveFrom, this.dissolveDropT),
      });
      if (this.elapsed >= this.dissolveT) {
        const dest = this.steps[this.index];
        if (dest) this.applyPack(this.packFor(dest), "morph");
        this.phase = "travel";
        this.elapsed = 0;
        this.world.configure({ legibility: DISSOLVE_GAS_LEGIBILITY });
      }
    } else if (this.phase === "travel") {
      this.world.configure({ legibility: DISSOLVE_GAS_LEGIBILITY });
      if (this.elapsed >= this.travelT) {
        this.phase = "form";
        this.elapsed = 0;
      }
    } else if (this.phase === "form") {
      const u = Math.min(1, this.elapsed / Math.max(this.formT, 1e-3));
      this.world.configure({
        legibility:
          DISSOLVE_GAS_LEGIBILITY + (this.restore - DISSOLVE_GAS_LEGIBILITY) * ease(u),
      });
      if (u >= 1) {
        this.phase = "hold";
        this.elapsed = 0;
        this.world.configure({ legibility: this.restore });
      }
    }
  }
}
