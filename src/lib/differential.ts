import type { SamplePack, SamplePoint } from "./types.ts";

export type DiffNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type DifferentialOptions = {
  speed?: number;
  splitLen?: number;
  maxNodes?: number;
};

type Bucket = DiffNode[];

function hypot2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function median(values: number[]): number {
  if (values.length === 0) return 8;
  const s = [...values].sort((a, b) => a - b);
  const mid = s[s.length >> 1];
  return mid ?? 8;
}

function contourRings(pack: SamplePack): DiffNode[][] {
  const byKey = new Map<string, SamplePoint[]>();
  for (const p of pack.points) {
    if (p.k !== "contour") continue;
    const key = `${p.g}:${p.c ?? 0}`;
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }
  const rings: DiffNode[][] = [];
  for (const pts of byKey.values()) {
    pts.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    if (pts.length < 3) continue;
    rings.push(pts.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0 })));
  }
  return rings;
}

/** Fill-only packs: one ring per glyph, wound by angle around the centroid. */
function fillRings(pack: SamplePack): DiffNode[][] {
  const byGlyph = new Map<number, SamplePoint[]>();
  for (const p of pack.points) {
    const list = byGlyph.get(p.g);
    if (list) list.push(p);
    else byGlyph.set(p.g, [p]);
  }
  const rings: DiffNode[][] = [];
  for (const pts of byGlyph.values()) {
    if (pts.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    const ordered = [...pts].sort(
      (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
    );
    rings.push(ordered.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0 })));
  }
  return rings;
}

export function ringsFromPack(pack: SamplePack): DiffNode[][] {
  const contour = contourRings(pack);
  return contour.length > 0 ? contour : fillRings(pack);
}

function edgeLengths(rings: DiffNode[][]): number[] {
  const out: number[] = [];
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      if (!a || !b) continue;
      out.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
  }
  return out;
}

export function splitLongEdges(
  ring: DiffNode[],
  maxLen: number,
  budget: number,
): DiffNode[] {
  if (ring.length < 2 || budget <= 0) return ring;
  const out: DiffNode[] = [];
  const n = ring.length;
  const maxLen2 = maxLen * maxLen;
  let inserted = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (!a) continue;
    out.push(a);
    if (!b || inserted >= budget) continue;
    const d2 = hypot2(a.x, a.y, b.x, b.y);
    if (d2 <= maxLen2) continue;
    const d = Math.sqrt(d2);
    const nx = -(b.y - a.y) / d;
    const ny = (b.x - a.x) / d;
    const bump = maxLen * 0.1;
    out.push({
      x: (a.x + b.x) * 0.5 + nx * bump,
      y: (a.y + b.y) * 0.5 + ny * bump,
      vx: (a.vx + b.vx) * 0.5,
      vy: (a.vy + b.vy) * 0.5,
    });
    inserted += 1;
  }
  return out;
}

