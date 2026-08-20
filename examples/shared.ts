export const FONT_URL = "/fonts/EBGaramond-Regular.ttf";

export function sizeCanvas(canvas: HTMLCanvasElement): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
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
