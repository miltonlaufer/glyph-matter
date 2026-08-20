import { boundsOf, round } from "./path.ts";
import type { SamplePack, SamplePoint, SamplingMode } from "./types.ts";

export type ImageSampleOptions = {
  samplingMode?: SamplingMode;
  /** Min distance between contour samples, in source pixels. Default `1.4`. */
  contourSpacing?: number;
  /** Grid step for contrast stipple (fill). Default `3.5`. */
  fillSpacing?: number;
  /** Fit the bitmap into this width before sampling. Default `640`. */
  width?: number;
  /** Strong-edge cutoff, 0–1 of max Sobel. Default `0.12`. */
  edgeThreshold?: number;
  /**
   * Weak-edge cutoff for Canny hysteresis, 0–1 of max Sobel.
   * Default `0.4 *` the high threshold.
   */
  edgeLow?: number;
  /**
   * Absolute Sobel floor. Stops a smooth sky/paper ramp from becoming a
   * field of edges. Default `0.4` (~0.1 luma step).
   */
  edgeFloor?: number;
  /**
   * Fill-only: sample pixels darker than this luma (0–1). Ignored in
   * `both` (fill follows local texture, not a darkness rectangle).
   * Default `0.58`.
   */
  fillDarkness?: number;
  /** Drop fill (never contours) beyond this count. Default `8000`. */
  maxPoints?: number;
  /** Label stored on the pack (`text` / glyph `ch`). */
  label?: string;
};

const DEFAULTS = {
  samplingMode: "both" as SamplingMode,
  contourSpacing: 1.4,
  fillSpacing: 3.5,
  width: 640,
  edgeThreshold: 0.12,
  edgeFloor: 0.4,
  maxPoints: 8000,
  label: "image",
  fillDarkness: 0.58,
};

function luma(r: number, g: number, b: number, a: number): number {
  if (a < 16) return 1;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function resizeBilinear(
  srcW: number,
  srcH: number,
  src: Uint8ClampedArray,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const sx = srcW / dstW;
  const sy = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(fy)));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dstW; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(fx)));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const tx = fx - x0;
      const di = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * srcW + x0) * 4 + c]!;
        const b = src[(y0 * srcW + x1) * 4 + c]!;
        const d = src[(y1 * srcW + x0) * 4 + c]!;
        const e = src[(y1 * srcW + x1) * 4 + c]!;
        out[di + c] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + d * (1 - tx) * ty + e * tx * ty;
      }
    }
  }
  return out;
}

function toGray(width: number, height: number, data: Uint8ClampedArray): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = luma(data[o], data[o + 1], data[o + 2], data[o + 3]);
  }
  return gray;
}

function blur3(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      let wsum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
          acc += gray[yy * width + xx] * w;
          wsum += w;
        }
      }
      out[y * width + x] = acc / wsum;
    }
  }
  return out;
}

function sobel(
  gray: Float32Array,
  width: number,
  height: number,
): { mag: Float32Array; gx: Float32Array; gy: Float32Array; maxMag: number } {
  const mag = new Float32Array(gray.length);
  const gx = new Float32Array(gray.length);
  const gy = new Float32Array(gray.length);
  let maxMag = 1e-6;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const a = gray[i - width - 1];
      const b = gray[i - width];
      const c = gray[i - width + 1];
      const d = gray[i - 1];
      const e = gray[i + 1];
      const f = gray[i + width - 1];
      const g = gray[i + width];
      const h = gray[i + width + 1];
      const sx = -a + c - 2 * d + 2 * e - f + h;
      const sy = -a - 2 * b - c + f + 2 * g + h;
      gx[i] = sx;
      gy[i] = sy;
      const m = Math.hypot(sx, sy);
      mag[i] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  return { mag, gx, gy, maxMag };
}

function suppress(
  mag: Float32Array,
  gx: Float32Array,
  gy: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const thin = new Float32Array(mag.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i];
      if (m <= 0) continue;
      const angle = Math.atan2(gy[i], gx[i]);
      const dir = ((Math.round((angle * 4) / Math.PI) + 4) % 4) as 0 | 1 | 2 | 3;
      let n1: number;
      let n2: number;
      if (dir === 0) {
        n1 = mag[i - 1];
        n2 = mag[i + 1];
      } else if (dir === 1) {
        n1 = mag[i - width + 1];
        n2 = mag[i + width - 1];
      } else if (dir === 2) {
        n1 = mag[i - width];
        n2 = mag[i + width];
      } else {
        n1 = mag[i - width - 1];
        n2 = mag[i + width + 1];
      }
      // Strict on at least one side so a constant-magnitude ramp (sky,
      // paper) does not become a solid field of "edges".
      if (m >= n1 && m >= n2 && m > Math.min(n1, n2)) thin[i] = m;
    }
  }
  return thin;
}

function hysteresis(
  thin: Float32Array,
  width: number,
  height: number,
  high: number,
  low: number,
): Uint8Array {
  const edge = new Uint8Array(thin.length);
  const stack: number[] = [];
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] >= high) {
      edge[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (edge[j] || thin[j] < low) continue;
        edge[j] = 1;
        stack.push(j);
      }
    }
  }
  return edge;
}

