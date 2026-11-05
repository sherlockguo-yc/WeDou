import { describe, expect, it } from 'vitest';
import { nearestColor, rgbToLab } from '../src/core/color';
import { bucketCenter, bucketKey, quantizeGrid, quantizeImage, sampleCells, sampleGrid } from '../src/core/convert';
import { limitColors, removeIsolated } from '../src/core/optimize';
import { createPattern } from '../src/core/pattern';
import { getLabCache, getPalette } from '../src/core/palettes';
import { usageRows, patternStats } from '../src/core/stats';
import type { ImageLike } from '../src/core/convert';
import type { Rgb } from '../src/core/types';

function solidImage(width: number, height: number, rgba: [number, number, number, number]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set(rgba, i * 4);
  }
  return { data, width, height };
}

const noBackground = { transparentAsEmpty: true, backgroundTolerance: 0 };

describe('sampleGrid', () => {
  it('takes one representative colour per cell', () => {
    const samples = sampleGrid(solidImage(4, 4, [220, 30, 30, 255]), 2, 2, noBackground);
    expect(samples).toHaveLength(4);
    expect(samples.every((sample) => sample?.r === 220 && sample?.b === 30)).toBe(true);
  });

  it('treats transparent pixels as empty beads', () => {
    const samples = sampleGrid(solidImage(4, 4, [220, 30, 30, 0]), 2, 2, noBackground);
    expect(samples.every((sample) => sample === null)).toBe(true);
  });

  it('removes a flat corner background when tolerance is enabled', () => {
    const samples = sampleGrid(solidImage(4, 4, [250, 250, 250, 255]), 2, 2, {
      transparentAsEmpty: true,
      backgroundTolerance: 18,
    });
    expect(samples.every((sample) => sample === null)).toBe(true);
  });
});

describe('quantizeGrid', () => {
  it('produces only codes that exist in the selected palette', () => {
    const samples = sampleGrid(solidImage(4, 4, [220, 30, 30, 255]), 2, 2, noBackground);
    const { cells } = quantizeGrid(samples, 2, 2, 'mard-221', { dithering: false });
    const valid = new Set(getPalette('mard-221').colors.map((color) => color.code));
    expect(cells).toHaveLength(4);
    expect(cells.every((code) => code && valid.has(code))).toBe(true);
  });

  it('keeps empty cells empty through dithering', () => {
    const samples = [null, { r: 10, g: 20, b: 30 }, null, null];
    const { cells } = quantizeGrid(samples, 2, 2, 'hama-89', { dithering: true });
    expect(cells.filter((cell) => cell === null)).toHaveLength(3);
  });
});

describe('optimisation', () => {
  it('limits the number of colours', () => {
    const palette = getPalette('mard-221');
    const cells = palette.colors.slice(0, 30).map((color) => color.code);
    const result = limitColors(cells, 5, 'mard-221');
    expect(new Set(result.cells).size).toBeLessThanOrEqual(5);
    expect(result.mergedCodes.length).toBeGreaterThan(0);
  });

  it('folds an isolated bead into its neighbours', () => {
    const cells = new Array<string>(9).fill('A1');
    cells[4] = 'A2';
    expect(removeIsolated(cells, 3, 3)[4]).toBe('A1');
  });
});

describe('approximate colour reporting', () => {
  it('counts far-from-palette cells in both dither modes', () => {
    const palette = getPalette('hama-89');
    const cache = getLabCache('hama-89');
    let far: { r: number; g: number; b: number } | null = null;
    for (let r = 0; r < 256 && !far; r += 37) {
      for (let g = 0; g < 256 && !far; g += 37) {
        for (let b = 0; b < 256 && !far; b += 37) {
          const candidate = { r, g, b };
          const match = nearestColor(rgbToLab(candidate), palette.colors, cache);
          if (match && match.deltaE > 10) far = candidate;
        }
      }
    }
    expect(far).not.toBeNull();
    const samples: ({ r: number; g: number; b: number } | null)[] = [far];
    expect(quantizeGrid(samples, 1, 1, 'hama-89', { dithering: false }).approximated).toBe(1);
    expect(quantizeGrid(samples, 1, 1, 'hama-89', { dithering: true }).approximated).toBe(1);
  });
});

