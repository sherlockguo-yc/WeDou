import type { BeadSize, Board, Cell } from './types';

export const BOARD_SIZE = 29;
export const DEFAULT_GRID_CELLS = BOARD_SIZE * BOARD_SIZE;

/**
 * Recommend a bead grid that preserves the source aspect ratio while keeping
 * roughly the same bead count as the default 29x29 board (841 cells).
 */
export function recommendGridSize(
  imageWidth: number,
  imageHeight: number,
  targetCells = DEFAULT_GRID_CELLS,
): { w: number; h: number } {
  const ratio = Math.max(1, imageWidth) / Math.max(1, imageHeight);
  const clamp = (value: number) => Math.max(1, Math.min(200, Math.round(value)));
  // Derive height from width using the exact ratio so the recommendation
  // matches the ratio-lock input handler (which does the same).
  const w = clamp(Math.sqrt(targetCells * ratio));
  const h = clamp(w / ratio);
  return { w, h };
}

export function splitBoards(cells: Cell[], w: number, h: number, size = BOARD_SIZE): Board[] {
  const boards: Board[] = [];
  let index = 0;
  for (let row = 0; row * size < h; row += 1) {
    for (let col = 0; col * size < w; col += 1) {
      const r0 = row * size;
      const c0 = col * size;
      const r1 = Math.min(r0 + size, h) - 1;
      const c1 = Math.min(c0 + size, w) - 1;
      const boardCells: Cell[] = [];
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) boardCells.push(cells[r * w + c]);
      }
      boards.push({ index, row, col, r0, r1, c0, c1, cells: boardCells });
      index += 1;
    }
  }
  return boards;
}

/** 1-based global row/column range, printed on every board page. */
export function boardLabel(board: Board): string {
  return `R${board.r0 + 1}-R${board.r1 + 1} / C${board.c0 + 1}-C${board.c1 + 1}`;
}

export function boardCount(w: number, h: number, size = BOARD_SIZE): number {
  return Math.ceil(w / size) * Math.ceil(h / size);
}

const PITCH_CM: Record<BeadSize, number> = { '5mm': 0.5, '2.6mm': 0.26 };

export function finishedSize(w: number, h: number, beadSize: BeadSize): string {
  const pitch = PITCH_CM[beadSize];
  return `${(w * pitch).toFixed(1)} x ${(h * pitch).toFixed(1)} cm`;
}
