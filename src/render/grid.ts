import { hexOf } from '../core/palettes';
import type { Pattern } from '../core/types';

/** Major lines every N cells so a chart can be counted and located by hand. */
export const GRID_BLOCK = 5;
/** Below this cell size a full colour code no longer fits legibly. */
export const MIN_CODE_CELL = 20;

export interface BoardRect {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export interface GridOptions {
  cell: number;
  showCodes: boolean;
  showCoordinates: boolean;
  progress?: boolean[];
  /** Preview-only: dim completed beads so only the remaining work stands out. */
  hideCompleted?: boolean;
  /** Preview-only: when set, only beads of this code keep their colour and label. */
  highlightCode?: string | null;
  /** Preview-only: outline the current 29x29 board. */
  focusBoard?: BoardRect | null;
  /** Preview-only: dim beads outside focusBoard. */
  dimOutsideBoard?: boolean;
}

const LABEL_SPACE = 22;
const MAJOR_INK = '#223B32';
const MINOR_INK = 'rgba(34, 59, 50, 0.55)';
const BOARD_INK = '#D96B55';
const PAPER: [number, number, number] = [0xf7, 0xf3, 0xe8];
/** A dimmed bead keeps 12% of its colour: enough tint to stay locatable, no visual competition. */
const DIM_MIX = 0.88;

/** Empty cells are never dimmed; the selected bead is never dimmed. */
export function isDimmed(code: string | null, highlightCode?: string | null): boolean {
  return Boolean(highlightCode) && Boolean(code) && code !== highlightCode;
}

export function isOutsideBoard(row: number, col: number, board?: BoardRect | null): boolean {
  if (!board) return false;
  return row < board.r0 || row > board.r1 || col < board.c0 || col > board.c1;
}

/** One decision shared by fills, labels and progress: is this cell "not now"? */
export function isSuppressed(
  options: GridOptions,
  code: string | null,
  row: number,
  col: number,
  index: number,
): boolean {
  return isDimmed(code, options.highlightCode)
    || (options.dimOutsideBoard === true && isOutsideBoard(row, col, options.focusBoard))
    || (options.hideCompleted === true && Boolean(code) && Boolean(options.progress?.[index]));
}

/** Blend a bead colour toward paper instead of covering it with an overlay. */
export function dimmedFill(hex: string): string {
  const raw = hex.replace('#', '');
  const expanded = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const value = Number.parseInt(expanded, 16);
  if (!Number.isFinite(value)) return `rgb(${PAPER.join(', ')})`;
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const mixed = channels.map((channel, index) => Math.round(channel * (1 - DIM_MIX) + PAPER[index] * DIM_MIX));
  return `rgb(${mixed.join(', ')})`;
}

export function gridCanvasSize(pattern: Pattern, cell: number): { width: number; height: number } {
  const offset = LABEL_SPACE;
  return {
    width: offset + pattern.w * cell + 2,
    height: offset + pattern.h * cell + 2,
  };
}

function readableInk(hex: string): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#223b32' : '#F7F3E8';
}

