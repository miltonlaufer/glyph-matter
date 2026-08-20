import type { Bounds, SamplePack } from "./types.ts";

export type AutomataRule = "life" | "seeds" | "brain";
export type AutomataKind = "ca" | "growth";

export type AutomataOptions = {
  rule?: AutomataRule;
  kind?: AutomataKind;
  /** Generations per second. */
  speed?: number;
  /** Live cells may only exist on the original letter. */
  confine?: boolean;
};

const DEFAULT_SPEED = 8;
const PAD = 8;
const INF = 32767;

function neighborLive(
  cells: Uint8Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
  firingOnly: boolean,
): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = col + dx;
      const y = row + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const s = cells[y * cols + x] ?? 0;
      if (firingOnly ? s === 1 : s > 0) n += 1;
    }
  }
  return n;
}

/**
 * One generation. `mask` 1 = allowed cells. Brain uses 0 empty,
 * 1 firing, 2 refractory. Life and Seeds use 0/1.
 */
export function stepAutomata(
  prev: Uint8Array,
  next: Uint8Array,
  cols: number,
  rows: number,
  rule: AutomataRule,
  mask: Uint8Array | null,
): void {
  const firingOnly = rule === "brain";
  const n = cols * rows;
  for (let i = 0; i < n; i++) {
    if (mask && mask[i] === 0) {
      next[i] = 0;
      continue;
    }
    const col = i % cols;
    const row = (i / cols) | 0;
    const s = prev[i] ?? 0;
    const neigh = neighborLive(prev, cols, rows, col, row, firingOnly);
    if (rule === "life") {
      next[i] = s ? (neigh === 2 || neigh === 3 ? 1 : 0) : neigh === 3 ? 1 : 0;
    } else if (rule === "seeds") {
      next[i] = s ? 0 : neigh === 2 ? 1 : 0;
    } else if (s === 1) {
      next[i] = 2;
    } else if (s === 2) {
      next[i] = 0;
    } else {
      next[i] = neigh === 2 ? 1 : 0;
    }
  }
}

/** Eden / morphogenesis: dilate live ink into `allow`, die outside it. */
export function stepGrowth(
  prev: Uint8Array,
  next: Uint8Array,
  cols: number,
  rows: number,
  allow: Uint8Array,
): void {
  const n = cols * rows;
  for (let i = 0; i < n; i++) {
    if (allow[i] === 0) {
      next[i] = 0;
      continue;
    }
    if (prev[i]) {
      next[i] = 1;
      continue;
    }
    const col = i % cols;
    const row = (i / cols) | 0;
    next[i] = neighborLive(prev, cols, rows, col, row, false) > 0 ? 1 : 0;
  }
}

function cellSizeOf(bounds: Bounds): number {
  const area = Math.max(1, bounds.w * bounds.h);
  if (area <= 220_000) return 1;
  return Math.ceil(Math.sqrt(area / 220_000));
}

function stampRadius(pack: SamplePack, cell: number, kind: AutomataKind): number {
  if (kind === "growth") return 1;
  const spacing =
    pack.sampling.mode === "contour"
      ? pack.sampling.contourSpacing
      : pack.sampling.fillSpacing;
  return Math.max(1, Math.round((spacing * 0.45) / cell));
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

function rasterize(
  pack: SamplePack,
  originX: number,
  originY: number,
  cell: number,
  cols: number,
  rows: number,
  stamp = 0,
): Uint8Array {
  const mask = new Uint8Array(cols * rows);
  const r = Math.max(0, stamp);
  const r2 = (r + 0.25) * (r + 0.25);
  for (const p of pack.points) {
    const col0 = Math.floor((p.x - originX) / cell);
    const row0 = Math.floor((p.y - originY) / cell);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const col = col0 + dx;
        const row = row0 + dy;
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        mask[row * cols + col] = 1;
      }
    }
  }
  return mask;
}

function distanceField(seeds: Uint8Array, cols: number, rows: number): Int16Array {
  const dist = new Int16Array(cols * rows).fill(INF);
  const qx: number[] = [];
  const qy: number[] = [];
  for (let i = 0; i < seeds.length; i++) {
    if (!seeds[i]) continue;
    dist[i] = 0;
    qx.push(i % cols);
    qy.push((i / cols) | 0);
  }
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (let q = 0; q < qx.length; q++) {
    const x = qx[q];
    const y = qy[q];
    if (x === undefined || y === undefined) continue;
    const d = dist[y * cols + x] ?? INF;
    for (const dir of dirs) {
      const dx = dir[0] ?? 0;
      const dy = dir[1] ?? 0;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      const nd = d + 1;
      if (nd < (dist[j] ?? INF)) {
        dist[j] = nd;
        qx.push(nx);
        qy.push(ny);
      }
    }
  }
  return dist;
}

