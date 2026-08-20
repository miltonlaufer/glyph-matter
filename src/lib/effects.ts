import type { Particle } from "./world.ts";

export type WindEffect = {
  kind: "wind";
  /** Peak acceleration along x, world units / s². */
  vx: number;
  /** Peak acceleration along y, world units / s². */
  vy: number;
  /** Extra noisy gust mixed into the wind. */
  gust?: number;
  /**
   * Seconds per sawtooth cycle. Default `1.35`.
   * `0` = constant wind (no pulse).
   */
  period?: number;
  /**
   * World-space length of a gust along the wind direction. Default `240`.
   * `0` = every particle pulses together.
   */
  wavelength?: number;
};

export type AttractEffect = {
  kind: "attract";
  x: number;
  y: number;
  /** Acceleration toward the point at full strength. */
  strength: number;
  /** Ignore particles farther than this. Omit for infinite range. */
  radius?: number;
};

export type RepelEffect = {
  kind: "repel";
  x: number;
  y: number;
  strength: number;
  radius?: number;
};

/** Constant acceleration. Defaults to downward (positive y in this engine). */
export type GravityEffect = {
  kind: "gravity";
  x?: number;
  y?: number;
};

export type VortexEffect = {
  kind: "vortex";
  x: number;
  y: number;
  /** Tangential acceleration (positive = counterclockwise). */
  strength: number;
  radius?: number;
};

export type ParticleEffect =
  | WindEffect
  | AttractEffect
  | RepelEffect
  | GravityEffect
  | VortexEffect;

const DEFAULT_WIND_PERIOD = 1.35;
const DEFAULT_WIND_WAVELENGTH = 240;

function fract(x: number): number {
  return x - Math.floor(x);
}

/** Positive half of a bipolar sawtooth, in 0–1. */
export function windEnvelope(phase: number): number {
  return Math.max(0, 2 * fract(phase) - 1);
}

function falloff(distance: number, radius: number | undefined): number {
  if (radius === undefined || radius <= 0) return 1;
  if (distance >= radius) return 0;
  return 1 - distance / radius;
}

/** Add one effect's acceleration onto a particle. Called from {@link World.step}. */
export function applyEffect(
  effect: ParticleEffect,
  p: Particle,
  dt: number,
  time = 0,
): void {
  if (effect.kind === "wind") {
    const period = effect.period ?? DEFAULT_WIND_PERIOD;
    const wave = effect.wavelength ?? DEFAULT_WIND_WAVELENGTH;
    let env = 1;
    if (period > 0) {
      const speed = Math.hypot(effect.vx, effect.vy);
      const along =
        speed > 1e-6 ? (p.x * effect.vx + p.y * effect.vy) / speed : p.x;
      const phase = time / period - (wave > 0 ? along / wave : 0);
      env = windEnvelope(phase);
    }
    p.vx += effect.vx * env * dt;
    p.vy += effect.vy * env * dt;
    const gust = effect.gust ?? 0;
    if (gust > 0) {
      const s = gust * (0.3 + 0.7 * env) * Math.sqrt(dt);
      p.vx += (Math.random() * 2 - 1) * s;
      p.vy += (Math.random() * 2 - 1) * s;
    }
    return;
  }
  if (effect.kind === "gravity") {
    p.vx += (effect.x ?? 0) * dt;
    p.vy += (effect.y ?? 420) * dt;
    return;
  }
  const dx = effect.x - p.x;
  const dy = effect.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const mag = effect.strength * falloff(d, effect.radius) * dt;
  if (mag === 0) return;
  const ux = dx / d;
  const uy = dy / d;
  if (effect.kind === "attract") {
    p.vx += ux * mag;
    p.vy += uy * mag;
    return;
  }
  if (effect.kind === "repel") {
    p.vx -= ux * mag;
    p.vy -= uy * mag;
    return;
  }
  p.vx += -uy * mag;
  p.vy += ux * mag;
  p.vx += ux * mag * 0.18;
  p.vy += uy * mag * 0.18;
}
