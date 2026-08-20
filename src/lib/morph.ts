import { boundsOf } from "./path.ts";
import type { GlyphRecord, SampleKind, SamplePoint, Vec } from "./types.ts";

export type MorphAlign = "center" | "origin";

export type Morphable = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  g: number;
  k: SampleKind;
  c?: number;
  t?: number;
  /** 0–1 opacity. Fading extras go to 0 and are removed. */
  life?: number;
  /** Spare points from a longer word; do not rematch. */
  exit?: boolean;
};

type Pair = { s: number; t: number; d: number };
type MatchResult = { live: Morphable[]; unused: Morphable[] };

function alignTargets(
  current: Morphable[],
  targets: SamplePoint[],
  align: MorphAlign,
): SamplePoint[] {
  if (align === "origin" || current.length === 0 || targets.length === 0) {
    return targets;
  }
  const from = boundsOf(current);
  const to = boundsOf(targets);
  const dx = from.x + from.w / 2 - (to.x + to.w / 2);
  if (dx === 0) return targets;
  return targets.map((p) => ({ ...p, x: p.x + dx }));
}

function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function nearestIndex(point: Vec, cloud: Vec[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cloud.length; i++) {
    const p = cloud[i];
    if (!p) continue;
    const d = dist2(point, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function homeOf(p: Morphable): Vec {
  return { x: p.homeX, y: p.homeY };
}

function localPos(p: Vec, b: { x: number; y: number; w: number; h: number }): Vec {
  return {
    x: (p.x - b.x) / Math.max(b.w, 1e-6),
    y: (p.y - b.y) / Math.max(b.h, 1e-6),
  };
}

function emit(source: Morphable, target: SamplePoint): Morphable {
  return {
    x: source.x,
    y: source.y,
    vx: source.vx,
    vy: source.vy,
    homeX: target.x,
    homeY: target.y,
    g: target.g,
    k: target.k,
    c: target.c,
    t: target.t,
    life: source.life ?? 1,
    exit: false,
  };
}

function spawn(target: SamplePoint, life = 1): Morphable {
  return {
    x: target.x,
    y: target.y,
    vx: 0,
    vy: 0,
    homeX: target.x,
    homeY: target.y,
    g: target.g,
    k: target.k,
    c: target.c,
    t: target.t,
    life,
    exit: false,
  };
}

function fadeOut(p: Morphable): Morphable {
  return {
    ...p,
    homeX: p.x,
    homeY: p.y,
    life: p.life ?? 1,
    exit: true,
  };
}

function append<T>(out: T[], items: T[]): void {
  for (const item of items) out.push(item);
}

function orderedGroups<T>(map: Map<number, T[]>): T[][] {
  return [...map.keys()]
    .sort((a, b) => a - b)
    .map((k) => map.get(k) ?? [])
    .filter((g) => g.length > 0);
}

function closestSrcGroup(
  destPts: SamplePoint[],
  srcGroups: Map<number, Morphable[]>,
): Morphable[] {
  if (destPts.length === 0) return [];
  let destX = 0;
  for (const p of destPts) destX += p.x;
  destX /= destPts.length;
  let best: Morphable[] = [];
  let bestD = Infinity;
  for (const pts of srcGroups.values()) {
    if (pts.length === 0) continue;
    let sx = 0;
    for (const p of pts) sx += p.homeX;
    sx /= pts.length;
    const d = Math.abs(sx - destX);
    if (d < bestD) {
      bestD = d;
      best = pts;
    }
  }
  return best;
}

/** New letters bud from the nearest existing letter, not from the whole word. */
function emitFromClosestLetters(
  leftoverDst: SamplePoint[],
  srcGroups: Map<number, Morphable[]>,
): Morphable[] {
  if (leftoverDst.length === 0) return [];
  const fallback = orderedGroups(srcGroups).flat();
  const out: Morphable[] = [];
  for (const destPts of groupByGlyph(leftoverDst).values()) {
    const sources = closestSrcGroup(destPts, srcGroups);
    const pool = sources.length ? sources : fallback;
    if (!pool.length) {
      for (const p of destPts) out.push(spawn(p, 0));
      continue;
    }
    for (let i = 0; i < destPts.length; i++) {
      const target = destPts[i];
      const source = pool[i % pool.length];
      if (target && source) out.push(emit(source, target));
      else if (target) out.push(spawn(target, 0));
    }
  }
  return out;
}

function sendEvenToLetters(
  particles: Morphable[],
  destGroups: SamplePoint[][],
): Morphable[] {
  if (particles.length === 0) return [];
  if (destGroups.length === 0) return particles.map(fadeOut);
  const out: Morphable[] = [];
  const cursor = destGroups.map(() => 0);
  for (let i = 0; i < particles.length; i++) {
    const source = particles[i];
    if (!source) continue;
    const gi = i % destGroups.length;
    const group = destGroups[gi];
    if (!group?.length) {
      out.push(fadeOut(source));
      continue;
    }
    const ci = cursor[gi] ?? 0;
    const target = group[ci % group.length];
    cursor[gi] = ci + 1;
    if (!target) {
      out.push(fadeOut(source));
      continue;
    }
    const sent = emit(source, target);
    sent.exit = true;
    out.push(sent);
  }
  return out;
}

/**
 * Pair points inside one glyph by nearest neighbour in that glyph's
 * own box. World-space `t` walking is not used: it slides ink along
 * an `m` and can send the left of an `e` to the right of an `o`.
 */
function matchByLocal(sources: Morphable[], targets: SamplePoint[]): MatchResult {
  if (targets.length === 0) return { live: [], unused: sources };
  if (sources.length === 0) {
    return { live: targets.map((p) => spawn(p, 0)), unused: [] };
  }
  const sb = boundsOf(sources.map(homeOf));
  const tb = boundsOf(targets);
  return matchClosestAt(
    sources,
    targets,
    (s) => localPos(homeOf(s), sb),
    (t) => localPos(t, tb),
  );
}

function matchGlyphPoints(sources: Morphable[], targets: SamplePoint[]): MatchResult {
  const srcC = sources.filter((p) => p.k === "contour");
  const srcF = sources.filter((p) => p.k === "fill");
  const dstC = targets.filter((p) => p.k === "contour");
  const dstF = targets.filter((p) => p.k === "fill");
  const hasKind = srcC.length + dstC.length > 0 && srcF.length + dstF.length > 0;
  if (!hasKind) return matchByLocal(sources, targets);
  const contour = matchByLocal(srcC, dstC);
  const fill = matchByLocal(srcF, dstF);
  return {
    live: contour.live.concat(fill.live),
    unused: contour.unused.concat(fill.unused),
  };
}

function matchCharOccurrences(
  fromIdx: number[],
  toIdx: number[],
  dist: (ia: number, ib: number) => number,
): Array<{ ia: number; ib: number }> {
  if (fromIdx.length === 0 || toIdx.length === 0) return [];
  const shortIsFrom = fromIdx.length <= toIdx.length;
  const short = shortIsFrom ? fromIdx : toIdx;
  const long = shortIsFrom ? toIdx : fromIdx;
  const cost = (s: number, l: number) =>
    shortIsFrom ? dist(s, l) : dist(l, s);

  const m = short.length;
  const n = long.length;
  const inf = 1e12;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(inf),
  );
  const take: boolean[][] = Array.from({ length: n + 1 }, () =>
    Array<boolean>(m + 1).fill(false),
  );
  for (let i = 0; i <= n; i++) {
    const row = dp[i];
    if (row) row[0] = 0;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skip = dp[i - 1]?.[j] ?? inf;
      const s = short[j - 1];
      const l = long[i - 1];
      const paired =
        s === undefined || l === undefined
          ? inf
          : (dp[i - 1]?.[j - 1] ?? inf) + cost(s, l);
      const row = dp[i];
      const takeRow = take[i];
      if (!row || !takeRow) continue;
      if (paired < skip) {
        row[j] = paired;
        takeRow[j] = true;
      } else {
        row[j] = skip;
        takeRow[j] = false;
      }
    }
  }
  const matched: Array<{ ia: number; ib: number }> = [];
  let i = n;
  let j = m;
  while (j > 0 && i > 0) {
    if (take[i]?.[j]) {
      const s = short[j - 1];
      const l = long[i - 1];
      if (s !== undefined && l !== undefined) {
        matched.push(shortIsFrom ? { ia: s, ib: l } : { ia: l, ib: s });
      }
      i -= 1;
      j -= 1;
    } else {
      i -= 1;
    }
  }
  return matched.reverse();
}

function slotWindow(
  nFrom: number,
  nTo: number,
): { fromStart: number; toStart: number } {
  if (nFrom < nTo) {
    return { fromStart: 0, toStart: Math.floor((nTo - nFrom) / 2) };
  }
  if (nTo < nFrom) {
    return { fromStart: Math.floor((nFrom - nTo) / 2), toStart: 0 };
  }
  return { fromStart: 0, toStart: 0 };
}

function cloudCenterX(
  pts: Array<{ x: number; homeX?: number; exit?: boolean }>,
  useHome: boolean,
): number | null {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.exit) continue;
    const x = useHome ? (p.homeX ?? p.x) : p.x;
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return (min + max) / 2;
}

