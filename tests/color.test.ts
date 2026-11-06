import { describe, expect, it } from 'vitest';
import { deltaE00, hexToLab, hexToRgb, nearestColor } from '../src/core/color';
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  beadNote,
  duplicateCodes,
  getLabCache,
  getPalette,
  specialCodeCount,
} from '../src/core/palettes';

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
