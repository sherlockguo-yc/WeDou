import { deltaE00, hexToRgb, isApproximate, nearestColor, rgbToLab } from './color';
import type { ColorMatch, LabCache } from './color';
import { effectivePaletteKey, usableColors, usableLabCache } from './palettes';
import type { BeadColor, Cell, ConvertParams, Rgb } from './types';

export interface ImageLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export const bucketKey = (r: number, g: number, b: number) =>
  ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** Centre of a bucket, so every pixel in a bucket maps to the same bead code. */
export const bucketCenter = (key: number): Rgb => ({
  r: (((key >> 10) & 31) << 3) + 4,
  g: (((key >> 5) & 31) << 3) + 4,
  b: ((key & 31) << 3) + 4,
});

/**
 * A bucket always maps to the same code for a given *effective* palette (full
 * or with effect beads filtered out). Caching it across conversions makes
 * parameter tweaks and palette switches cheap; the cache is bounded by 32^3
 * buckets and keyed separately so the two colour sets never cross-contaminate.
 */
const matchCacheByPalette = new Map<string, Map<number, ColorMatch>>();

function cachedMatch(
  paletteId: string,
  key: number,
  colors: BeadColor[],
  cache: LabCache,
): ColorMatch | null {
  let byBucket = matchCacheByPalette.get(paletteId);
  if (!byBucket) {
    byBucket = new Map();
    matchCacheByPalette.set(paletteId, byBucket);
  }
  const hit = byBucket.get(key);
  if (hit) return hit;
  const found = nearestColor(rgbToLab(bucketCenter(key)), colors, cache);
  if (found) byBucket.set(key, found);
  return found;
}

const distance = (a: Rgb, b: Rgb) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/** A small but strongly contrasting cluster is a line/highlight, not noise. */
export const DETAIL_MIN_RATIO = 0.12;
export const DETAIL_MAX_RATIO = 0.4;
export const DETAIL_MIN_DELTA_E = 25;
export const DETAIL_MIN_CLUSTER = 3;
/** Minimum number of neighbouring cells that must carry a detail to keep it. */
export const DETAIL_MIN_CELL_CLUSTER = 3;

/**
 * Only a *flat* background can be inferred from the corners. Averaging four
 * different corner colours (e.g. a top-dark / bottom-light gradient) produces
 * a mid-grey that also occurs inside the subject, which must never be deleted.
 */
function flatCornerBackground(image: ImageLike, limit: number): Rgb | null {
  const { data, width, height } = image;
  const points = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  const corners: Rgb[] = [];
  for (const offset of points) {
    if (data[offset + 3] < 128) continue;
    corners.push({ r: data[offset], g: data[offset + 1], b: data[offset + 2] });
  }
  if (corners.length === 0) return null;
  for (const corner of corners) {
    if (distance(corner, corners[0]) >= limit) return null;
  }
  const total = corners.reduce(
    (sum, corner) => ({ r: sum.r + corner.r, g: sum.g + corner.g, b: sum.b + corner.b }),
    { r: 0, g: 0, b: 0 },
  );
  return {
    r: total.r / corners.length,
    g: total.g / corners.length,
    b: total.b / corners.length,
  };
}

/** Mode of a coarse colour histogram; shared by the RGB path and background detection. */
function modeColor(pixels: CellPixel[]): Rgb | null {
  const buckets = new Map<number, { count: number; sum: Rgb }>();
  for (const { rgb } of pixels) {
    const key = bucketKey(rgb.r, rgb.g, rgb.b);
    const entry = buckets.get(key) ?? { count: 0, sum: { r: 0, g: 0, b: 0 } };
    entry.count += 1;
    entry.sum.r += rgb.r;
    entry.sum.g += rgb.g;
    entry.sum.b += rgb.b;
    buckets.set(key, entry);
  }
  const winner = [...buckets.values()].reduce<{ count: number; sum: Rgb } | null>(
    (best, entry) => (!best || entry.count > best.count ? entry : best),
    null,
  );
  if (!winner) return null;
  return {
    r: Math.round(winner.sum.r / winner.count),
    g: Math.round(winner.sum.g / winner.count),
    b: Math.round(winner.sum.b / winner.count),
  };
}

