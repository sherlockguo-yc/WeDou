import { describe, expect, it } from 'vitest';
import { boardCount, boardLabel, finishedSize, recommendGridSize, splitBoards } from '../src/core/boards';
import { createPattern, parsePattern, resolveConflict, serialize } from '../src/core/pattern';

describe('board splitting', () => {
  it('splits 30x30 into four boards with global coordinates', () => {
    const cells = new Array<string>(30 * 30).fill('A1');
    const boards = splitBoards(cells, 30, 30);
    expect(boards).toHaveLength(4);
    expect(boards[0]).toMatchObject({ r0: 0, r1: 28, c0: 0, c1: 28 });
    expect(boards[1]).toMatchObject({ r0: 0, r1: 28, c0: 29, c1: 29 });
    expect(boards[1].cells).toHaveLength(29);
    expect(boardLabel(boards[1])).toBe('R1-R29 / C30-C30');
  });

  it('counts boards and estimates finished size', () => {
    expect(boardCount(58, 58)).toBe(4);
    expect(finishedSize(29, 29, '5mm')).toBe('14.5 x 14.5 cm');
    expect(finishedSize(29, 29, '2.6mm')).toBe('7.5 x 7.5 cm');
  });

  it('recommends a grid that keeps the source aspect ratio', () => {
    expect(recommendGridSize(100, 100)).toEqual({ w: 29, h: 29 });
    // Exact 1:2 and 2:1 ratios, matching the ratio-lock input handler.
    expect(recommendGridSize(100, 200)).toEqual({ w: 21, h: 42 });
    expect(recommendGridSize(200, 100)).toEqual({ w: 41, h: 21 });
    for (const [imageW, imageH] of [[100, 200], [200, 100], [1600, 900], [900, 1600]]) {
      const { w, h } = recommendGridSize(imageW, imageH);
      const sourceRatio = imageW / imageH;
      expect(Math.abs(w / h / sourceRatio - 1)).toBeLessThan(0.06);
      expect(w * h).toBeGreaterThan(700);
      expect(w * h).toBeLessThan(1000);
    }
  });
});

describe('pattern model', () => {
  it('rejects a mismatched cell array', () => {
    expect(() => createPattern({ w: 3, h: 3, cells: ['A1'] })).toThrow();
  });

  it('round-trips through JSON', () => {
    const original = createPattern({ name: '测试', w: 2, h: 2, cells: ['A1', null, 'A2', 'A1'] });
    const restored = parsePattern(serialize(original));
    expect(restored.cells).toEqual(original.cells);
    expect(restored.name).toBe('测试');
    expect(restored.progress).toHaveLength(4);
  });

  it('rejects malformed project files', () => {
    expect(() => parsePattern('{"w":2,"h":2,"cells":["A1"]}')).toThrow();
    expect(() => parsePattern('[]')).toThrow();
  });

  it('keeps the newer side and flags near-simultaneous conflicts', () => {
    const older = createPattern({ w: 1, h: 1, cells: ['A1'] });
    const newer = { ...older, updatedAt: new Date(Date.now() + 60_000).toISOString(), version: 3 };
    expect(resolveConflict(older, newer).winner).toBe(newer);
    expect(resolveConflict(older, { ...older, version: 2 }).conflict).toBe(true);
  });
});
