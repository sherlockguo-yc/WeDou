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

/** Draw on top of the cells: one stronger line every GRID_BLOCK cells. */
function drawBlockLines(ctx: CanvasRenderingContext2D, pattern: Pattern, cell: number): void {
  const width = pattern.w * cell;
  const height = pattern.h * cell;
  ctx.save();
  ctx.strokeStyle = 'rgba(34, 59, 50, 0.72)';
  ctx.lineWidth = Math.max(1.4, cell * 0.075);
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

  const labelFont = `${Math.max(9, Math.min(12, Math.floor(cell * 0.42)))}px ui-monospace, monospace`;

  if (options.showCoordinates) {
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

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < pattern.h; r += 1) {
    for (let c = 0; c < pattern.w; c += 1) {
      const index = r * pattern.w + c;
      const code = pattern.cells[index];
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

      if (options.showCodes && cell >= MIN_CODE_CELL && code) {
        ctx.fillStyle = readableInk(hex ?? '#EDE8DC');
        let fontSize = Math.max(8, Math.floor(cell * 0.42));
        ctx.font = `600 ${fontSize}px ui-monospace, monospace`;
        const measured = ctx.measureText(code).width;
        if (measured > cell * 0.88) {
          fontSize = Math.max(7, Math.floor((fontSize * cell * 0.88) / measured));
          ctx.font = `600 ${fontSize}px ui-monospace, monospace`;
        }
        ctx.fillText(code, x + cell / 2, y + cell / 2);
      }

      if (options.progress?.[index]) {
        ctx.fillStyle = 'rgba(34, 59, 50, 0.55)';
        ctx.fillRect(x, y, cell, cell);
      }

      ctx.strokeStyle = 'rgba(34, 59, 50, 0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

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