/**
 * A background is a region *connected to the picture edge*, not merely a colour.
 * Flood from the border through cells that look like the flat corner colour, so
 * a background-coloured patch enclosed by the subject survives.
 */
function markBackgroundCells(
  cells: CellSamples[],
  w: number,
  h: number,
  background: Rgb,
  limit: number,
): void {
  const seen = new Uint8Array(cells.length);
  const queue: number[] = [];
  const enqueue = (index: number) => {
    if (!seen[index]) queue.push(index);
  };
  for (let x = 0; x < w; x += 1) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    enqueue(y * w);
    enqueue(y * w + w - 1);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    if (seen[index]) continue;
    seen[index] = 1;
    const cell = cells[index];
    // Transparent cells are already empty; let the flood pass through them.
    if (cell.pixels.length > 0) {
      const representative = modeColor(cell.pixels);
      if (!representative || distance(representative, background) >= limit) continue;
      cell.backgroundEmpty = true;
    }
    const x = index % w;
    const y = Math.floor(index / w);
    if (x > 0) enqueue(index - 1);
    if (x < w - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - w);
    if (y < h - 1) enqueue(index + w);
  }
}

/** A sampled pixel plus its position in the cell's sampling grid. */
export interface CellPixel {
  rgb: Rgb;
  x: number;
  y: number;
}

export interface CellSamples {
  pixels: CellPixel[];
  considered: number;
  transparent: number;
  backgroundEmpty: boolean;
  empty: boolean;
}

/**
 * The single definition of "which pixels belong to a cell". Transparency is a
 * physical fact about a pixel; being background is a spatial decision about a
 * cell. Keeping them separate stops a colour match from deleting the subject.
 */
export function sampleCells(
  image: ImageLike,
  w: number,
  h: number,
  params: Pick<ConvertParams, 'transparentAsEmpty' | 'backgroundTolerance'>,
): CellSamples[] {
  const { data, width, height } = image;
  const backgroundLimit = params.backgroundTolerance * 2.5;
  const background =
    params.backgroundTolerance > 0 && params.transparentAsEmpty
      ? flatCornerBackground(image, backgroundLimit)
      : null;
  const cells: CellSamples[] = [];

  for (let gy = 0; gy < h; gy += 1) {
    const y0 = Math.floor((gy * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / h));
    for (let gx = 0; gx < w; gx += 1) {
      const x0 = Math.floor((gx * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / w));
      const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 64)));

      const pixels: CellPixel[] = [];
      let considered = 0;
      let transparent = 0;
      let sy = 0;
      for (let y = y0; y < y1; y += step, sy += 1) {
        let sx = 0;
        for (let x = x0; x < x1; x += step, sx += 1) {
          const offset = (y * width + x) * 4;
          considered += 1;
          if (data[offset + 3] < 128) {
            transparent += 1;
            continue;
          }
          pixels.push({
            rgb: { r: data[offset], g: data[offset + 1], b: data[offset + 2] },
            x: sx,
            y: sy,
          });
        }
      }

      const transparentEmpty =
        considered === 0 ||
        (params.transparentAsEmpty && transparent / considered > 0.6) ||
        pixels.length === 0;
      cells.push({
        pixels,
        considered,
        transparent,
        backgroundEmpty: false,
        empty: transparentEmpty,
      });
    }
  }

  if (background) markBackgroundCells(cells, w, h, background, backgroundLimit);
  for (const cell of cells) cell.empty = cell.empty || cell.backgroundEmpty;
  return cells;
}

/** One representative colour (mode of a quantised histogram) per bead cell. */
export function sampleGrid(
  image: ImageLike,
  w: number,
  h: number,
  params: Pick<ConvertParams, 'transparentAsEmpty' | 'backgroundTolerance'>,
): (Rgb | null)[] {
  return sampleCells(image, w, h, params).map((cell) =>
    cell.empty ? null : modeColor(cell.pixels),
  );
}

export interface QuantizeResult {
  cells: Cell[];
  approximated: number;
}