describe('usage and stats', () => {
  it('sorts rows by bead count and computes ratios', () => {
    const pattern = createPattern({ w: 2, h: 2, cells: ['A1', 'A1', 'A2', null] });
    const rows = usageRows(pattern);
    expect(rows.map((row) => row.count)).toEqual([2, 1]);
    expect(rows[0].symbol).not.toBe(rows[1].symbol);
    expect(rows.reduce((sum, row) => sum + row.ratio, 0)).toBeCloseTo(1, 6);
  });

  it('counts beads, empties and boards', () => {
    const pattern = createPattern({ w: 2, h: 2, cells: ['A1', null, 'A2', null] });
    const stats = patternStats(pattern);
    expect(stats.totalBeads).toBe(2);
    expect(stats.emptyCells).toBe(2);
    expect(stats.colorCount).toBe(2);
    expect(stats.boards).toBe(1);
  });
});

function paintedImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(fill(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
}

/** Invariants that must hold no matter how a cell's representative colour is chosen. */
describe('cell sampling contract', () => {
  const paletteId = 'mard-291';
  const valid = () => new Set(getPalette(paletteId).colors.map((color) => color.code));
  const params = (dithering: boolean) => ({ dithering, ...noBackground });

  it('splits the image into cells without overlap or gaps', () => {
    const image = paintedImage(4, 4, (x) => (x < 2 ? [220, 30, 30, 255] : [30, 30, 220, 255]));
    const samples = sampleGrid(image, 2, 2, noBackground);
    expect(samples).toHaveLength(4);
    expect(samples[0]?.r).toBeGreaterThan(200);
    expect(samples[1]?.b).toBeGreaterThan(200);
    expect(samples[2]?.r).toBeGreaterThan(200);
    expect(samples[3]?.b).toBeGreaterThan(200);
  });

  it('maps a solid cell to the nearest code of the selected palette', () => {
    // 220/28/28 sits exactly at a bucket centre, so both paths see the same colour.
    const rgb = { r: 220, g: 28, b: 28 };
    const palette = getPalette(paletteId);
    const expected = nearestColor(rgbToLab(rgb), palette.colors, getLabCache(paletteId))?.color.code;
    expect(expected).toBeTruthy();
    const image = solidImage(4, 4, [220, 28, 28, 255]);
    const plain = quantizeImage(image, 2, 2, paletteId, params(false));
    expect(plain.cells.every((code) => code === expected)).toBe(true);
    // Dithering deliberately diffuses error into neighbouring cells, so a flat
    // image is not expected to stay flat; only palette membership is contractual.
    const dither = quantizeImage(image, 2, 2, paletteId, params(true));
    expect(dither.cells.every((code) => !code || valid().has(code))).toBe(true);
  });

  it('never emits a code outside the selected palette, with or without dithering', () => {
    const image = paintedImage(4, 4, (x, y) =>
      x + y < 3 ? [220, 30, 30, 255] : [30, 30, 220, 255],
    );
    for (const dithering of [false, true]) {
      const { cells } = quantizeImage(image, 2, 2, paletteId, params(dithering));
      expect(cells).toHaveLength(4);
      expect(cells.every((code) => !code || valid().has(code))).toBe(true);
    }
  });

  it('agrees on empty cells with and without dithering', () => {
    const image = paintedImage(4, 4, (x) => (x < 2 ? [220, 30, 30, 0] : [30, 30, 220, 255]));
    const plain = quantizeImage(image, 2, 2, paletteId, params(false));
    const dither = quantizeImage(image, 2, 2, paletteId, params(true));
    expect(plain.cells.filter((code) => code === null)).toHaveLength(2);
    expect(plain.cells.map((code) => code === null)).toEqual(dither.cells.map((code) => code === null));
  });
});

describe('voting by bead code', () => {
  const paletteId = 'mard-291';
  const colors = getPalette(paletteId).colors;
  const cache = getLabCache(paletteId);
  const codeOf = (rgb: Rgb) =>
    nearestColor(rgbToLab(bucketCenter(bucketKey(rgb.r, rgb.g, rgb.b))), colors, cache)?.color.code;

  it('merges votes from near-identical colours split across bucket boundaries', () => {
    let pair: { a: Rgb; b: Rgb; contrast: Rgb; shared: string } | null = null;
    for (let r = 8; r < 248 && !pair; r += 8) {
      const a: Rgb = { r: r - 1, g: 100, b: 100 };
      const b: Rgb = { r, g: 100, b: 100 };
      if (bucketKey(a.r, a.g, a.b) === bucketKey(b.r, b.g, b.b)) continue;
      const shared = codeOf(a);
      if (!shared || shared !== codeOf(b)) continue;
      for (const contrast of [
        { r: 20, g: 20, b: 220 }, { r: 20, g: 220, b: 20 },
        { r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 20 },
      ]) {
        if (codeOf(contrast) !== shared) {
          pair = { a, b, contrast, shared };
          break;
        }
      }
    }
    expect(pair).not.toBeNull();
    const found = pair as { a: Rgb; b: Rgb; contrast: Rgb; shared: string };
    const image = paintedImage(6, 6, (x, y) => {
      const index = y * 6 + x;
      const rgb = index < 10 ? found.a : index < 20 ? found.b : found.contrast;
      return [rgb.r, rgb.g, rgb.b, 255] as [number, number, number, number];
    });
    const { cells } = quantizeImage(image, 1, 1, paletteId, { dithering: false, ...noBackground });
    expect(cells).toEqual([found.shared]);
  });

  it('never invents a code from an averaged mix of two colours', () => {
    const candidates: Rgb[] = [
      { r: 220, g: 30, b: 30 }, { r: 30, g: 30, b: 220 }, { r: 30, g: 220, b: 30 },
      { r: 240, g: 240, b: 240 }, { r: 20, g: 20, b: 20 }, { r: 240, g: 200, b: 40 },
      { r: 120, g: 60, b: 180 }, { r: 60, g: 180, b: 120 },
    ];
    const mix = candidates
      .flatMap((a) => candidates.map((b) => ({ a, b })))
      .find(({ a, b }) => {
        const ca = codeOf(a);
        const cb = codeOf(b);
        if (!ca || !cb || ca === cb) return false;
        const avg = {
          r: Math.round((a.r + b.r) / 2),
          g: Math.round((a.g + b.g) / 2),
          b: Math.round((a.b + b.b) / 2),
        };
        const cm = codeOf(avg);
        return Boolean(cm && cm !== ca && cm !== cb);
      });
    expect(mix).toBeTruthy();
    const found = mix as { a: Rgb; b: Rgb };
    const image = paintedImage(6, 6, (_x, y) => {
      const rgb = y < 3 ? found.a : found.b;
      return [rgb.r, rgb.g, rgb.b, 255] as [number, number, number, number];
    });
    const allowed = [codeOf(found.a), codeOf(found.b)];
    const { cells } = quantizeImage(image, 1, 1, paletteId, { dithering: false, ...noBackground });
    expect(allowed).toContain(cells[0]);
  });

  it('gives identical results when the shared bucket cache is warm', () => {
    const image = paintedImage(6, 6, (x, y) =>
      (x + y) % 3 === 0 ? [220, 30, 30, 255] : [30, 30, 220, 255],
    );
    const options = { dithering: false, ...noBackground };
    const first = quantizeImage(image, 3, 3, paletteId, options).cells;
    const second = quantizeImage(image, 3, 3, paletteId, options).cells;
    quantizeImage(image, 3, 3, 'perler-117', options);
    const back = quantizeImage(image, 3, 3, paletteId, options).cells;
    expect(second).toEqual(first);
    expect(back).toEqual(first);
  });
});

describe('background detection', () => {
  const enabled = { transparentAsEmpty: true, backgroundTolerance: 18 };

  it('never removes opaque pixels when background detection is off', () => {
    const image = paintedImage(8, 8, (_x, y) => {
      const v = 58 + Math.round((y * 113) / 7);
      return [v, v, v, 255];
    });
    const cells = sampleCells(image, 4, 4, { ...enabled, backgroundTolerance: 0 });
    expect(cells.every((cell) => !cell.empty)).toBe(true);
  });

  it('does not guess a background from a gradient', () => {
    const image = paintedImage(8, 8, (_x, y) => {
      const v = 58 + Math.round((y * 113) / 7);
      return [v, v, v, 255];
    });
    const cells = sampleCells(image, 4, 4, enabled);
    expect(cells.filter((cell) => cell.empty)).toHaveLength(0);
  });

  it('keeps a flat background empty but preserves the subject', () => {
    const image = paintedImage(10, 10, (x, y) => {
      const cx = Math.floor(x / 2);
      const cy = Math.floor(y / 2);
      if (cx >= 1 && cx <= 3 && cy >= 1 && cy <= 3) {
        return cx === 2 && cy === 2 ? [250, 250, 250, 255] : [20, 20, 20, 255];
      }
      return [250, 250, 250, 255];
    });
    const cells = sampleCells(image, 5, 5, enabled);
    expect(cells[0].empty).toBe(true);
    expect(cells[4].empty).toBe(true);
    expect(cells[12].empty).toBe(false);
  });

  it('keeps a background-coloured region that is enclosed by the subject', () => {
    const image = paintedImage(10, 10, (x, y) => {
      const cx = Math.floor(x / 2);
      const cy = Math.floor(y / 2);
      if (cx >= 1 && cx <= 3 && cy >= 1 && cy <= 3) {
        return cx === 2 && cy === 2 ? [250, 250, 250, 255] : [20, 20, 20, 255];
      }
      return [250, 250, 250, 255];
    });
    const cells = sampleCells(image, 5, 5, enabled);
    expect(cells[2 * 5 + 2].backgroundEmpty).toBe(false);
    expect(cells[2 * 5 + 2].empty).toBe(false);
    expect(cells[0].backgroundEmpty).toBe(true);
  });

  it('still treats alpha-transparent pixels as empty in both paths', () => {
    const image = paintedImage(4, 4, (x) => (x < 2 ? [250, 250, 250, 0] : [20, 20, 20, 255]));
    const options = { dithering: false, ...noBackground };
    for (const dithering of [false, true]) {
      const { cells } = quantizeImage(image, 2, 2, 'mard-291', { ...options, dithering });
      expect(cells.map((code) => code === null)).toEqual([true, false, true, false]);
    }
  });

  it('produces no empty cells for a gradient under the default settings', () => {
    const image = paintedImage(8, 8, (_x, y) => {
      const v = 58 + Math.round((y * 113) / 7);
      return [v, v, v, 255];
    });
    const { cells } = quantizeImage(image, 4, 4, 'mard-291', {
      dithering: false,
      transparentAsEmpty: true,
      backgroundTolerance: 0,
    });
    expect(cells.every((code) => code !== null)).toBe(true);
  });
});

describe('detail preservation', () => {
  const paletteId = 'mard-291';
  const colors = getPalette(paletteId).colors;
  const cache = getLabCache(paletteId);
  const codeOf = (rgb: Rgb) =>
    nearestColor(rgbToLab(bucketCenter(bucketKey(rgb.r, rgb.g, rgb.b))), colors, cache)?.color.code;
  const light: Rgb = { r: 230, g: 230, b: 230 };
  const dark: Rgb = { r: 20, g: 20, b: 20 };
  const options = (detailPreserve: boolean) => ({
    dithering: false,
    ...noBackground,
    detailPreserve,
  });

  it('keeps a high-contrast thin line that loses the popular vote', () => {
    const image = paintedImage(6, 6, (_x, y) =>
      y === 2 ? [dark.r, dark.g, dark.b, 255] : [light.r, light.g, light.b, 255],
    );
    expect(codeOf(dark)).not.toBe(codeOf(light));
    const { cells } = quantizeImage(image, 1, 1, paletteId, options(true));
    expect(cells).toEqual([codeOf(dark)]);
  });

  it('does not promote scattered contrast pixels that form no line or patch', () => {
    const scattered = new Set(['0,0', '2,2', '4,4', '1,4', '3,1', '5,3']);
    const image = paintedImage(6, 6, (x, y) =>
      scattered.has(`${x},${y}`)
        ? [dark.r, dark.g, dark.b, 255]
        : [light.r, light.g, light.b, 255],
    );
    const { cells } = quantizeImage(image, 1, 1, paletteId, options(true));
    expect(cells).toEqual([codeOf(light)]);
  });

  it('keeps a diagonal line, not just horizontal or vertical ones', () => {
    const image = paintedImage(6, 6, (x, y) =>
      x === y ? [dark.r, dark.g, dark.b, 255] : [light.r, light.g, light.b, 255],
    );
    const { cells } = quantizeImage(image, 1, 1, paletteId, options(true));
    expect(cells).toEqual([codeOf(dark)]);
  });

  it('ignores an isolated noise pixel', () => {
    const image = paintedImage(6, 6, (x, y) =>
      x === 0 && y === 0
        ? [dark.r, dark.g, dark.b, 255]
        : [light.r, light.g, light.b, 255],
    );
    const { cells } = quantizeImage(image, 1, 1, paletteId, options(true));
    expect(cells).toEqual([codeOf(light)]);
  });

  it('does not override an almost equal split', () => {
    const image = paintedImage(6, 6, (_x, y) =>
      y < 3 ? [light.r, light.g, light.b, 255] : [dark.r, dark.g, dark.b, 255],
    );
    const { cells } = quantizeImage(image, 1, 1, paletteId, options(true));
    expect(cells).toEqual([codeOf(light)]);
  });

  it('falls back to the plain majority vote when switched off', () => {
    const image = paintedImage(6, 6, (_x, y) =>
      y === 2 ? [dark.r, dark.g, dark.b, 255] : [light.r, light.g, light.b, 255],
    );
    const { cells } = quantizeImage(image, 1, 1, paletteId, options(false));
    expect(cells).toEqual([codeOf(light)]);
  });

  it('leaves solid cells and the dithering path untouched', () => {
    const solid = solidImage(4, 4, [light.r, light.g, light.b, 255]);
    const plain = quantizeImage(solid, 2, 2, paletteId, options(true));
    const dither = quantizeImage(solid, 2, 2, paletteId, { ...options(true), dithering: true });
    expect(plain.cells.every((code) => code === codeOf(light))).toBe(true);
    expect(dither.cells.every((code) => !code || validCodes().has(code))).toBe(true);
  });

  it('suppresses a one-off detail cell with no neighbouring detail cells', () => {
    const image = paintedImage(12, 12, (x, y) =>
      x >= 4 && x < 8 && y === 5
        ? [dark.r, dark.g, dark.b, 255]
        : [light.r, light.g, light.b, 255],
    );
    const { cells } = quantizeImage(image, 3, 3, paletteId, options(true));
    expect(cells[4]).toBe(codeOf(light));
  });

  it('keeps detail cells that line up across neighbours', () => {
    const image = paintedImage(12, 12, (_x, y) =>
      y === 5 ? [dark.r, dark.g, dark.b, 255] : [light.r, light.g, light.b, 255],
    );
    const { cells } = quantizeImage(image, 3, 3, paletteId, options(true));
    expect([cells[3], cells[4], cells[5]].every((code) => code === codeOf(dark))).toBe(true);
  });

  function validCodes() {
    return new Set(getPalette(paletteId).colors.map((color) => color.code));
  }
});
