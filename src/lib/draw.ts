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
   * `actual`: 1 sampled unit = 1 CSS pixel (font size is on-screen size).
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
  const scale =
    fit === "contain"
      ? Math.min((canvasWidth - 96) / bw, (canvasHeight - 96) / bh)
      : dpr;
  const cx = options.originX ?? bounds.x + bw / 2;
  const ox = canvasWidth / 2 - cx * scale;
  const em = options.em;
  const oy =
    em !== undefined
      ? canvasHeight / 2 - ((options.baseline ?? 0) - em * 0.32) * scale
      : (canvasHeight - bh * scale) / 2 - bounds.y * scale;
  return { scale, ox, oy, dpr };
}

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

export function drawSamples(
  ctx: CanvasRenderingContext2D,
  pack: SamplePack,
  options: DrawSamplesOptions = {},
): void {
  const view = makeView(pack.bounds, ctx.canvas.width, ctx.canvas.height, options);
  drawParticles(ctx, pack.points, view, options);
}