/** Shortest-path corridor between two letter masks. */
export function bridgeMask(
  from: Uint8Array,
  to: Uint8Array,
  cols: number,
  rows: number,
): Uint8Array {
  const n = cols * rows;
  const out = new Uint8Array(n);
  const dA = distanceField(from, cols, rows);
  const dB = distanceField(to, cols, rows);
  let minSum = INF;
  for (let i = 0; i < n; i++) {
    const sum = (dA[i] ?? INF) + (dB[i] ?? INF);
    if (sum < minSum) minSum = sum;
  }
  if (minSum >= INF) return out;
  const slack = 6;
  for (let i = 0; i < n; i++) {
    if ((dA[i] ?? INF) + (dB[i] ?? INF) <= minSum + slack) out[i] = 1;
  }
  return out;
}

function fillAllow(
  out: Uint8Array,
  fromMask: Uint8Array,
  toMask: Uint8Array,
  bridge: Uint8Array,
  progress: number,
): void {
  const keepSrc = progress < 0.62;
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const target = toMask[i] === 1;
    const source = keepSrc && (fromMask[i] === 1 || bridge[i] === 1);
    out[i] = target || source ? 1 : 0;
  }
}

/**
 * Pixel grid over letter masks. Field mode ({@link Automata.seedFromPack}) or
 * word→word in-between ({@link Automata.seedMorph}).
 */
export class Automata {
  cols = 0;
  rows = 0;
  cell = 4;
  originX = 0;
  originY = 0;
  cells = new Uint8Array(0);
  mask = new Uint8Array(0);
  fromMask = new Uint8Array(0);
  toMask = new Uint8Array(0);
  bridge = new Uint8Array(0);
  rule: AutomataRule = "life";
  kind: AutomataKind = "ca";
  speed = DEFAULT_SPEED;
  confine = true;
  progress = 0;
  morphing = false;

  private seed = new Uint8Array(0);
  private scratch = new Uint8Array(0);
  private allow = new Uint8Array(0);
  private acc = 0;

  /** Patch rule, kind, speed, and confine. */
  configure(options: AutomataOptions): this {
    if (options.rule !== undefined) this.rule = options.rule;
    if (options.kind !== undefined) this.kind = options.kind;
    if (options.speed !== undefined) this.speed = Math.min(24, Math.max(1, options.speed));
    if (options.confine !== undefined) this.confine = options.confine;
    return this;
  }

  get empty(): boolean {
    return this.cols === 0 || this.rows === 0;
  }

  /** Count of cells with value `1`. */
  liveCount(): number {
    let n = 0;
    for (const s of this.cells) if (s === 1) n += 1;
    return n;
  }

  private layout(bounds: Bounds, cell: number, pad: number): void {
    this.cell = cell;
    this.originX = bounds.x - pad * cell;
    this.originY = bounds.y - pad * cell;
    this.cols = Math.max(1, Math.ceil(bounds.w / cell) + pad * 2);
    this.rows = Math.max(1, Math.ceil(bounds.h / cell) + pad * 2);
  }

  /** Rasterize one word. Field / playground mode. */
  seedFromPack(pack: SamplePack): this {
    const cell = cellSizeOf(pack.bounds);
    const pad = this.confine ? 2 : PAD;
    this.layout(pack.bounds, cell, pad);
    const n = this.cols * this.rows;
    const stamp = stampRadius(pack, cell, this.kind);
    const mask = rasterize(
      pack,
      this.originX,
      this.originY,
      this.cell,
      this.cols,
      this.rows,
      stamp,
    );
    this.mask = new Uint8Array(mask);
    this.fromMask = new Uint8Array(mask);
    this.toMask = new Uint8Array(mask);
    this.bridge = new Uint8Array(n);
    this.cells = new Uint8Array(mask);
    this.seed = new Uint8Array(mask);
    this.scratch = new Uint8Array(n);
    this.allow = new Uint8Array(mask);
    this.progress = 0;
    this.acc = 0;
    this.morphing = false;
    return this;
  }

