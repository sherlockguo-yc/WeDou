import { hexToRgb, isApproximate, nearestColor, rgbToLab } from './color';
import type { ColorMatch, LabCache } from './color';
import { getLabCache, getPalette } from './palettes';
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
 * A bucket always maps to the same code for a given palette. Caching it across
 * conversions makes parameter tweaks and palette switches cheap, and the cache
 * is naturally bounded by the 32^3 possible buckets.
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
function modeColor(pixels: Rgb[]): Rgb | null {
  const buckets = new Map<number, { count: number; sum: Rgb }>();
  for (const pixel of pixels) {
    const key = bucketKey(pixel.r, pixel.g, pixel.b);
    const entry = buckets.get(key) ?? { count: 0, sum: { r: 0, g: 0, b: 0 } };
    entry.count += 1;
    entry.sum.r += pixel.r;
    entry.sum.g += pixel.g;
    entry.sum.b += pixel.b;
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

export interface CellSamples {
  pixels: Rgb[];
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

      const pixels: Rgb[] = [];
      let considered = 0;
      let transparent = 0;
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const offset = (y * width + x) * 4;
          considered += 1;
          if (data[offset + 3] < 128) {
            transparent += 1;
            continue;
          }
          pixels.push({ r: data[offset], g: data[offset + 1], b: data[offset + 2] });
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
  params: Pick<ConvertParams, 'dithering'>,
): QuantizeResult {
  const palette = getPalette(paletteId);
  const cache: LabCache = getLabCache(paletteId);
  const colors: BeadColor[] = palette.colors;
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

/**
 * Vote in bead-code space, not in RGB space: each sampled pixel is first mapped
 * to a real bead code, then the most-voted code wins the cell. Near-identical
 * colours split across adjacent buckets contribute to the same code, and no
 * synthetic "average" colour can ever be looked up in the palette.
 */
export function quantizeByVote(
  image: ImageLike,
  w: number,
  h: number,
  paletteId: string,
  params: Pick<ConvertParams, 'transparentAsEmpty' | 'backgroundTolerance'>,
): QuantizeResult {
  const colors: BeadColor[] = getPalette(paletteId).colors;
  const cache: LabCache = getLabCache(paletteId);
  const cells: Cell[] = new Array<Cell>(w * h).fill(null);
  let approximated = 0;

  sampleCells(image, w, h, params).forEach((cell, index) => {
    if (cell.empty) return;
    const votes = new Map<string, { count: number; deltaSum: number }>();
    for (const pixel of cell.pixels) {
      const key = bucketKey(pixel.r, pixel.g, pixel.b);
      const match = cachedMatch(paletteId, key, colors, cache);
      if (!match) continue;
      const vote = votes.get(match.color.code) ?? { count: 0, deltaSum: 0 };
      vote.count += 1;
      vote.deltaSum += match.deltaE;
      votes.set(match.color.code, vote);
    }
    const winner = [...votes.entries()].reduce<{
      code: string;
      count: number;
      deltaSum: number;
    } | null>(
      (best, [code, vote]) => (!best || vote.count > best.count ? { ...vote, code } : best),
      null,
    );
    if (!winner) return;
    cells[index] = winner.code;
    if (isApproximate(winner.deltaSum / winner.count)) approximated += 1;
  });

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
  params: Pick<ConvertParams, 'dithering' | 'transparentAsEmpty' | 'backgroundTolerance'>,
): QuantizeResult {
  if (params.dithering) {
    return quantizeGrid(sampleGrid(image, w, h, params), w, h, paletteId, params);
  }
  return quantizeByVote(image, w, h, paletteId, params);
}

