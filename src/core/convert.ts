import { hexToRgb, nearestColor, rgbToLab } from './color';
import type { LabCache } from './color';
import { getLabCache, getPalette } from './palettes';
import type { BeadColor, Cell, ConvertParams, Rgb } from './types';

export interface ImageLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

const bucketKey = (r: number, g: number, b: number) =>
  ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

const distance = (a: Rgb, b: Rgb) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

function cornerBackground(image: ImageLike): Rgb | null {
  const { data, width, height } = image;
  const points = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  const total: Rgb = { r: 0, g: 0, b: 0 };
  let opaque = 0;
  for (const offset of points) {
    if (data[offset + 3] < 128) continue;
    total.r += data[offset];
    total.g += data[offset + 1];
    total.b += data[offset + 2];
    opaque += 1;
  }
  if (opaque === 0) return null;
  return { r: total.r / opaque, g: total.g / opaque, b: total.b / opaque };
}

/** One representative colour (mode of a quantised histogram) per bead cell. */
export function sampleGrid(
  image: ImageLike,
  w: number,
  h: number,
  params: Pick<ConvertParams, 'transparentAsEmpty' | 'backgroundTolerance'>,
): (Rgb | null)[] {
  const { data, width, height } = image;
  const background = params.backgroundTolerance > 0 ? cornerBackground(image) : null;
  const backgroundLimit = params.backgroundTolerance * 2.5;
  const samples: (Rgb | null)[] = [];

  for (let gy = 0; gy < h; gy += 1) {
    const y0 = Math.floor((gy * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / h));
    for (let gx = 0; gx < w; gx += 1) {
      const x0 = Math.floor((gx * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / w));
      const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 64)));

      const buckets = new Map<number, { count: number; sum: Rgb }>();
      let transparent = 0;
      let considered = 0;
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const offset = (y * width + x) * 4;
          considered += 1;
          if (data[offset + 3] < 128) {
            if (params.transparentAsEmpty) transparent += 1;
            continue;
          }
          const pixel: Rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
          if (background && distance(pixel, background) < backgroundLimit) {
            if (params.transparentAsEmpty) transparent += 1;
            continue;
          }
          const key = bucketKey(pixel.r, pixel.g, pixel.b);
          const entry = buckets.get(key) ?? { count: 0, sum: { r: 0, g: 0, b: 0 } };
          entry.count += 1;
          entry.sum.r += pixel.r;
          entry.sum.g += pixel.g;
          entry.sum.b += pixel.b;
          buckets.set(key, entry);
        }
      }

      if (considered === 0 || transparent / considered > 0.6 || buckets.size === 0) {
        samples.push(null);
        continue;
      }
      let best: { count: number; sum: Rgb } | null = null;
      for (const entry of buckets.values()) {
        if (!best || entry.count > best.count) best = entry;
      }
      const winner = best as { count: number; sum: Rgb };
      samples.push({
        r: Math.round(winner.sum.r / winner.count),
        g: Math.round(winner.sum.g / winner.count),
        b: Math.round(winner.sum.b / winner.count),
      });
    }
  }
  return samples;
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
        if (match.deltaE > 10) approximated += 1;
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
      if (match.deltaE > 10) approximated += 1;
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

