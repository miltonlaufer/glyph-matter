import {
  boundsOf,
  commandsToContours,
  pointInContours,
  round,
  samplePolyline,
  type PathCommand,
} from "./path.ts";
import type {
  FillRule,
  SampleKind,
  SamplePoint,
  SamplingMode,
  Vec,
} from "./types.ts";

export type SamplePathOptions = {
  samplingMode: SamplingMode;
  contourSpacing: number;
  fillSpacing: number;
  fillRule: FillRule;
};

export function samplePath(
  commands: PathCommand[],
  options: SamplePathOptions,
): { contours: Vec[][]; points: Omit<SamplePoint, "g">[] } {
  const flattenSpacing = Math.min(options.contourSpacing, options.fillSpacing) / 2;
  const contours = commandsToContours(commands, Math.max(flattenSpacing, 0.4));
  const points: Omit<SamplePoint, "g">[] = [];

  const wantContour =
    options.samplingMode === "contour" || options.samplingMode === "both";
  const wantFill = options.samplingMode === "fill" || options.samplingMode === "both";

  if (wantContour) {
    contours.forEach((contour, c) => {
      for (const p of samplePolyline(contour, options.contourSpacing)) {
        points.push({
          x: round(p.x),
          y: round(p.y),
          k: "contour" satisfies SampleKind,
          c,
          t: round(p.t, 4),
        });
      }
    });
  }

  if (wantFill) {
    const all = contours.flat();
    const b = boundsOf(all);
    const step = Math.max(options.fillSpacing, 0.5);
    const x0 = b.x + step / 2;
    const y0 = b.y + step / 2;
    for (let y = y0; y < b.y + b.h; y += step) {
      for (let x = x0; x < b.x + b.w; x += step) {
        if (!pointInContours(x, y, contours, options.fillRule)) continue;
        points.push({
          x: round(x),
          y: round(y),
          k: "fill",
        });
      }
    }
  }

  return { contours, points };
}