function hashKey(x: number, y: number, cell: number): string {
  return `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
}

function buildHash(nodes: DiffNode[], cell: number): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  for (const n of nodes) {
    const key = hashKey(n.x, n.y, cell);
    const bucket = map.get(key);
    if (bucket) bucket.push(n);
    else map.set(key, [n]);
  }
  return map;
}

function nearest(
  x: number,
  y: number,
  hash: Map<string, Bucket>,
  cell: number,
  fallback: DiffNode[],
): DiffNode | null {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  let best: DiffNode | null = null;
  let bestD = Infinity;
  for (let gy = -2; gy <= 2; gy++) {
    for (let gx = -2; gx <= 2; gx++) {
      const bucket = hash.get(`${cx + gx},${cy + gy}`);
      if (!bucket) continue;
      for (const t of bucket) {
        const d = hypot2(x, y, t.x, t.y);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
  }
  if (best) return best;
  for (const t of fallback) {
    const d = hypot2(x, y, t.x, t.y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * Differential growth on glyph outlines (split long edges, locally
 * repel, smooth the chain). Used as a word→word in-between: growth
 * is strong at first, then nodes are pulled onto the target word.
 */
export class DifferentialGrowth {
  rings: DiffNode[][] = [];
  splitLen = 8;
  maxNodes = 2800;
  speed = 10;
  progress = 0;

  private targets: DiffNode[] = [];
  private targetHash = new Map<string, Bucket>();
  private targetCell = 12;
  private acc = 0;

  configure(options: DifferentialOptions): this {
    if (options.speed !== undefined) this.speed = Math.min(24, Math.max(1, options.speed));
    if (options.splitLen !== undefined) this.splitLen = options.splitLen;
    if (options.maxNodes !== undefined) this.maxNodes = options.maxNodes;
    return this;
  }

  get empty(): boolean {
    return this.rings.length === 0;
  }

  nodeCount(): number {
    let n = 0;
    for (const ring of this.rings) n += ring.length;
    return n;
  }

  seedMorph(from: SamplePack, to: SamplePack): this {
    this.rings = ringsFromPack(from).map((ring) =>
      ring.map((n) => ({ ...n, vx: 0, vy: 0 })),
    );
    this.targets = ringsFromPack(to).flat();
    const edges = edgeLengths(this.rings);
    this.splitLen = Math.max(3.5, Math.min(18, median(edges) * 1.25));
    this.targetCell = Math.max(this.splitLen, 8);
    this.targetHash = buildHash(this.targets, this.targetCell);
    this.progress = 0;
    this.acc = 0;
    return this;
  }

  setProgress(u: number): this {
    this.progress = Math.min(1, Math.max(0, u));
    return this;
  }

  clear(): this {
    this.rings = [];
    this.targets = [];
    this.targetHash = new Map();
    this.progress = 0;
    this.acc = 0;
    return this;
  }

  step(dt: number): this {
    const t = Math.min(Math.max(dt, 0), 1 / 30);
    if (t === 0 || this.empty) return this;
    this.split();
    this.forces(t);
    return this;
  }

  tick(dt: number): this {
    if (this.empty || this.speed <= 0) return this;
    this.acc += dt * (this.speed / 10);
    const steps = Math.min(6, Math.floor(this.acc * 2));
    this.acc -= steps / 2;
    const h = 1 / 60;
    for (let i = 0; i < steps; i++) this.step(h);
    return this;
  }

  private split(): void {
    const budget = this.maxNodes - this.nodeCount();
    if (budget <= 0) return;
    let left = budget;
    const next: DiffNode[][] = [];
    for (const ring of this.rings) {
      const share = Math.max(1, Math.floor(left / Math.max(1, this.rings.length)));
      const grown = splitLongEdges(ring, this.splitLen, share);
      left -= Math.max(0, grown.length - ring.length);
      next.push(grown);
    }
    this.rings = next;
  }

  private forces(t: number): void {
    const rest = this.splitLen * 0.62;
    const rest2 = rest * rest;
    const radius = this.splitLen * 1.7;
    const radius2 = radius * radius;
    const cell = radius;
    const grow = (1 - this.progress) * (1 - this.progress);
    const settle = this.progress * this.progress;
    const all: DiffNode[] = [];
    for (const ring of this.rings) for (const n of ring) all.push(n);
    const hash = buildHash(all, cell);
    const drag = Math.exp(-5.5 * t);

    for (const ring of this.rings) {
      const n = ring.length;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const p = ring[i];
        const prev = ring[(i + n - 1) % n];
        const next = ring[(i + 1) % n];
        if (!p || !prev || !next) continue;

        const ax = prev.x - p.x;
        const ay = prev.y - p.y;
        const bx = next.x - p.x;
        const by = next.y - p.y;
        const da = Math.hypot(ax, ay) || 1e-6;
        const db = Math.hypot(bx, by) || 1e-6;
        p.vx += (ax / da) * (da - rest) * 18 * t;
        p.vy += (ay / da) * (da - rest) * 18 * t;
        p.vx += (bx / db) * (db - rest) * 18 * t;
        p.vy += (by / db) * (db - rest) * 18 * t;

        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1e-6;
        const nx = -ty / tl;
        const ny = tx / tl;
        const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (da * db)));
        const curve = 1 - dot;
        p.vx += nx * curve * 22 * grow * t;
        p.vy += ny * curve * 22 * grow * t;

        const cx = Math.floor(p.x / cell);
        const cy = Math.floor(p.y / cell);
        for (let gy = -1; gy <= 1; gy++) {
          for (let gx = -1; gx <= 1; gx++) {
            const bucket = hash.get(`${cx + gx},${cy + gy}`);
            if (!bucket) continue;
            for (const o of bucket) {
              if (o === p) continue;
              const d2 = hypot2(p.x, p.y, o.x, o.y);
              if (d2 < 1e-8 || d2 > radius2) continue;
              const d = Math.sqrt(d2);
              const push = (1 - d / radius) * 28 * t;
              p.vx += ((p.x - o.x) / d) * push;
              p.vy += ((p.y - o.y) / d) * push;
            }
          }
        }

        if (settle > 0.02 && this.targets.length > 0) {
          const goal = nearest(p.x, p.y, this.targetHash, this.targetCell, this.targets);
          if (goal) {
            p.vx += (goal.x - p.x) * (12 + 40 * settle) * t;
            p.vy += (goal.y - p.y) * (12 + 40 * settle) * t;
          }
        }

        p.vx *= drag;
        p.vy *= drag;
        const speed2 = p.vx * p.vx + p.vy * p.vy;
        const cap = rest2 * 400;
        if (speed2 > cap) {
          const s = Math.sqrt(cap / speed2);
          p.vx *= s;
          p.vy *= s;
        }
        p.x += p.vx * t;
        p.y += p.vy * t;
      }
    }
  }
}
