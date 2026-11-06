import { hexOf } from '../core/palettes';
import type { Pattern } from '../core/types';

/** A preview, not a chart to build from: small cells stay solid colour with no codes or lines. */
export const THUMB_MAX_SIDE = 200;
export const THUMB_EMPTY = '#fbf8f1';

export function thumbSize(w: number, h: number, maxSide = THUMB_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Nearest-neighbour style downsampling: one source cell per preview pixel. */
export function thumbPixels(pattern: Pattern, width: number, height: number): string[] {
  const pixels: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(pattern.h - 1, Math.floor((y * pattern.h) / height));
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(pattern.w - 1, Math.floor((x * pattern.w) / width));
      const code = pattern.cells[row * pattern.w + col] ?? null;
      pixels.push(code ? hexOf(pattern.paletteId, code) ?? THUMB_EMPTY : THUMB_EMPTY);
    }
  }
  return pixels;
}

export function renderThumbDataUrl(pattern: Pattern, maxSide = THUMB_MAX_SIDE): string {
  const { width, height } = thumbSize(pattern.w, pattern.h, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const pixels = thumbPixels(pattern, width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      ctx.fillStyle = pixels[y * width + x];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

const cache = new Map<string, string>();

/** Reuse previews across re-renders; the key changes whenever the grid or name changes. */
export function thumbFor(pattern: Pattern): string {
  const key = `${pattern.id}:${pattern.updatedAt}:${pattern.version}:${pattern.cells.length}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const url = renderThumbDataUrl(pattern);
  if (url) cache.set(key, url);
  return url;
}
