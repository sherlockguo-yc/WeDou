import { describe, expect, it } from 'vitest';
import { clampBoardRange } from '../src/core/boards';
import { createPattern, replaceCode } from '../src/core/pattern';
import { getPalette } from '../src/core/palettes';
import type { Cell, Pattern } from '../src/core/types';
import {
  cellFromPoint,
  dimmedFill,
  drawGrid,
  gridCanvasSize,
  isOutsideBoard,
  isSuppressed,
} from '../src/render/grid';
import type { BoardRect, GridOptions } from '../src/render/grid';
import { PNG_GRID_OPTIONS, pngLayout } from '../src/render/png';

const PALETTE_ID = 'mard-221';
const palette = getPalette(PALETTE_ID);
const A = palette.colors[0];
const B = palette.colors[1];
const CELL = 24;

function chart(cells?: Cell[]): Pattern {
  const grid = cells ?? Array.from({ length: 36 }, (_, i) =>
    i % 7 === 0 ? null : i % 2 === 0 ? A.code : B.code);
  return createPattern({ w: 6, h: 6, paletteId: PALETTE_ID, cells: grid });
}

interface Recorded {
  fills: Array<{ x: number; y: number; w: number; h: number; color: string }>;
  texts: string[];
  dashes: number[][];
  strokes: Array<{ color: string; width: number }>;
  outlines: Array<{ x: number; y: number; w: number; h: number; color: string }>;
  dots: number;
  canvas: { width: number; height: number };
  ctx: CanvasRenderingContext2D;
}

type MockCtx = {
  canvas: { width: number; height: number };
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  arc(...args: number[]): void;
  fill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  save(): void;
  restore(): void;
  setLineDash(pattern: number[]): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
};

/** A recording 2D context: no jsdom, no node-canvas, no extra dependency. */
function recorder(): Recorded {
  const rec = {
    fills: [], texts: [], dashes: [], strokes: [], outlines: [], dots: 0,
    canvas: { width: 0, height: 0 },
  } as unknown as Recorded;
  const mock: MockCtx = {
    canvas: rec.canvas,
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect(x, y, w, h) { rec.fills.push({ x, y, w, h, color: mock.fillStyle }); },
    fillText(text) { rec.texts.push(String(text)); },
    measureText(text) { return { width: String(text).length * 8 }; },
    beginPath() {},
    arc() { rec.dots += 1; },
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() { rec.strokes.push({ color: mock.strokeStyle, width: mock.lineWidth }); },
    save() {},
    restore() {},
    setLineDash(pattern) { rec.dashes.push([...pattern]); },
    strokeRect(x, y, w, h) { rec.outlines.push({ x, y, w, h, color: mock.strokeStyle }); },
  };
  rec.ctx = mock as unknown as CanvasRenderingContext2D;
  return rec;
}

function render(pattern: Pattern, extra: Partial<GridOptions> = {}): Recorded {
  const rec = recorder();
  drawGrid(rec.ctx, pattern, {
    cell: CELL,
    showCodes: true,
    showCoordinates: true,
    ...extra,
  });
  return rec;
}

describe('chart rendering', () => {
  it('sizes the canvas and paints every bead with its real palette hex and code', () => {
    const pattern = chart();
    const rec = render(pattern);
    expect(rec.canvas).toEqual(gridCanvasSize(pattern, CELL));
    expect(rec.fills.filter((f) => f.color === A.hex)).toHaveLength(pattern.cells.filter((c) => c === A.code).length);
    expect(rec.fills.filter((f) => f.color === B.hex)).toHaveLength(pattern.cells.filter((c) => c === B.code).length);
    expect(rec.texts.filter((t) => t === A.code)).toHaveLength(pattern.cells.filter((c) => c === A.code).length);
    expect(rec.texts.filter((t) => t === B.code)).toHaveLength(pattern.cells.filter((c) => c === B.code).length);
    expect(rec.fills.some((f) => f.color.startsWith('rgb('))).toBe(false);
  });

  it('draws empty cells as a pale square with a dot, never as a colour code', () => {
    const pattern = chart();
    const rec = render(pattern);
    expect(rec.dots).toBe(pattern.cells.filter((c) => c === null).length);
    expect(rec.fills.filter((f) => f.color === '#EDE8DC')).toHaveLength(pattern.cells.filter((c) => c === null).length);
  });

  it('omits codes when the cell is too small, but keeps the grid', () => {
    const rec = render(chart(), { cell: 12 });
    expect(rec.texts.some((t) => t === A.code || t === B.code)).toBe(false);
    expect(rec.dashes).toHaveLength(1);
  });

  it('uses one dashed pass for beads and one heavy solid pass for 5x5 blocks', () => {
    const rec = render(chart());
    expect(rec.dashes).toHaveLength(1);
    expect(rec.dashes[0][0]).toBeGreaterThan(0);
    expect(rec.strokes.filter((s) => s.color === 'rgba(34, 59, 50, 0.55)')).toHaveLength(1);
    expect(rec.strokes.some((s) => s.color === '#223B32' && s.width >= 2.5)).toBe(true);
  });

  it('highlighting a colour dims other beads in the fill layer and drops their codes', () => {
    const pattern = chart();
    const rec = render(pattern, { highlightCode: A.code });
    expect(rec.fills.filter((f) => f.color === B.hex)).toHaveLength(0);
    expect(rec.fills.filter((f) => f.color === dimmedFill(B.hex)).length).toBeGreaterThan(0);
    expect(rec.texts.filter((t) => t === B.code)).toHaveLength(0);
    expect(rec.texts.filter((t) => t === A.code).length).toBeGreaterThan(0);
    expect(rec.dots).toBe(pattern.cells.filter((c) => c === null).length);
  });

  it('outlines the focused board and dims beads outside it', () => {
    const board: BoardRect = { r0: 0, r1: 4, c0: 0, c1: 4 };
    const plain = render(chart(), { focusBoard: board });
    expect(plain.outlines).toHaveLength(1);
    expect(plain.outlines[0].color).toBe('#D96B55');
    expect(plain.outlines[0].x).toBe(22 + 0.5);
    expect(plain.outlines[0].w).toBe(5 * CELL - 1);
    expect(plain.fills.some((f) => f.color.startsWith('rgb('))).toBe(false);

    const exclusive = render(chart(), { focusBoard: board, dimOutsideBoard: true });
    expect(exclusive.fills.some((f) => f.color.startsWith('rgb('))).toBe(true);
    expect(exclusive.dots).toBeLessThan(plain.dots);
  });

  it('hiding completed beads never hides empty cells or leaves dark progress blocks', () => {
    const pattern = chart();
    const progress = pattern.cells.map((code, index) => code !== null && index % 3 === 0);
    const rec = render(pattern, { progress, hideCompleted: true });
    expect(rec.fills.some((f) => f.color.startsWith('rgb('))).toBe(true);
    expect(rec.fills.some((f) => f.color === 'rgba(34, 59, 50, 0.55)')).toBe(false);
    expect(rec.dots).toBe(pattern.cells.filter((c) => c === null).length);
  });

  it('export parameters contain no preview interaction state', () => {
    expect(Object.keys(PNG_GRID_OPTIONS).sort()).toEqual(['cell', 'showCodes', 'showCoordinates']);
  });

  it('maps pointer positions back to cell indices and rejects the margins', () => {
    const pattern = chart();
    const size = gridCanvasSize(pattern, CELL);
    const rect = { left: 0, top: 0, width: size.width, height: size.height } as unknown as DOMRect;
    expect(cellFromPoint(22 + CELL / 2, 22 + CELL / 2, rect, pattern, CELL)).toBe(0);
    expect(cellFromPoint(22 + 2 * CELL + CELL / 2, 22 + 3 * CELL + CELL / 2, rect, pattern, CELL)).toBe(3 * 6 + 2);
    expect(cellFromPoint(5, 5, rect, pattern, CELL)).toBeNull();
    expect(cellFromPoint(9999, 9999, rect, pattern, CELL)).toBeNull();
  });
});