export function quantizeGrid(
  samples: (Rgb | null)[],
  w: number,
  h: number,
  paletteId: string,
  params: Pick<ConvertParams, 'dithering' | 'excludeSpecial'>,
): QuantizeResult {
  const excludeSpecial = params.excludeSpecial !== false;
  const cache: LabCache = usableLabCache(paletteId, excludeSpecial);
  const colors: BeadColor[] = usableColors(paletteId, excludeSpecial);
  const cells: Cell[] = new Array<Cell>(w * h).fill(null);
  let approximated = 0;

  if (!params.dithering) {
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (!sample) continue;
      const match = nearestColor(rgbToLab(sample), colors, cache);
      if (match) {
        cells[i] = match.color.code;
        if (isApproximate(match.deltaE)) approximated += 1;
      }
    }
    return { cells, approximated };
  }

  const working = samples.map((sample) => (sample ? { ...sample } : null));
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const index = y * w + x;
      const sample = working[index];
      if (!sample) continue;
      const match = nearestColor(rgbToLab(sample), colors, cache);
      if (!match) continue;
      cells[index] = match.color.code;
      if (isApproximate(match.deltaE)) approximated += 1;
      const chosen = hexToRgb(match.color.hex);
      const error: Rgb = {
        r: sample.r - chosen.r,
        g: sample.g - chosen.g,
        b: sample.b - chosen.b,
      };
      const spread = (tx: number, ty: number, factor: number) => {
        if (tx >= w || ty >= h) return;
        const target = working[ty * w + tx];
        if (!target) return;
        target.r = clamp(target.r + error.r * factor);
        target.g = clamp(target.g + error.g * factor);
        target.b = clamp(target.b + error.b * factor);
      };
      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }
  return { cells, approximated };
}

