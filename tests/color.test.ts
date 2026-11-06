import { describe, expect, it } from 'vitest';
import { deltaE00, hexToLab, hexToRgb, nearestColor } from '../src/core/color';
import {
  CROSS_SOURCE_DISPUTES,
  DEFAULT_PALETTE_ID,
  PALETTES,
  beadNote,
  duplicateCodes,
  getLabCache,
  getPalette,
  specialCodeCount,
} from '../src/core/palettes';
import { quantizeImage } from '../src/core/convert';
import type { ImageLike } from '../src/core/convert';
import { DEFAULT_PARAMS } from '../src/core/types';
import { exportNote } from '../src/render/png';

function solid(width: number, height: number, rgb: [number, number, number]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([...rgb, 255], i * 4);
  return { data, width, height };
}

describe('colour conversion', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('maps pure black and white to L=0 and L=100', () => {
    expect(hexToLab('#000000').L).toBeCloseTo(0, 5);
    expect(hexToLab('#FFFFFF').L).toBeCloseTo(100, 5);
  });
});

describe('CIEDE2000', () => {
  it('is zero for identical colours', () => {
    expect(deltaE00(hexToLab('#E53B44'), hexToLab('#E53B44'))).toBe(0);
  });

  it('is 100 for black versus white', () => {
    expect(deltaE00(hexToLab('#000000'), hexToLab('#FFFFFF'))).toBeCloseTo(100, 2);
  });

  it('matches the Sharma et al. reference pair (2.0425)', () => {
    const first = { L: 50, a: 2.6772, b: -79.7751 };
    const second = { L: 50, a: 0, b: -82.7485 };
    expect(deltaE00(first, second)).toBeCloseTo(2.0425, 3);
  });
});

