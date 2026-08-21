import { screenToWorld, type View, type World } from "../src/lib/index.ts";

export const FONT_URL = `${import.meta.env.BASE_URL}fonts/EBGaramond-Regular.ttf`;

export const SAMPLE = {
  samplingMode: "both" as const,
  fontSize: 140,
  contourSpacing: 2,
  fillSpacing: 2.5,
};

export type Box = { x: number; y: number; w: number; h: number };

/** Stable box that covers both words, so the camera does not jump at morph. */
export function unionBounds(a: Box, b: Box, pad = 0): Box {
  const x = Math.min(a.x, b.x) - pad;
  const y = Math.min(a.y, b.y) - pad;
  const r = Math.max(a.x + a.w, b.x + b.w) + pad;
  const t = Math.max(a.y + a.h, b.y + b.h) + pad;
  return { x, y, w: r - x, h: t - y };
}

export function unionAll(boxes: Box[], pad = 0): Box {
  const first = boxes[0];
  if (!first) return { x: 0, y: 0, w: 0, h: 0 };
  let acc = first;
  for (let i = 1; i < boxes.length; i++) acc = unionBounds(acc, boxes[i]!);
  if (!pad) return acc;
  return { x: acc.x - pad, y: acc.y - pad, w: acc.w + pad * 2, h: acc.h + pad * 2 };
}

export function sizeCanvas(canvas: HTMLCanvasElement): number {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = Math.max(1, canvas.clientWidth);
  const cssH = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  return dpr;
}

export function loop(fn: (dt: number) => void): void {
  let last = performance.now();
  const tick = (now: number) => {
    fn(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Workbench pointer: hover repels ink, hold pushes harder.
 * Call the returned function with the current view each frame.
 */
export function followPointer(
  canvas: HTMLCanvasElement,
  world: World,
): (view: View) => void {
  let view: View | null = null;
  const apply = (event: PointerEvent, down?: boolean) => {
    if (!view) return;
    const p = screenToWorld(event.offsetX, event.offsetY, view);
    world.pointer = { x: p.x, y: p.y, down: down ?? event.buttons !== 0 };
  };
  canvas.addEventListener("pointermove", (event) => apply(event));
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    apply(event, true);
  });
  canvas.addEventListener("pointerup", (event) => apply(event, false));
  canvas.addEventListener("pointercancel", () => {
    world.pointer = null;
  });
  canvas.addEventListener("pointerleave", () => {
    world.pointer = null;
  });
  return (next) => {
    view = next;
  };
}
