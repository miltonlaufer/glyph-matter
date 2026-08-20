/**
 * World-space contour/fill spacing so ink density stays similar across
 * CSS viewport sizes and device pixel ratios.
 *
 * Small viewports tighten spacing (enough dots on a phone). High DPR
 * loosens it (1-device-pixel dots otherwise pack into a bright solid).
 * `refCss` is the shorter viewport side the `base` spacings were chosen for.
 */
export function displayInk(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  base: { contourSpacing: number; fillSpacing: number; refCss?: number },
): { contourSpacing: number; fillSpacing: number } {
  const css = Math.max(1, Math.min(cssWidth, cssHeight));
  const ref = base.refCss ?? 680;
  const cssDense = Math.max(0.55, Math.min(1.9, ref / css));
  const ppi = Math.sqrt(Math.max(1, dpr));
  const space = ppi / cssDense;
  return {
    contourSpacing: base.contourSpacing * space,
    fillSpacing: base.fillSpacing * space,
  };
}

/** Dot radius in canvas backing-store pixels for a CSS-pixel radius. */
export function canvasDotRadius(cssRadius: number, dpr: number): number {
  return Math.max(0.5, cssRadius * Math.max(1, dpr));
}