function glyphsCenterX(glyphs: GlyphRecord[]): number {
  if (glyphs.length === 0) return 0;
  const first = glyphs[0];
  const last = glyphs[glyphs.length - 1];
  if (!first || !last) return 0;
  return (first.x + last.x + last.advance) / 2;
}

function shiftDestToCenteredSlots(
  dest: SamplePoint[],
  fromGlyphs: GlyphRecord[],
  toGlyphs: GlyphRecord[],
  current?: Morphable[],
): { dest: SamplePoint[]; glyphs: GlyphRecord[] } {
  if (
    fromGlyphs.length === 0 ||
    toGlyphs.length === 0 ||
    fromGlyphs.length === toGlyphs.length
  ) {
    return { dest, glyphs: toGlyphs };
  }
  const fromC =
    cloudCenterX(current ?? [], true) ?? glyphsCenterX(fromGlyphs);
  const toC = cloudCenterX(dest, false) ?? glyphsCenterX(toGlyphs);
  const dx = fromC - toC;
  if (dx === 0) return { dest, glyphs: toGlyphs };
  return {
    dest: dest.map((p) => ({ ...p, x: p.x + dx })),
    glyphs: toGlyphs.map((g) => ({ ...g, x: g.x + dx })),
  };
}

function pairGlyphs(
  fromGlyphs: GlyphRecord[],
  toGlyphs: GlyphRecord[],
): Array<{ ia: number; ib: number }> {
  if (fromGlyphs.length !== toGlyphs.length) {
    const { fromStart, toStart } = slotWindow(fromGlyphs.length, toGlyphs.length);
    const n = Math.min(fromGlyphs.length, toGlyphs.length);
    const pairs: Array<{ ia: number; ib: number }> = [];
    for (let k = 0; k < n; k++) {
      pairs.push({ ia: fromStart + k, ib: toStart + k });
    }
    return pairs;
  }

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: Array<{ ia: number; ib: number }> = [];
  const chars = new Set([
    ...fromGlyphs.map((g) => g.ch),
    ...toGlyphs.map((g) => g.ch),
  ]);

  for (const ch of chars) {
    const fromIdx = fromGlyphs
      .map((g, i) => (g.ch === ch ? i : -1))
      .filter((i) => i >= 0);
    const toIdx = toGlyphs
      .map((g, i) => (g.ch === ch ? i : -1))
      .filter((i) => i >= 0);
    const matched = matchCharOccurrences(fromIdx, toIdx, (ia, ib) => {
      const ga = fromGlyphs[ia];
      const gb = toGlyphs[ib];
      const dx = ga && gb ? Math.abs(ga.x - gb.x) : 0;
      return Math.abs(ia - ib) * 1000 + dx;
    });
    for (const p of matched) {
      usedA.add(p.ia);
      usedB.add(p.ib);
      pairs.push(p);
    }
  }

  const restA = fromGlyphs.map((_, i) => i).filter((i) => !usedA.has(i));
  const restB = toGlyphs.map((_, i) => i).filter((i) => !usedB.has(i));
  const n = Math.min(restA.length, restB.length);
  for (let k = 0; k < n; k++) {
    const ia = restA[k];
    const ib = restB[k];
    if (ia === undefined || ib === undefined) continue;
    pairs.push({ ia, ib });
  }
  return pairs;
}