/** Size of the largest 8-connected group of pixels sharing a code inside one cell. */
function largestCluster(points: CellPixel[]): number {
  if (points.length === 0) return 0;
  const positions = new Set(points.map((point) => point.y * 4096 + point.x));
  const seen = new Set<number>();
  let best = 0;
  for (const start of points) {
    const startKey = start.y * 4096 + start.x;
    if (seen.has(startKey)) continue;
    seen.add(startKey);
    const queue = [start];
    let size = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const point = queue[head];
      size += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const key = (point.y + dy) * 4096 + point.x + dx;
          if (!positions.has(key) || seen.has(key)) continue;
          seen.add(key);
          queue.push({ rgb: point.rgb, x: point.x + dx, y: point.y + dy });
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
}

/**
 * A thin line or a small highlight occupies few pixels but carries the shape of
 * the picture. When a minority is clearly separated from the majority colour,
 * let it win the cell instead of being outvoted. The minority must also form a
 * connected line/patch: scattered contrast pixels are noise, not detail.
 * Kept as a separate policy so the voting rule can be replaced later.
 */
function pickDetail(
  votes: Map<string, { count: number; deltaSum: number; points: CellPixel[] }>,
  mainCode: string,
  cache: LabCache,
): string | null {
  if (votes.size < 2) return null;
  const mainLab = cache.get(mainCode);
  if (!mainLab) return null;
  const total = [...votes.values()].reduce((sum, vote) => sum + vote.count, 0);
  if (total === 0) return null;

  let best: { code: string; count: number; deltaE: number } | null = null;
  for (const [code, vote] of votes) {
    if (code === mainCode) continue;
    const ratio = vote.count / total;
    if (ratio < DETAIL_MIN_RATIO || ratio >= DETAIL_MAX_RATIO) continue;
    const lab = cache.get(code);
    if (!lab) continue;
    const deltaE = deltaE00(mainLab, lab);
    if (deltaE < DETAIL_MIN_DELTA_E) continue;
    const cluster = largestCluster(vote.points);
    if (cluster < Math.max(DETAIL_MIN_CLUSTER, Math.ceil(vote.count * 0.5))) continue;
    if (!best || vote.count > best.count || (vote.count === best.count && deltaE > best.deltaE)) {
      best = { code, count: vote.count, deltaE };
    }
  }
  return best?.code ?? null;
}

/**
 * Keep a detail code only where detail cells form a line or patch across
 * neighbours. A lone detail cell surrounded by plain cells reads as noise on a
 * bead chart, however strong its in-cell contrast is.
 */
function connectedDetailMask(details: Cell[], w: number, h: number, minSize: number): Uint8Array {
  const seen = new Uint8Array(details.length);
  const keep = new Uint8Array(details.length);
  for (let start = 0; start < details.length; start += 1) {
    if (!details[start] || seen[start]) continue;
    seen[start] = 1;
    const group: number[] = [];
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      group.push(index);
      const x = index % w;
      const y = Math.floor(index / w);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const next = ny * w + nx;
          if (seen[next] || !details[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (group.length >= minSize) {
      for (const index of group) keep[index] = 1;
    }
  }
  return keep;
}

/**
 * Vote in bead-code space, not in RGB space: each sampled pixel is first mapped
 * to a real bead code, then the most-voted code wins the cell. A connected,
 * high-contrast minority may override it to preserve thin lines.
 */
export function quantizeByVote(
  image: ImageLike,
  w: number,
  h: number,
  paletteId: string,
  params: Pick<ConvertParams, 'transparentAsEmpty' | 'backgroundTolerance' | 'detailPreserve' | 'excludeSpecial'>,
): QuantizeResult {
  const excludeSpecial = params.excludeSpecial !== false;
  const colors: BeadColor[] = usableColors(paletteId, excludeSpecial);
  const cache: LabCache = usableLabCache(paletteId, excludeSpecial);
  const matchKey = effectivePaletteKey(paletteId, excludeSpecial);
  const detailPreserve = params.detailPreserve !== false;
  const sampled = sampleCells(image, w, h, params);
  const winners: Cell[] = new Array<Cell>(w * h).fill(null);
  const details: Cell[] = new Array<Cell>(w * h).fill(null);
  const winnerDelta = new Float64Array(w * h);
  const detailDelta = new Float64Array(w * h);

  sampled.forEach((cell, index) => {
    if (cell.empty) return;
    const votes = new Map<string, { count: number; deltaSum: number; points: CellPixel[] }>();
    for (const pixel of cell.pixels) {
      const key = bucketKey(pixel.rgb.r, pixel.rgb.g, pixel.rgb.b);
      const match = cachedMatch(matchKey, key, colors, cache);
      if (!match) continue;
      const vote = votes.get(match.color.code) ?? { count: 0, deltaSum: 0, points: [] };
      vote.count += 1;
      vote.deltaSum += match.deltaE;
      vote.points.push(pixel);
      votes.set(match.color.code, vote);
    }
    const winner = [...votes.entries()].reduce<{
      code: string;
      count: number;
      deltaSum: number;
      points: CellPixel[];
    } | null>(
      (best, [code, vote]) => (!best || vote.count > best.count ? { ...vote, code } : best),
      null,
    );
    if (!winner) return;
    winners[index] = winner.code;
    winnerDelta[index] = winner.deltaSum / winner.count;
    const detail = detailPreserve ? pickDetail(votes, winner.code, cache) : null;
    if (detail) {
      details[index] = detail;
      const vote = votes.get(detail);
      detailDelta[index] = vote ? vote.deltaSum / vote.count : 0;
    }
  });

  // On tiny charts every cell matters and there is no neighbourhood to speak of.
  const minRun = Math.min(DETAIL_MIN_CELL_CLUSTER, w * h);
  const keep = connectedDetailMask(details, w, h, minRun);
  const cells: Cell[] = new Array<Cell>(w * h).fill(null);
  let approximated = 0;
  for (let index = 0; index < cells.length; index += 1) {
    if (!winners[index]) continue;
    const useDetail = keep[index] === 1 && details[index] !== null;
    cells[index] = useDetail ? details[index] : winners[index];
    if (isApproximate(useDetail ? detailDelta[index] : winnerDelta[index])) approximated += 1;
  }

  return { cells, approximated };
}

/**
 * Single conversion entry point. Dithering needs a continuous RGB cell colour
 * to diffuse error; the default path votes directly by bead code.
 */
export function quantizeImage(
  image: ImageLike,
  w: number,
  h: number,
  paletteId: string,
  params: Pick<
    ConvertParams,
    'dithering' | 'transparentAsEmpty' | 'backgroundTolerance' | 'detailPreserve' | 'excludeSpecial'
  >,
): QuantizeResult {
  if (params.dithering) {
    return quantizeGrid(sampleGrid(image, w, h, params), w, h, paletteId, params);
  }
  return quantizeByVote(image, w, h, paletteId, params);
}

