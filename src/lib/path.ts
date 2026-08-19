import type { Vec } from "./types.ts";

export type PathCommand = {
  type: "M" | "L" | "C" | "Q" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function cubic(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function quad(p0: Vec, p1: Vec, p2: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function curveSteps(estimatedLength: number, spacing: number): number {
  return Math.max(4, Math.ceil(estimatedLength / Math.max(spacing / 2, 0.35)));
}

function closeIfNeeded(points: Vec[]): Vec[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;
  if (dist(first, last) < 1e-6) return points;
  return [...points, first];
}

export function commandsToContours(
  commands: PathCommand[],
  flattenSpacing: number,
): Vec[][] {
  const contours: Vec[][] = [];
  let current: Vec[] = [];
  let start: Vec | null = null;
  let pen: Vec = { x: 0, y: 0 };

  const commit = () => {
    if (current.length >= 2) contours.push(current);
    current = [];
    start = null;
  };

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M": {
        if (current.length) commit();
        pen = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
        start = pen;
        current = [pen];
        break;
      }
      case "L": {
        pen = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
        current.push(pen);
        break;
      }
      case "C": {
        const p0 = pen;
        const p1 = { x: cmd.x1 ?? 0, y: cmd.y1 ?? 0 };
        const p2 = { x: cmd.x2 ?? 0, y: cmd.y2 ?? 0 };
        const p3 = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
        const est = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
        const steps = curveSteps(est, flattenSpacing);
        for (let i = 1; i <= steps; i++) {
          current.push(cubic(p0, p1, p2, p3, i / steps));
        }
        pen = p3;
        break;
      }
      case "Q": {
        const p0 = pen;
        const p1 = { x: cmd.x1 ?? 0, y: cmd.y1 ?? 0 };
        const p2 = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
        const est = dist(p0, p1) + dist(p1, p2);
        const steps = curveSteps(est, flattenSpacing);
        for (let i = 1; i <= steps; i++) {
          current.push(quad(p0, p1, p2, i / steps));
        }
        pen = p2;
        break;
      }
      case "Z": {
        if (start && dist(pen, start) > 1e-6) current.push(start);
        commit();
        if (start) pen = start;
        break;
      }
    }
  }
  if (current.length) commit();
  return contours;
}

export function samplePolyline(
  points: Vec[],
  spacing: number,
): Array<Vec & { t: number }> {
  const loop = closeIfNeeded(points);
  if (loop.length < 2) return [];

  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const a = loop[i];
    const b = loop[i + 1];
    if (!a || !b) continue;
    const d = dist(a, b);
    segs.push(d);
    total += d;
  }
  if (total < 1e-6) return [{ x: loop[0].x, y: loop[0].y, t: 0 }];

  const step = Math.max(spacing, total / 4096);
  const out: Array<Vec & { t: number }> = [];
  let acc = 0;
  let seg = 0;
  let nextAt = 0;

  while (nextAt < total - 1e-9 && seg < segs.length) {
    const segLen = segs[seg] ?? 0;
    const a = loop[seg];
    const b = loop[seg + 1];
    if (!a || !b) break;
    if (acc + segLen >= nextAt) {
      const tLocal = segLen < 1e-9 ? 0 : (nextAt - acc) / segLen;
      out.push({
        x: a.x + (b.x - a.x) * tLocal,
        y: a.y + (b.y - a.y) * tLocal,
        t: nextAt / total,
      });
      nextAt += step;
      continue;
    }
    acc += segLen;
    seg += 1;
  }
  return out;
}

function isLeft(a: Vec, b: Vec, x: number, y: number): number {
  return (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
}

export function windingNumber(x: number, y: number, polygon: Vec[]): number {
  const loop = closeIfNeeded(polygon);
  let wn = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const a = loop[i];
    const b = loop[i + 1];
    if (!a || !b) continue;
    if (a.y <= y) {
      if (b.y > y && isLeft(a, b, x, y) > 0) wn += 1;
    } else if (b.y <= y && isLeft(a, b, x, y) < 0) {
      wn -= 1;
    }
  }
  return wn;
}

export function pointInContours(
  x: number,
  y: number,
  contours: Vec[][],
  rule: "nonzero" | "evenodd" = "nonzero",
): boolean {
  let wn = 0;
  let odd = 0;
  for (const contour of contours) {
    const w = windingNumber(x, y, contour);
    wn += w;
    if (w % 2 !== 0) odd += 1;
  }
  if (rule === "evenodd") return odd % 2 === 1;
  return wn !== 0;
}

export function boundsOf(points: Vec[]): { x: number; y: number; w: number; h: number } {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