describe('suppression rules', () => {
  it('combines colour, board and completion while leaving empty cells alone', () => {
    const options: GridOptions = {
      cell: CELL,
      showCodes: true,
      showCoordinates: true,
      highlightCode: A.code,
      focusBoard: { r0: 0, r1: 2, c0: 0, c1: 2 },
      dimOutsideBoard: true,
      hideCompleted: true,
      progress: [true],
    };
    expect(isSuppressed(options, B.code, 0, 0, 0)).toBe(true);
    expect(isSuppressed(options, A.code, 0, 0, 0)).toBe(true);
    expect(isSuppressed(options, null, 5, 5, 35)).toBe(true);
    expect(isSuppressed(options, A.code, 1, 1, 7)).toBe(false);
    expect(isOutsideBoard(1, 1, options.focusBoard)).toBe(false);
    expect(isOutsideBoard(3, 1, options.focusBoard)).toBe(true);
    expect(isOutsideBoard(1, 1, null)).toBe(false);
  });
});

describe('export geometry and editing primitives', () => {
  it('keeps the whole legend and footer note inside the PNG canvas', () => {
    for (const count of [0, 1, 7, 24]) {
      const cells = Array.from({ length: 36 }, (_, i) =>
        i < count ? palette.colors[i].code : null);
      const layout = pngLayout(chart(cells));
      expect(layout.rowCount).toBe(count);
      expect(layout.width).toBeGreaterThanOrEqual(720);
      expect(layout.height).toBeGreaterThan(layout.lastRowY);
      expect(layout.height).toBeGreaterThan(layout.footerNoteY);
    }
  });

  it('clamps batched PDF board ranges instead of producing empty files', () => {
    expect(clampBoardRange(9, 2, 4)).toEqual({ from: 2, to: 4 });
    expect(clampBoardRange(9, 0, 99)).toEqual({ from: 1, to: 9 });
    expect(clampBoardRange(9, 7, 3)).toEqual({ from: 7, to: 7 });
    expect(clampBoardRange(9, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ from: 1, to: 9 });
    expect(clampBoardRange(1, 1, 1)).toEqual({ from: 1, to: 1 });
  });

  it('replaces every bead of one code without mutating the source grid', () => {
    const cells = chart().cells;
    const originalA = cells.filter((c) => c === A.code).length;
    expect(originalA).toBeGreaterThan(0);
    const result = replaceCode(cells, A.code, B.code);
    expect(result.changed).toBe(originalA);
    expect(result.cells.filter((c) => c === A.code)).toHaveLength(0);
    expect(result.cells).toHaveLength(cells.length);
    expect(cells.filter((c) => c === A.code)).toHaveLength(originalA);
    expect(replaceCode(cells, A.code, A.code).changed).toBe(0);
    expect(replaceCode(cells, 'NOT-IN-PALETTE', B.code).changed).toBe(0);
    const erased = replaceCode(cells, B.code, null);
    expect(erased.changed).toBe(cells.filter((c) => c === B.code).length);
    expect(erased.cells.filter((c) => c === null).length).toBeGreaterThan(cells.filter((c) => c === null).length);
  });
});
