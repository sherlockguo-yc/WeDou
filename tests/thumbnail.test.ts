import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPattern } from '../src/core/pattern';
import { THUMB_EMPTY, renderThumbDataUrl, thumbFor, thumbPixels, thumbSize } from '../src/render/thumbnail';

function makePattern(cells: (string | null)[]) {
  return createPattern({ name: '测试图纸', w: 2, h: 2, paletteId: 'mard-221', cells });
}

function stubCanvas() {
  const fillRect = vi.fn();
  const ctx = { fillStyle: '', fillRect };
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => 'data:image/png;base64,AAA',
    }),
  });
  return { fillRect, ctx };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('thumbnail size', () => {
  it('keeps small grids at one pixel per bead', () => {
    expect(thumbSize(29, 29, 200)).toEqual({ width: 29, height: 29 });
    expect(thumbSize(2, 2, 200)).toEqual({ width: 2, height: 2 });
  });

  it('caps the longest side while preserving the ratio', () => {
    expect(thumbSize(200, 100, 200)).toEqual({ width: 200, height: 100 });
    expect(thumbSize(400, 100, 200)).toEqual({ width: 200, height: 50 });
    expect(thumbSize(1, 1, 200)).toEqual({ width: 1, height: 1 });
  });
});

describe('thumbnail pixels', () => {
  it('maps real colour codes and empty cells', () => {
    const pixels = thumbPixels(makePattern(['A1', null, null, 'A2']), 2, 2);
    expect(pixels).toHaveLength(4);
    expect(pixels[0]).toMatch(/^#[0-9A-F]{6}$/);
    expect(pixels[0]).not.toBe(THUMB_EMPTY);
    expect(pixels[1]).toBe(THUMB_EMPTY);
    expect(pixels[2]).toBe(THUMB_EMPTY);
    expect(pixels[3]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('downsamples by nearest neighbour without reading out of bounds', () => {
    const pattern = createPattern({
      name: '降采样',
      w: 4,
      h: 2,
      paletteId: 'mard-221',
      cells: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
    });
    const pixels = thumbPixels(pattern, 2, 1);
    expect(pixels).toHaveLength(2);
    expect(pixels[0]).not.toBe(THUMB_EMPTY);
    expect(pixels[1]).not.toBe(THUMB_EMPTY);
  });
});

describe('thumbnail rendering', () => {
  it('fills one rect per preview pixel and returns a PNG data URL', () => {
    const { fillRect, ctx } = stubCanvas();
    const url = renderThumbDataUrl(makePattern(['A1', null, null, 'A2']));
    expect(url).toBe('data:image/png;base64,AAA');
    expect(fillRect).toHaveBeenCalledTimes(4);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(ctx.fillStyle).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('returns an empty string when Canvas 2D is unavailable', () => {
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => null, toDataURL: () => '' }),
    });
    expect(renderThumbDataUrl(makePattern(['A1', null, null, 'A2']))).toBe('');
  });

  it('caches a preview per pattern version', () => {
    const { fillRect } = stubCanvas();
    const pattern = makePattern(['A1', null, null, 'A2']);
    const first = thumbFor(pattern);
    expect(thumbFor(pattern)).toBe(first);
    expect(fillRect).toHaveBeenCalledTimes(4);
    thumbFor({ ...pattern, version: pattern.version + 1 });
    expect(fillRect).toHaveBeenCalledTimes(8);
  });
});
