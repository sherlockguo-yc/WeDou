import { hexOf } from '../core/palettes';
import type { Pattern } from '../core/types';

/** Major lines every N cells so a chart can be counted and located by hand. */
export const GRID_BLOCK = 5;
/** Below this cell size a full colour code no longer fits legibly. */
export const MIN_CODE_CELL = 20;

export interface GridOptions {
  cell: number;
  showCodes: boolean;
  showCoordinates: boolean;
  highlightRows?: Set<number>;
  progress?: boolean[];
  completedOnly?: boolean;
}

const LABEL_SPACE = 22;
const MAJOR_INK = '#223B32';
const MINOR_INK = 'rgba(34, 59, 50, 0.32)';

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

/** Cell fills, empty-cell dots and the faint per-cell grid. */
function drawCells(ctx: CanvasRenderingContext2D, pattern: Pattern, cell: number): void {
  for (let r = 0; r < pattern.h; r += 1) {
    for (let c = 0; c < pattern.w; c += 1) {
      const code = pattern.cells[r * pattern.w + c];
      const x = LABEL_SPACE + c * cell;
      const y = LABEL_SPACE + r * cell;
      const hex = hexOf(pattern.paletteId, code);
      if (hex) {
        ctx.fillStyle = hex;
        ctx.fillRect(x, y, cell, cell);
      } else {
        ctx.fillStyle = '#EDE8DC';
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = '#C9C3B4';
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(1, cell * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = MINOR_INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }
}

/**
 * Dashed X inside every 5x5 block, like a printed bead chart. A light dashed
 * halo underneath keeps the guide visible on both dark and light beads.
 */
function drawBlockDiagonals(ctx: CanvasRenderingContext2D, pattern: Pattern, cell: number): void {
  const dash = [Math.max(4, cell * 0.7), Math.max(2, cell * 0.35)];
  const width = Math.max(1.4, cell * 0.055);
  ctx.save();
  ctx.setLineDash(dash);
  for (let r = 0; r < pattern.h; r += GRID_BLOCK) {
    for (let c = 0; c < pattern.w; c += GRID_BLOCK) {
      const x = LABEL_SPACE + c * cell;
      const y = LABEL_SPACE + r * cell;
      const bw = Math.min(GRID_BLOCK, pattern.w - c) * cell;
      const bh = Math.min(GRID_BLOCK, pattern.h - r) * cell;
      const cross = () => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + bw, y + bh);
        ctx.moveTo(x + bw, y);
        ctx.lineTo(x, y + bh);
        ctx.stroke();
      };
      ctx.lineWidth = width + 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      cross();
      ctx.lineWidth = width;
      ctx.strokeStyle = 'rgba(34, 59, 50, 0.62)';
      cross();
    }
  }
  ctx.restore();
}

/** Colour codes are drawn above the diagonals so their strokes stay readable. */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  options: GridOptions,
): void {
  const { cell } = options;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < pattern.h; r += 1) {
    for (let c = 0; c < pattern.w; c += 1) {
      const index = r * pattern.w + c;
      const code = pattern.cells[index];
      const x = LABEL_SPACE + c * cell;
      const y = LABEL_SPACE + r * cell;
      if (options.showCodes && cell >= MIN_CODE_CELL && code) {
        const hex = hexOf(pattern.paletteId, code) ?? '#EDE8DC';
        let fontSize = Math.max(9, Math.floor(cell * 0.5));
        ctx.font = `700 ${fontSize}px ui-monospace, monospace`;
        let measured = ctx.measureText(code).width;
        if (measured > cell * 0.92) {
          fontSize = Math.max(8, Math.floor((fontSize * cell * 0.92) / measured));
          ctx.font = `700 ${fontSize}px ui-monospace, monospace`;
          measured = ctx.measureText(code).width;
        }
        // Clear the diagonal dashes behind the text with the cell's own colour,
        // so they never strike through a colour code.
        const pad = Math.max(1, cell * 0.07);
        ctx.fillStyle = hex;
        ctx.fillRect(
          x + cell / 2 - measured / 2 - pad,
          y + cell / 2 - fontSize * 0.62,
          measured + pad * 2,
          fontSize * 1.24,
        );
        ctx.fillStyle = readableInk(hex);
        ctx.fillText(code, x + cell / 2, y + cell / 2);
      }
      if (options.progress?.[index]) {
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

  drawCells(ctx, pattern, cell);
  drawBlockDiagonals(ctx, pattern, cell);
  drawLabels(ctx, pattern, options);
  drawBlockLines(ctx, pattern, cell);

  if (options.highlightRows?.size) {
    ctx.strokeStyle = '#D96B55';
    ctx.lineWidth = 2;
    for (const row of options.highlightRows) {
      if (options.completedOnly && options.progress?.slice(row * pattern.w, (row + 1) * pattern.w).every(Boolean)) {
        continue;
      }
      ctx.strokeRect(
        LABEL_SPACE + 0.5,
        LABEL_SPACE + row * cell + 0.5,
        pattern.w * cell - 1,
        cell - 1,
      );
    }
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