/** Cell fills and empty-cell dots only; separators are drawn in one pass below. */
function drawCells(ctx: CanvasRenderingContext2D, pattern: Pattern, options: GridOptions): void {
  const { cell } = options;
  for (let r = 0; r < pattern.h; r += 1) {
    for (let c = 0; c < pattern.w; c += 1) {
      const index = r * pattern.w + c;
      const code = pattern.cells[index];
      const x = LABEL_SPACE + c * cell;
      const y = LABEL_SPACE + r * cell;
      const suppressed = isSuppressed(options, code, r, c, index);
      const hex = hexOf(pattern.paletteId, code);
      if (hex) {
        ctx.fillStyle = suppressed ? dimmedFill(hex) : hex;
        ctx.fillRect(x, y, cell, cell);
      } else {
        ctx.fillStyle = suppressed ? `rgb(${PAPER.join(', ')})` : '#EDE8DC';
        ctx.fillRect(x, y, cell, cell);
        if (suppressed) continue;
        ctx.fillStyle = '#C9C3B4';
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(1, cell * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Dashed lines between individual beads. Solid heavy lines mark 5x5 blocks,
 * dashes separate each bead inside a block. Drawing the whole grid in one pass
 * keeps dash phases aligned instead of double-stroking shared borders.
 */
function drawMinorGrid(ctx: CanvasRenderingContext2D, pattern: Pattern, cell: number): void {
  const width = pattern.w * cell;
  const height = pattern.h * cell;
  ctx.save();
  ctx.strokeStyle = MINOR_INK;
  ctx.lineWidth = Math.max(1.2, cell * 0.04);
  ctx.setLineDash([Math.max(2, cell * 0.22), Math.max(2, cell * 0.18)]);
  ctx.beginPath();
  for (let c = 0; c <= pattern.w; c += 1) {
    const x = LABEL_SPACE + c * cell + 0.5;
    ctx.moveTo(x, LABEL_SPACE);
    ctx.lineTo(x, LABEL_SPACE + height);
  }
  for (let r = 0; r <= pattern.h; r += 1) {
    const y = LABEL_SPACE + r * cell + 0.5;
    ctx.moveTo(LABEL_SPACE, y);
    ctx.lineTo(LABEL_SPACE + width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Colour codes sit inside the dashed cell borders, so no guide crosses them. */
function drawLabels(ctx: CanvasRenderingContext2D, pattern: Pattern, options: GridOptions): void {
  const { cell } = options;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < pattern.h; r += 1) {
    for (let c = 0; c < pattern.w; c += 1) {
      const index = r * pattern.w + c;
      const code = pattern.cells[index];
      const x = LABEL_SPACE + c * cell;
      const y = LABEL_SPACE + r * cell;
      const suppressed = isSuppressed(options, code, r, c, index);
      if (options.showCodes && cell >= MIN_CODE_CELL && code && !suppressed) {
        const hex = hexOf(pattern.paletteId, code) ?? '#EDE8DC';
        ctx.fillStyle = readableInk(hex);
        let fontSize = Math.max(9, Math.floor(cell * 0.5));
        ctx.font = `700 ${fontSize}px ui-monospace, monospace`;
        const measured = ctx.measureText(code).width;
        if (measured > cell * 0.92) {
          fontSize = Math.max(8, Math.floor((fontSize * cell * 0.92) / measured));
          ctx.font = `700 ${fontSize}px ui-monospace, monospace`;
        }
        ctx.fillText(code, x + cell / 2, y + cell / 2);
      }
      if (options.progress?.[index] && code && !suppressed) {
        ctx.fillStyle = 'rgba(34, 59, 50, 0.55)';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }
}

/** Draw on top of everything: one heavy solid line every GRID_BLOCK cells. */
function drawBlockLines(ctx: CanvasRenderingContext2D, pattern: Pattern, cell: number): void {
  const width = pattern.w * cell;
  const height = pattern.h * cell;
  ctx.save();
  ctx.strokeStyle = MAJOR_INK;
  ctx.lineWidth = Math.max(2.5, cell * 0.13);
  ctx.beginPath();
  for (let c = 0; c <= pattern.w; c += GRID_BLOCK) {
    const x = LABEL_SPACE + c * cell + 0.5;
    ctx.moveTo(x, LABEL_SPACE);
    ctx.lineTo(x, LABEL_SPACE + height);
  }
  for (let r = 0; r <= pattern.h; r += GRID_BLOCK) {
    const y = LABEL_SPACE + r * cell + 0.5;
    ctx.moveTo(LABEL_SPACE, y);
    ctx.lineTo(LABEL_SPACE + width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Draws the bead chart. Canvas font must be a valid CSS shorthand (no var/calc). */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  options: GridOptions,
): void {
  const { cell } = options;
  const size = gridCanvasSize(pattern, cell);
  const canvas = ctx.canvas;
  canvas.width = size.width;
  canvas.height = size.height;

  ctx.fillStyle = '#F7F3E8';
  ctx.fillRect(0, 0, size.width, size.height);

  if (options.showCoordinates) {
    const labelFont = `${Math.max(9, Math.min(12, Math.floor(cell * 0.42)))}px ui-monospace, monospace`;
    ctx.fillStyle = '#6B7369';
    ctx.font = labelFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 0; c < pattern.w; c += 1) {
      if ((c + 1) % GRID_BLOCK !== 0 && c !== pattern.w - 1) continue;
      ctx.fillText(String(c + 1), LABEL_SPACE + c * cell + cell / 2, LABEL_SPACE / 2);
    }
    for (let r = 0; r < pattern.h; r += 1) {
      if ((r + 1) % GRID_BLOCK !== 0 && r !== pattern.h - 1) continue;
      ctx.fillText(String(r + 1), LABEL_SPACE / 2, LABEL_SPACE + r * cell + cell / 2);
    }
  }

  drawCells(ctx, pattern, options);
  drawMinorGrid(ctx, pattern, cell);
  drawLabels(ctx, pattern, options);
  drawBlockLines(ctx, pattern, cell);

  if (options.focusBoard) {
    const board = options.focusBoard;
    ctx.strokeStyle = BOARD_INK;
    ctx.lineWidth = Math.max(2, cell * 0.09);
    ctx.strokeRect(
      LABEL_SPACE + board.c0 * cell + 0.5,
      LABEL_SPACE + board.r0 * cell + 0.5,
      (board.c1 - board.c0 + 1) * cell - 1,
      (board.r1 - board.r0 + 1) * cell - 1,
    );
  }
}

/** Maps a pointer position on the canvas back to a cell index (input mapping, not layout). */
export function cellFromPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  pattern: Pattern,
  cell: number,
): number | null {
  const scaleX = rect.width / (LABEL_SPACE + pattern.w * cell + 2);
  const scaleY = rect.height / (LABEL_SPACE + pattern.h * cell + 2);
  const x = (clientX - rect.left) / scaleX - LABEL_SPACE;
  const y = (clientY - rect.top) / scaleY - LABEL_SPACE;
  const col = Math.floor(x / cell);
  const row = Math.floor(y / cell);
  if (col < 0 || row < 0 || col >= pattern.w || row >= pattern.h) return null;
  return row * pattern.w + col;
}