function groupByGlyph<T extends { g: number }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const list = map.get(item.g);
    if (list) list.push(item);
    else map.set(item.g, [item]);
  }
  return map;
}

function allPairsAt(
  sources: Morphable[],
  targets: SamplePoint[],
  srcPos: (s: Morphable) => Vec,
  dstPos: (t: SamplePoint) => Vec,
): Pair[] {
  const pairs: Pair[] = [];
  for (let t = 0; t < targets.length; t++) {
    const target = targets[t];
    if (!target) continue;
    const tp = dstPos(target);
    for (let s = 0; s < sources.length; s++) {
      const source = sources[s];
      if (!source) continue;
      pairs.push({ s, t, d: dist2(srcPos(source), tp) });
    }
  }
  return pairs;
}

function knnPairsAt(
  sources: Morphable[],
  targets: SamplePoint[],
  k: number,
  srcPos: (s: Morphable) => Vec,
  dstPos: (t: SamplePoint) => Vec,
): Pair[] {
  const srcPts = sources.map(srcPos);
  const dstPts = targets.map(dstPos);
  const cloud: Vec[] = [...srcPts, ...dstPts];
  const b = boundsOf(cloud);
  const cell = Math.max(0.05, Math.hypot(Math.max(b.w, 1e-6), Math.max(b.h, 1e-6)) / 32);
  const grid = new Map<string, number[]>();
  const keyAt = (x: number, y: number) =>
    `${Math.floor((x - b.x) / cell)},${Math.floor((y - b.y) / cell)}`;

  srcPts.forEach((pt, s) => {
    const key = keyAt(pt.x, pt.y);
    const bucket = grid.get(key);
    if (bucket) bucket.push(s);
    else grid.set(key, [s]);
  });

  const pairs: Pair[] = [];
  for (let t = 0; t < targets.length; t++) {
    const tp = dstPts[t];
    if (!tp) continue;
    const cx = Math.floor((tp.x - b.x) / cell);
    const cy = Math.floor((tp.y - b.y) / cell);
    const local: Pair[] = [];
    for (let gy = -2; gy <= 2; gy++) {
      for (let gx = -2; gx <= 2; gx++) {
        const bucket = grid.get(`${cx + gx},${cy + gy}`);
        if (!bucket) continue;
        for (const s of bucket) {
          const sp = srcPts[s];
          if (!sp) continue;
          local.push({ s, t, d: dist2(sp, tp) });
        }
      }
    }
    if (local.length === 0) {
      const s = nearestIndex(tp, srcPts);
      local.push({
        s,
        t,
        d: dist2(tp, srcPts[s] ?? tp),
      });
    }
    local.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(k, local.length); i++) {
      const pair = local[i];
      if (pair) pairs.push(pair);
    }
  }
  return pairs;
}

