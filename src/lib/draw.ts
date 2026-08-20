import type { Bounds, SampleKind, SamplePack } from "./types.ts";
import type { Vec } from "./types.ts";

export type DrawFit = "contain" | "actual";

export type View = {
  scale: number;
  ox: number;
  oy: number;
  dpr: number;
};

export type DrawSamplesOptions = {
  pointRadius?: number;
  contourColor?: string;
  fillColor?: string;
  /**
   * `actual`: 1 sampled unit = 1 CSS pixel when it fits; shrinks to the
   * canvas width/height so a word cannot overflow the device.
   * `contain`: scale the pack to fill the canvas.
   */
  fit?: DrawFit;
  dpr?: number;
  clear?: boolean;
  /** Pin vertical placement to this baseline (world y) instead of the tight bbox. */
  baseline?: number;
  /** Em size used with `baseline` so different words sit on the same line. */
  em?: number;
  /** World x placed at the canvas center. Locks the camera while words morph. */
  originX?: number;
};

const VIEW_PAD = 96;

/** Camera that maps world coordinates onto a canvas backing store. */
export function makeView(
  bounds: Bounds,
  canvasWidth: number,
  canvasHeight: number,
  options: {
    fit?: DrawFit;
    dpr?: number;
    baseline?: number;
    em?: number;
    originX?: number;
  } = {},
): View {
  const dpr = options.dpr ?? 1;
  const fit = options.fit ?? "actual";
  const bw = Math.max(bounds.w, 1);
  const bh = Math.max(bounds.h, 1);
  const contain = Math.min(
    (canvasWidth - VIEW_PAD) / bw,
    (canvasHeight - VIEW_PAD) / bh,
  );
  const scale = fit === "contain" ? contain : Math.min(dpr, contain);
  const cx = options.originX ?? bounds.x + bw / 2;
  const ox = canvasWidth / 2 - cx * scale;
  const em = options.em;
  const oy =
    em !== undefined
      ? canvasHeight / 2 - ((options.baseline ?? 0) - em * 0.32) * scale
      : (canvasHeight - bh * scale) / 2 - bounds.y * scale;
  return { scale, ox, oy, dpr };
}

/** Convert CSS pixel coordinates to world space. */
export function screenToWorld(cssX: number, cssY: number, view: View): Vec {
  return {
    x: (cssX * view.dpr - view.ox) / view.scale,
    y: (cssY * view.dpr - view.oy) / view.scale,
  };
}

export type DrawablePoint = {
  x: number;
  y: number;
  k: SampleKind;
  life?: number;
};

/** Draw fill then contour dots. `life` becomes alpha. */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  points: DrawablePoint[],
  view: View,
  options: DrawSamplesOptions = {},
): void {
  const { width, height } = ctx.canvas;
  const radius = options.pointRadius ?? 1.2;
  const contourColor = options.contourColor ?? "#f2efe9";
  const fillColor = options.fillColor ?? "#c8c2b4";
  if (options.clear !== false) ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = fillColor;
  for (const p of points) {
    if (p.k !== "fill") continue;
    const a = p.life ?? 1;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(view.ox + p.x * view.scale, view.oy + p.y * view.scale, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = contourColor;
  for (const p of points) {
    if (p.k !== "contour") continue;
    const a = p.life ?? 1;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(view.ox + p.x * view.scale, view.oy + p.y * view.scale, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export type AutomataGrid = {
  cols: number;
  rows: number;
  cell: number;
  originX: number;
  originY: number;
  cells: Uint8Array;
};

/** Draw a CA / growth grid as dots in world space. */
export function drawAutomata(
  ctx: CanvasRenderingContext2D,
  grid: AutomataGrid,
  view: View,
  options: { liveColor?: string; dyingColor?: string; clear?: boolean } = {},
): void {
  const { width, height } = ctx.canvas;
  if (options.clear !== false) ctx.clearRect(0, 0, width, height);
  const live = options.liveColor ?? "#f2efe9";
  const dying = options.dyingColor ?? "#6a665e";
  const radius = Math.max(0.85, 1.15 * view.dpr);
  const n = grid.cols * grid.rows;
  for (let i = 0; i < n; i++) {
    const s = grid.cells[i] ?? 0;
    if (s === 0) continue;
    const col = i % grid.cols;
    const row = (i / grid.cols) | 0;
    ctx.fillStyle = s === 2 ? dying : live;
    ctx.beginPath();
    ctx.arc(
      view.ox + (grid.originX + (col + 0.5) * grid.cell) * view.scale,
      view.oy + (grid.originY + (row + 0.5) * grid.cell) * view.scale,
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Stroke closed rings and draw their nodes (differential growth). */
export function drawRings(
  ctx: CanvasRenderingContext2D,
  rings: Array<Array<{ x: number; y: number }>>,
  view: View,
  options: { color?: string; clear?: boolean; lineWidth?: number } = {},
): void {
  const { width, height } = ctx.canvas;
  if (options.clear !== false) ctx.clearRect(0, 0, width, height);
  const color = options.color ?? "#f2efe9";
  const line = options.lineWidth ?? Math.max(1.1, view.dpr * 1.15);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = line;
  ctx.globalAlpha = 1;
  for (const ring of rings) {
    if (ring.length < 2) continue;
    const first = ring[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.moveTo(view.ox + first.x * view.scale, view.oy + first.y * view.scale);
    for (let i = 1; i < ring.length; i++) {
      const p = ring[i];
      if (!p) continue;
      ctx.lineTo(view.ox + p.x * view.scale, view.oy + p.y * view.scale);
    }
    ctx.closePath();
    ctx.stroke();
  }
  const r = Math.max(0.9, line * 0.45);
  for (const ring of rings) {
    for (const p of ring) {
      ctx.beginPath();
      ctx.arc(view.ox + p.x * view.scale, view.oy + p.y * view.scale, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draw a static pack (no physics). Builds a {@link View} from `pack.bounds`. */
export function drawSamples(
  ctx: CanvasRenderingContext2D,
  pack: SamplePack,
  options: DrawSamplesOptions = {},
): void {
  const view = makeView(pack.bounds, ctx.canvas.width, ctx.canvas.height, options);
  drawParticles(ctx, pack.points, view, options);
}
