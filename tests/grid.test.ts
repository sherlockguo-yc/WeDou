import { describe, expect, it } from 'vitest';
import { dimmedFill, isDimmed } from '../src/render/grid';

function channels(rgb: string): number[] {
  return (rgb.match(/\d+/g) ?? []).map(Number);
}

describe('colour highlight dimming', () => {
  it('keeps every bead at full colour when nothing is selected', () => {
    expect(isDimmed('A1', null)).toBe(false);
    expect(isDimmed('A1', undefined)).toBe(false);
    expect(isDimmed(null, 'A1')).toBe(false);
  });

  it('dims only the other bead colours, never the selected one or empty cells', () => {
    expect(isDimmed('A1', 'A1')).toBe(false);
    expect(isDimmed('C10', 'A1')).toBe(true);
    expect(isDimmed(null, 'A1')).toBe(false);
  });

  it('blends toward paper while keeping a faint per-colour tint', () => {
    const paper = [247, 243, 232];
    const black = channels(dimmedFill('#000000'));
    const white = channels(dimmedFill('#FFFFFF'));
    expect(black).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) {
      expect(black[i]).toBeGreaterThan(0);
      expect(black[i]).toBeLessThan(paper[i]);
      expect(white[i]).toBeGreaterThanOrEqual(paper[i]);
      expect(white[i]).toBeLessThanOrEqual(255);
    }
    expect(black).not.toEqual(white);
    expect(channels(dimmedFill('#223B32'))).not.toEqual(channels(dimmedFill('#D96B55')));
  });

  it('accepts 3-digit hex and falls back to paper on malformed input', () => {
    expect(dimmedFill('#000')).toBe(dimmedFill('#000000'));
    expect(dimmedFill('nope')).toBe('rgb(247, 243, 232)');
  });
});