function matchClosestAt(
  current: Morphable[],
  dest: SamplePoint[],
  srcPos: (s: Morphable) => Vec,
  dstPos: (t: SamplePoint) => Vec,
): MatchResult {
  if (current.length === 0) {
    return { live: dest.map((p) => spawn(p, 0)), unused: [] };
  }
  if (dest.length === 0) return { live: [], unused: current };
  const takenSource = new Uint8Array(current.length);
  const takenTarget = new Uint8Array(dest.length);
  const sourceForTarget = new Int32Array(dest.length).fill(-1);
  const targetForSource = new Int32Array(current.length).fill(-1);
  const n = current.length * dest.length;
  const pairs =
    n <= 2_500_000
      ? allPairsAt(current, dest, srcPos, dstPos)
      : knnPairsAt(current, dest, 16, srcPos, dstPos);
  pairs.sort((a, b) => a.d - b.d);
  for (const pair of pairs) {
    if (takenSource[pair.s] || takenTarget[pair.t]) continue;
    takenSource[pair.s] = 1;
    takenTarget[pair.t] = 1;
    sourceForTarget[pair.t] = pair.s;
    targetForSource[pair.s] = pair.t;
  }
  const srcPts = current.map(srcPos);
  const dstPts = dest.map(dstPos);
  const live: Morphable[] = [];
  for (let t = 0; t < dest.length; t++) {
    const target = dest[t];
    if (!target) continue;
    let s = sourceForTarget[t] ?? -1;
    if (s < 0) s = nearestIndex(dstPts[t] ?? target, srcPts);
    const source = current[s];
    if (source) live.push(emit(source, target));
    else live.push(spawn(target, 0));
  }
  const unused: Morphable[] = [];
  for (let s = 0; s < current.length; s++) {
    if ((targetForSource[s] ?? -1) >= 0) continue;
    const source = current[s];
    if (source) unused.push(source);
  }
  return { live, unused };
}