function thinBySpacing(
  edge: Uint8Array,
  width: number,
  height: number,
  spacing: number,
): { x: number; y: number }[] {
  const minD2 = spacing * spacing;
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!edge[y * width + x]) continue;
      let ok = true;
      for (let j = out.length - 1; j >= 0; j--) {
        const dx = out[j].x - x;
        const dy = out[j].y - y;
        if (dx * dx + dy * dy < minD2) {
          ok = false;
          break;
        }
        if (dy * dy > minD2 && x - out[j].x > spacing) break;
      }
      if (ok) out.push({ x, y });
    }
  }
  return out;
}

function cap<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

function hash01(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** 3×3 gray range. Smooth ramps stay near 0; cracks and ripples do not. */
function localRange(
  gray: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let lo = 1;
  let hi = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = Math.max(0, Math.min(height - 1, y + dy));
    for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.max(0, Math.min(width - 1, x + dx));
      const v = gray[yy * width + xx];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return hi - lo;
}

/**
 * Sample an RGBA bitmap into a {@link SamplePack}. Canny edges (blur, Sobel,
 * non-max suppression, hysteresis) for contours. Smooth ramps (sky, paper)
 * are not treated as edges. Fill in `both` is a local-texture stipple; `fill`
 * mode is a darkness grid. No DOM required.
 */
export function sampleImageFromRgba(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  options: ImageSampleOptions = {},
): SamplePack {
  const opt = { ...DEFAULTS, ...options };
  let w = width;
  let h = height;
  let rgba = data;
  if (w > opt.width) {
    h = Math.max(1, Math.round((h * opt.width) / w));
    w = opt.width;
    rgba = resizeBilinear(width, height, data, w, h);
  }

  const gray = blur3(toGray(w, h, rgba), w, h);
  const { mag, gx, gy, maxMag } = sobel(gray, w, h);
  const thin = suppress(mag, gx, gy, w, h);
  const high = Math.max(opt.edgeThreshold * maxMag, opt.edgeFloor);
  const low =
    options.edgeLow != null
      ? Math.min(high, options.edgeLow * maxMag)
      : 0.4 * high;
  const edge = hysteresis(thin, w, h, high, low);

  const mode = opt.samplingMode;
  const wantContour = mode === "contour" || mode === "both";
  const wantFill = mode === "fill" || mode === "both";

  const contourPts: SamplePoint[] = [];
  if (wantContour) {
    const contour = thinBySpacing(edge, w, h, opt.contourSpacing);
    const n = contour.length || 1;
    for (let i = 0; i < contour.length; i++) {
      const p = contour[i]!;
      contourPts.push({
        x: round(p.x),
        y: round(p.y),
        g: 0,
        k: "contour",
        c: 0,
        t: i / n,
      });
    }
  }

  const fillPts: SamplePoint[] = [];
  if (wantFill) {
    const step = Math.max(2, opt.fillSpacing);
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const i = iy * w + ix;
        if (edge[i]) continue;
        const dark = 1 - gray[i];
        let weight: number;
        if (mode === "fill") {
          if (gray[i] > opt.fillDarkness) continue;
          weight = dark * dark;
        } else {
          const tex = localRange(gray, w, h, ix, iy);
          if (tex < 0.12) continue;
          weight = tex * tex * (0.2 + 0.8 * dark);
        }
        if (weight < (mode === "fill" ? 0.2 : 0.08)) continue;
        if (hash01(ix, iy) > weight) continue;
        fillPts.push({ x: round(x), y: round(y), g: 0, k: "fill" });
      }
    }
  }

  const fillBudget = Math.max(0, opt.maxPoints - contourPts.length);
  const kept = contourPts.concat(cap(fillPts, fillBudget));
  const box = boundsOf(kept);
  return {
    v: 1,
    text: opt.label,
    sampling: {
      mode,
      contourSpacing: opt.contourSpacing,
      fillSpacing: opt.fillSpacing,
      fontSize: Math.max(box.h, 1),
      fillRule: "nonzero",
    },
    font: { familyName: "image", unitsPerEm: 1000 },
    bounds: box,
    glyphs: [
      {
        i: 0,
        ch: opt.label.slice(0, 1) || "¶",
        x: box.x,
        y: box.y,
        advance: box.w,
        word: 0,
      },
    ],
    points: kept,
  };
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image fetch failed: ${url}`));
    img.src = url;
  });
}

/** Decode an image URL into RGBA pixels (browser canvas). */
export async function loadImagePixels(
  source: string,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const img = await loadHtmlImage(source);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (width < 2 || height < 2) throw new Error("Image is empty");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(img, 0, 0);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** Sample a bitmap URL into a pack. Browser-only (needs canvas). */
export async function sampleImage(
  source: string,
  options: ImageSampleOptions = {},
): Promise<SamplePack> {
  const pixels = await loadImagePixels(source);
  return sampleImageFromRgba(pixels.width, pixels.height, pixels.data, options);
}
