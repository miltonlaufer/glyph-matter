import { boundsOf } from "./path.ts";
import { morphParticles, type MorphAlign } from "./morph.ts";
import { applyEffect, type ParticleEffect } from "./effects.ts";
import type { GlyphRecord, SampleKind, SamplePack } from "./types.ts";

/** Live sample with velocity. `homeX`/`homeY` are the rest pose. */
export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  g: number;
  k: SampleKind;
  c?: number;
  t?: number;
  /** 0–1 opacity; new points fade in. */
  life?: number;
  /** Spare ink from a longer word; removed when it reaches home. */
  exit?: boolean;
};

export type WorldPointer = {
  x: number;
  y: number;
  down: boolean;
};

export type WorldOptions = {
  /** 1 = rest as letters, 0 = gas. */
  legibility?: number;
  stiffness?: number;
  damping?: number;
  gas?: number;
  mouseRadius?: number;
  mouseForce?: number;
  /** Seconds for spare points to fade out / new points to fade in. */
  fade?: number;
};

/**
 * Particle field for a sampled word. Springs pull toward homes;
 * `legibility` interpolates between letter and gas. {@link World.morphTo}
 * retargets homes so ink travels from one word to another.
 */
export class World {
  particles: Particle[] = [];
  glyphs: GlyphRecord[] = [];
  fontSize = 160;
  legibility = 1;
  stiffness = 28;
  damping = 7;
  gas = 90;
  mouseRadius = 90;
  mouseForce = 2800;
  fade = 0.55;
  pointer: WorldPointer | null = null;
  effects: ParticleEffect[] = [];
  /** Seconds simulated, for pulsing wind. */
  elapsed = 0;

  /** Patch physics knobs (`legibility`, springs, gas, pointer, fade). */
  configure(options: WorldOptions): this {
    if (options.legibility !== undefined) this.legibility = options.legibility;
    if (options.stiffness !== undefined) this.stiffness = options.stiffness;
    if (options.damping !== undefined) this.damping = options.damping;
    if (options.gas !== undefined) this.gas = options.gas;
    if (options.mouseRadius !== undefined) this.mouseRadius = options.mouseRadius;
    if (options.mouseForce !== undefined) this.mouseForce = options.mouseForce;
    if (options.fade !== undefined) this.fade = options.fade;
    return this;
  }

  /**
   * Load a new rest pose. Existing particles keep their current position
   * and velocity when the count matches by index, so a text change can
   * animate toward the new letters.
   */
  load(pack: SamplePack): this {
    const prev = this.particles;
    this.glyphs = pack.glyphs.map((g) => ({ ...g }));
    this.fontSize = pack.sampling.fontSize;
    this.particles = pack.points.map((p, i) => {
      const old = prev[i];
      if (old) {
        return {
          x: old.x,
          y: old.y,
          vx: old.vx,
          vy: old.vy,
          homeX: p.x,
          homeY: p.y,
          g: p.g,
          k: p.k,
          c: p.c,
          t: p.t,
          life: 1,
          exit: false,
        };
      }
      return {
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        homeX: p.x,
        homeY: p.y,
        g: p.g,
        k: p.k,
        c: p.c,
        t: p.t,
        life: 1,
        exit: false,
      };
    });
    return this;
  }

  /**
   * Extra ink is still matter: it can rematch on the next morph
   * instead of dying in the dissolving cloud.
   */
  reclaim(): this {
    for (const p of this.particles) {
      p.exit = false;
      p.life = 1;
    }
    return this;
  }

  /** Add a random impulse to living particles. */
  scatter(strength = 420): this {
    for (const p of this.particles) {
      if (p.exit) continue;
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * strength;
      p.vx += Math.cos(a) * s;
      p.vy += Math.sin(a) * s;
    }
    return this;
  }

  /** Append a force (wind, attract, gravity, vortex, repel). Applied every {@link World.step}. */
  addEffect(effect: ParticleEffect): this {
    this.effects.push(effect);
    return this;
  }

