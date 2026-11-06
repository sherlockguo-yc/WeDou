import { hexOf } from '../core/palettes';
import type { Cell, Pattern } from '../core/types';

/** A preview, not a chart to build from: small cells stay solid colour with no codes or lines. */
export const THUMB_MAX_SIDE = 200;
export const PREVIEW_SIDE = 640;
export const THUMB_EMPTY = '#fbf8f1';

export type ThumbSource = Pick<Pattern, 'cells' | 'w' | 'h' | 'paletteId'>;

export function thumbSize(w: number, h: number, maxSide = THUMB_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Nearest-neighbour style downsampling: one source cell per preview pixel. */
export function thumbPixels(source: ThumbSource, width: number, height: number): string[] {
  const pixels: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(source.h - 1, Math.floor((y * source.h) / height));
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(source.w - 1, Math.floor((x * source.w) / width));
      const code = source.cells[row * source.w + col] ?? null;
      pixels.push(code ? hexOf(source.paletteId, code) ?? THUMB_EMPTY : THUMB_EMPTY);
    }
  }
  return pixels;
}

/** Market detail rebuilds a large preview from the full grid, sharper than the stored thumb. */
export function renderGridPreview(
  cells: Cell[],
  w: number,
  h: number,
  paletteId: string,
  maxSide = PREVIEW_SIDE,
): string {
  if (cells.length !== w * h) return '';
  return renderThumbDataUrl({ cells, w, h, paletteId }, maxSide);
}

export function renderThumbDataUrl(source: ThumbSource, maxSide = THUMB_MAX_SIDE): string {
  const { width, height } = thumbSize(source.w, source.h, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const pixels = thumbPixels(source, width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      ctx.fillStyle = pixels[y * width + x];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

const cache = new Map<string, string>();

/** Reuse previews across re-renders; the key changes whenever the grid or version changes. */
export function thumbFor(pattern: Pattern): string {
  const key = `${pattern.id}:${pattern.updatedAt}:${pattern.version}:${pattern.cells.length}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const url = renderThumbDataUrl(pattern);
  if (url) cache.set(key, url);
  return url;
}