function matchClosest(current: Morphable[], dest: SamplePoint[]): MatchResult {
  return matchClosestAt(
    current,
    dest,
    (s) => s,
    (t) => t,
  );
}

/**
 * Shared letters keep their ink. Different-length words line up on
 * the middle: `the` sits still and becomes `riz` while `ho` and `on`
 * grow on the sides. Extra letters of a longer word fly into every
 * letter of the shorter one, then die on arrival. Spare points inside
 * a matched letter do the same instead of vanishing in place. New
 * letters bud from the closest existing letter.
 */
export function morphParticles(
  current: Morphable[],
  targets: SamplePoint[],
  align: MorphAlign = "origin",
  currentGlyphs: GlyphRecord[] = [],
  targetGlyphs: GlyphRecord[] = [],
): Morphable[] {
  let dest = alignTargets(current, targets, align);
  if (currentGlyphs.length > 0 && targetGlyphs.length > 0) {
    dest = shiftDestToCenteredSlots(
      dest,
      currentGlyphs,
      targetGlyphs,
      current,
    ).dest;
  }
  if (dest.length === 0) return [];
  if (current.length === 0) return dest.map((p) => spawn(p, 1));

  const living = current.map((p) => (p.exit ? { ...p, exit: false } : p));
  const next: Morphable[] = [];
  const spare: Morphable[] = [];
  const take = (result: MatchResult) => {
    append(next, result.live);
    append(spare, result.unused);
  };

  if (currentGlyphs.length === 0 || targetGlyphs.length === 0) {
    take(matchClosest(living, dest));
    append(next, sendEvenToLetters(spare, orderedGroups(groupByGlyph(dest))));
    return next;
  }

  const srcGroups = groupByGlyph(living);
  const dstGroups = groupByGlyph(dest);
  const usedSrc = new Set<number>();
  const usedDst = new Set<number>();

  for (const pair of pairGlyphs(currentGlyphs, targetGlyphs)) {
    const sources = srcGroups.get(pair.ia) ?? [];
    const groupTargets = dstGroups.get(pair.ib) ?? [];
    usedSrc.add(pair.ia);
    usedDst.add(pair.ib);
    take(matchGlyphPoints(sources, groupTargets));
  }

  const leftoverSrc: Morphable[] = [];
  for (const [g, pts] of srcGroups) {
    if (!usedSrc.has(g)) append(leftoverSrc, pts);
  }
  const leftoverDst: SamplePoint[] = [];
  for (const [g, pts] of dstGroups) {
    if (!usedDst.has(g)) append(leftoverDst, pts);
  }

  append(
    next,
    sendEvenToLetters(leftoverSrc.concat(spare), orderedGroups(dstGroups)),
  );
  append(next, emitFromClosestLetters(leftoverDst, srcGroups));
  return next;
}