  /** Drop all extra forces. Pointer repulsion is separate (`pointer`). */
  clearEffects(): this {
    this.effects = [];
    return this;
  }

  /** Snap every particle to its home and zero velocity. */
  home(): this {
    for (const p of this.particles) {
      p.x = p.homeX;
      p.y = p.homeY;
      p.vx = 0;
      p.vy = 0;
    }
    return this;
  }

  /**
   * Retarget homes to another sampled word. Live positions stay put
   * so the spring animates one letterform into the other.
   */
  morphTo(pack: SamplePack, align: MorphAlign = "origin"): this {
    this.particles = morphParticles(
      this.particles,
      pack.points,
      align,
      this.glyphs,
      pack.glyphs,
    );
    this.glyphs = pack.glyphs.map((g) => {
      let x = g.x;
      let min = Infinity;
      for (const p of this.particles) {
        if (p.exit || p.g !== g.i) continue;
        min = Math.min(min, p.homeX);
      }
      if (Number.isFinite(min)) x = min;
      return { ...g, x };
    });
    this.fontSize = pack.sampling.fontSize;
    return this;
  }

  /** Axis-aligned box of living particles' homes. */
  homeBounds() {
    const living = this.particles.filter((p) => !p.exit);
    return boundsOf(
      (living.length ? living : this.particles).map((p) => ({
        x: p.homeX,
        y: p.homeY,
      })),
    );
  }

  /** Average distance from living particles to their homes. */
  meanHomeDistance(): number {
    const living = this.particles.filter((p) => !p.exit);
    if (living.length === 0) return 0;
    let sum = 0;
    for (const p of living) {
      sum += Math.hypot(p.x - p.homeX, p.y - p.homeY);
    }
    return sum / living.length;
  }

  /**
   * Integrate springs, gas, pointer, extra effects, and drag.
   * @param dt Seconds since last frame; clamped to at most 1/30.
   */
  step(dt: number): this {
    const t = Math.min(Math.max(dt, 0), 1 / 30);
    if (t === 0) return this;
    this.elapsed += t;
    const legibility = Math.min(1, Math.max(0, this.legibility));
    const k = this.stiffness * legibility;
    const c = this.damping * (0.35 + 0.65 * legibility);
    const gas = this.gas * (1 - legibility);
    const drag = Math.exp(-c * t);
    const pointer = this.pointer;
    const r = this.mouseRadius;
    const r2 = r * r;
    const mouseBoost = pointer?.down ? 1.8 : 1;

    const fade = Math.max(this.fade, 1e-3);
    const arrive = Math.max(6, this.fontSize * 0.06);
    const alive: Particle[] = [];
    for (const p of this.particles) {
      const life = p.life ?? 1;
      if (!p.exit && life < 1) {
        p.life = Math.min(1, life + t / fade);
      }
      p.vx += (p.homeX - p.x) * k * t;
      p.vy += (p.homeY - p.y) * k * t;
      if (gas > 0) {
        p.vx += (Math.random() * 2 - 1) * gas * Math.sqrt(t);
        p.vy += (Math.random() * 2 - 1) * gas * Math.sqrt(t);
      }
      if (pointer) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const falloff = (1 - d / r) ** 2;
          const f = falloff * this.mouseForce * mouseBoost * t;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      // Springs of size `k` cancel a raw extra accel. Scale so wind/wells
      // still lean a formed word instead of vanishing at legibility 1.
      const effectDt = t * (1 + k / 4);
      for (const effect of this.effects) applyEffect(effect, p, effectDt, this.elapsed);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * t;
      p.y += p.vy * t;
      if (p.exit) {
        const d = Math.hypot(p.homeX - p.x, p.homeY - p.y);
        if (d <= arrive) continue;
      }
      alive.push(p);
    }
    this.particles = alive;
    return this;
  }
}