describe('palette matching', () => {
  it('contains the seven verified palettes', () => {
    expect(PALETTES.map((palette) => palette.colors.length)).toEqual([221, 291, 117, 89, 176, 221, 291]);
  });

  it('includes the Artkal Mini and COCO kits with valid codes', () => {
    expect(getPalette('artkal-mini-221').colors[0].code).toBe('MA1');
    expect(getPalette('coco-291').colors[0].code).toBe('E02');
    expect(duplicateCodes('artkal-mini-221').size).toBe(1);
  });

  it('has unique codes and valid hex values in every palette', () => {
    for (const palette of PALETTES) {
      const codes = new Set(palette.colors.map((color) => color.code));
      expect(codes.size).toBe(palette.colors.length);
      expect(palette.colors.every((color) => /^#[0-9A-F]{6}$/.test(color.hex))).toBe(true);
    }
  });

  it('defaults to the MARD 221 kit', () => {
    expect(DEFAULT_PALETTE_ID).toBe('mard-221');
  });

  it('reports codes that share one HEX', () => {
    const duplicates = duplicateCodes('mard-291');
    expect([...duplicates.values()].some((codes) => codes.includes('Q4') && codes.includes('R11'))).toBe(true);
    expect(duplicateCodes('mard-221').size).toBe(0);
  });

  it('finds a bounded nearest colour for an arbitrary RGB', () => {
    const palette = getPalette('mard-221');
    const match = nearestColor(hexToLab('#D22B3A'), palette.colors, getLabCache('mard-221'));
    expect(match).not.toBeNull();
    expect(match?.deltaE).toBeLessThan(30);
    expect(palette.colors.some((color) => color.code === match?.color.code)).toBe(true);
  });
});

describe('palette data notes', () => {
  it('flags exactly the 70 effect beads that MARD 291 adds to the 221 kit', () => {
    expect(specialCodeCount('mard-291')).toBe(70);
    expect(specialCodeCount('mard-221')).toBe(0);
    expect(specialCodeCount('perler-117')).toBe(0);
  });

  it('describes the finish of an effect bead and leaves ordinary codes alone', () => {
    expect(beadNote('mard-291', 'R13').finish).toContain('果冻');
    expect(beadNote('mard-291', 'Q5').finish).toContain('温变');
    expect(beadNote('mard-291', 'ZG1').finish).toContain('光变');
    expect(beadNote('mard-291', 'H5').finish).toBeUndefined();
    expect(beadNote('mard-221', 'H5').finish).toBeUndefined();
    expect(beadNote('perler-117', 'P01').finish).toBeUndefined();
  });

  it('marks cross-source disputes on both MARD kits without changing colours', () => {
    expect(beadNote('mard-291', 'Q5').disputedDeltaE).toBe(38.3);
    expect(beadNote('mard-221', 'H16').disputedDeltaE).toBe(11.2);
    expect(beadNote('mard-291', 'R13').disputedDeltaE).toBeUndefined();
    expect(beadNote('perler-117', 'P01').disputedDeltaE).toBeUndefined();
    expect(getPalette('mard-291').colors.find((color) => color.code === 'Q5')?.hex).toBe('#4F5E5B');
  });
});

describe('palette data guard', () => {
  it('keeps every disputed code present in a palette it annotates', () => {
    const codes291 = new Set(getPalette('mard-291').colors.map((color) => color.code));
    const codes221 = new Set(getPalette('mard-221').colors.map((color) => color.code));
    for (const code of Object.keys(CROSS_SOURCE_DISPUTES)) {
      expect(codes291.has(code) || codes221.has(code)).toBe(true);
    }
  });

  it('matches the effect series exactly to the 70 codes MARD 291 adds', () => {
    const base = new Set(getPalette('mard-221').colors.map((color) => color.code));
    const extra = getPalette('mard-291').colors
      .filter((color) => !base.has(color.code))
      .map((color) => color.code);
    expect(extra).toHaveLength(70);
    expect(extra.every((code) => beadNote('mard-291', code).finish)).toBe(true);
  });

  it('defaults to MARD 221 with effect beads excluded', () => {
    expect(DEFAULT_PALETTE_ID).toBe('mard-221');
    expect(DEFAULT_PARAMS.excludeSpecial).toBe(true);
  });
});

describe('effect bead exclusion', () => {
  const special = solid(4, 4, [85, 81, 76]);
  const base = {
    dithering: false,
    transparentAsEmpty: true,
    backgroundTolerance: 0,
    detailPreserve: false,
  };
  const options = (excludeSpecial: boolean) => ({ ...base, excludeSpecial });
  const isPlain = (code: string | null) => Boolean(code) && !beadNote('mard-291', code as string).finish;

  it('uses R13 only when the switch is off', () => {
    const full = quantizeImage(special, 2, 2, 'mard-291', options(false));
    const filtered = quantizeImage(special, 2, 2, 'mard-291', options(true));
    expect(full.cells.every((code) => code === 'R13')).toBe(true);
    expect(filtered.cells.every(isPlain)).toBe(true);
  });

  it('keeps filtered and full matches in separate caches', () => {
    const full = quantizeImage(special, 2, 2, 'mard-291', options(false)).cells;
    const filtered = quantizeImage(special, 2, 2, 'mard-291', options(true)).cells;
    const again = quantizeImage(special, 2, 2, 'mard-291', options(false)).cells;
    expect(again).toEqual(full);
    expect(filtered).not.toEqual(full);
  });

  it('also excludes effect beads on the dithering path', () => {
    const cells = quantizeImage(special, 2, 2, 'mard-291', { ...base, dithering: true, excludeSpecial: true }).cells;
    expect(cells.every(isPlain)).toBe(true);
  });

  it('labels export rows without touching the colour values', () => {
    expect(exportNote('mard-291', 'R13')).toBe('EFFECT');
    expect(exportNote('mard-291', 'Q5')).toBe('EFFECT / DISPUTED');
    expect(exportNote('mard-221', 'H5')).toBe('');
  });
});
