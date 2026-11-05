import { describe, expect, it } from 'vitest';
import { nearestColor, rgbToLab } from '../src/core/color';
import { quantizeGrid, sampleGrid } from '../src/core/convert';
import { limitColors, removeIsolated } from '../src/core/optimize';
import { createPattern } from '../src/core/pattern';
import { getLabCache, getPalette } from '../src/core/palettes';
import { usageRows, patternStats } from '../src/core/stats';
import type { ImageLike } from '../src/core/convert';

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