  /**
   * Shared grid for a word→word morph. Live ink starts on `from`;
   * `to` is the shape to grow or confine into.
   */
  seedMorph(from: SamplePack, to: SamplePack): this {
    const bounds = unionBounds(from.bounds, to.bounds);
    const cell = cellSizeOf(bounds);
    this.layout(bounds, cell, PAD);
    const cols = this.cols;
    const rows = this.rows;
    const n = cols * rows;
    const fromStamp = stampRadius(from, cell, this.kind);
    const toStamp = stampRadius(to, cell, this.kind);
    this.fromMask = new Uint8Array(
      rasterize(from, this.originX, this.originY, cell, cols, rows, fromStamp),
    );
    this.toMask = new Uint8Array(
      rasterize(to, this.originX, this.originY, cell, cols, rows, toStamp),
    );
    this.bridge = new Uint8Array(bridgeMask(this.fromMask, this.toMask, cols, rows));
    this.cells = new Uint8Array(this.fromMask);
    this.seed = new Uint8Array(this.fromMask);
    this.scratch = new Uint8Array(n);
    this.allow = new Uint8Array(n);
    this.mask = this.allow;
    this.progress = 0;
    this.acc = 0;
    this.morphing = true;
    this.refreshAllow();
    return this;
  }

  /** 0–1 along a morph. Grows the allow region toward the target word. */
  setProgress(u: number): this {
    this.progress = Math.min(1, Math.max(0, u));
    this.refreshAllow();
    if (this.progress >= 0.86) this.fillTarget();
    return this;
  }

  /** Copy the target mask into live cells. */
  fillTarget(): this {
    if (this.toMask.length !== this.cells.length) return this;
    this.cells.set(this.toMask);
    return this;
  }

  private refreshAllow(): void {
    if (this.allow.length !== this.cells.length) return;
    fillAllow(this.allow, this.fromMask, this.toMask, this.bridge, this.progress);
    this.mask = this.allow;
  }

  /** Restore the seed (source word) and progress `0`. */
  reset(): this {
    this.cells.set(this.seed);
    this.acc = 0;
    this.progress = 0;
    this.refreshAllow();
    return this;
  }

  /** Empty the grid. */
  clear(): this {
    this.cols = 0;
    this.rows = 0;
    this.cells = new Uint8Array(0);
    this.mask = new Uint8Array(0);
    this.fromMask = new Uint8Array(0);
    this.toMask = new Uint8Array(0);
    this.bridge = new Uint8Array(0);
    this.seed = new Uint8Array(0);
    this.scratch = new Uint8Array(0);
    this.allow = new Uint8Array(0);
    this.acc = 0;
    this.progress = 0;
    this.morphing = false;
    return this;
  }

  /** One generation ({@link stepAutomata} or {@link stepGrowth}). */
  step(): this {
    if (this.empty) return this;
    if (this.kind === "growth") {
      if (this.allow.length !== this.cells.length) return this;
      stepGrowth(this.cells, this.scratch, this.cols, this.rows, this.allow);
    } else {
      const mask = this.morphing
        ? this.allow
        : this.confine
          ? this.mask
          : null;
      stepAutomata(this.cells, this.scratch, this.cols, this.rows, this.rule, mask);
    }
    const swap = this.cells;
    this.cells = this.scratch;
    this.scratch = swap;
    return this;
  }

  /** Run a bounded number of generations from elapsed seconds. */
  tick(dt: number): this {
    if (this.empty || this.speed <= 0) return this;
    const rate = this.kind === "growth" ? this.speed * 1.4 : this.speed;
    this.acc += dt * rate;
    const cap = this.kind === "growth" ? 8 : 4;
    const steps = Math.min(cap, Math.floor(this.acc));
    this.acc -= steps;
    for (let i = 0; i < steps; i++) this.step();
    return this;
  }

  /** Paint live cells in world space. */
  paint(x: number, y: number, radius: number): this {
    if (this.empty) return this;
    const r = Math.max(this.cell, radius);
    const r2 = r * r;
    const c0 = Math.floor((x - r - this.originX) / this.cell);
    const c1 = Math.floor((x + r - this.originX) / this.cell);
    const r0 = Math.floor((y - r - this.originY) / this.cell);
    const r1 = Math.floor((y + r - this.originY) / this.cell);
    for (let row = r0; row <= r1; row++) {
      if (row < 0 || row >= this.rows) continue;
      for (let col = c0; col <= c1; col++) {
        if (col < 0 || col >= this.cols) continue;
        const cx = this.originX + (col + 0.5) * this.cell;
        const cy = this.originY + (row + 0.5) * this.cell;
        const dx = cx - x;
        const dy = cy - y;
        if (dx * dx + dy * dy > r2) continue;
        const i = row * this.cols + col;
        const confined = this.morphing
          ? this.allow[i] === 0
          : this.confine && this.mask[i] === 0;
        if (confined) continue;
        this.cells[i] = 1;
      }
    }
    return this;
  }
}
