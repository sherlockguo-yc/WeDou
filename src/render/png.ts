import { drawGrid, gridCanvasSize } from './grid';
import type { GridOptions } from './grid';
import { patternStats, usageRows } from '../core/stats';
import { beadNote, getPalette } from '../core/palettes';
import type { Pattern } from '../core/types';

const CELL = 32;
const FOOTER_ROW = 36;
const FOOTER_TOP = 16;
const CHART_TOP = 80;
const TABLE_GAP = 24;
const NOTE_LINE_GAP = 20;

/** Exports never receive preview interaction state; tests lock this down. */
export const PNG_GRID_OPTIONS: GridOptions = {
  cell: CELL,
  showCodes: true,
  showCoordinates: true,
};

/** Exports are print artefacts: captions stay ASCII and are derived from the pattern itself. */
export function exportNote(paletteId: string, code: string): string {
  const note = beadNote(paletteId, code);
  if (note.finish && note.disputedDeltaE) return 'EFFECT / DISPUTED';
  if (note.finish) return 'EFFECT';
  if (note.disputedDeltaE) return 'DISPUTED';
  return '';
}

/** Canvas geometry is pure so tests can prove every legend row fits. */
export function pngLayout(pattern: Pattern): {
  width: number;
  height: number;
  tableTop: number;
  lastRowY: number;
  footerNoteY: number;
  rowCount: number;
} {
  const grid = gridCanvasSize(pattern, CELL);
  const rowCount = usageRows(pattern).length;
  const footerHeight = FOOTER_TOP + 8 + Math.max(4, rowCount) * FOOTER_ROW + 56 + NOTE_LINE_GAP;
  const width = Math.max(grid.width + 40, 720);
  const tableTop = CHART_TOP + grid.height + TABLE_GAP;
  const lastRowY = tableTop + FOOTER_TOP + rowCount * FOOTER_ROW;
  return {
    width,
    height: tableTop + footerHeight,
    tableTop,
    lastRowY,
    footerNoteY: lastRowY + FOOTER_ROW + NOTE_LINE_GAP,
    rowCount,
  };
}

/** Full-resolution chart with a printed-style usage table. */
export function renderPatternPng(pattern: Pattern): HTMLCanvasElement {
  const rows = usageRows(pattern);
  const layout = pngLayout(pattern);
  const canvas = document.createElement('canvas');
  const width = layout.width;
  canvas.width = width;
  canvas.height = layout.height;
  const tableTop = layout.tableTop;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D');

  ctx.fillStyle = '#F5F1E8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#223B32';
  ctx.font = '600 26px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(pattern.name, 24, 40);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = '#6B7369';
  ctx.fillText(
    `${getPalette(pattern.paletteId).name}  |  ${pattern.w} x ${pattern.h}  |  ${pattern.beadSize}  |  COLOUR CODES ARE THE SOURCE OF TRUTH`,
    24,
    62,
  );

  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) throw new Error('浏览器不支持 Canvas 2D');
  drawGrid(scratchCtx, pattern, PNG_GRID_OPTIONS);
  ctx.drawImage(scratch, 24, CHART_TOP);

  const stats = patternStats(pattern);
  ctx.fillStyle = '#223B32';
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.fillText(
    `BEADS ${stats.totalBeads}   EMPTY ${stats.emptyCells}   COLOURS ${stats.colorCount}   BOARDS ${stats.boards}   SIZE ${stats.size}`,
    24,
    tableTop,
  );

  const hasNotes = rows.some((row) => exportNote(pattern.paletteId, row.code) !== '');
  let y = tableTop + FOOTER_TOP;
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = '#6B7369';
  ctx.fillText('CODE', 70, y);
  ctx.fillText('COUNT', 190, y);
  ctx.fillText('RATIO', 280, y);
  if (hasNotes) ctx.fillText('NOTE', 360, y);
  y += 8;
  ctx.strokeStyle = '#223B32';
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(width - 24, y);
  ctx.stroke();

  for (const row of rows) {
    y += FOOTER_ROW;
    ctx.fillStyle = row.hex;
    ctx.fillRect(24, y - 16, 20, 20);
    ctx.strokeStyle = '#223B32';
    ctx.strokeRect(24, y - 16, 20, 20);
    ctx.fillStyle = '#223B32';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(row.code, 70, y);
    ctx.fillText(String(row.count), 190, y);
    ctx.fillStyle = '#6B7369';
    ctx.fillText(`${(row.ratio * 100).toFixed(1)}%`, 280, y);
    const label = exportNote(pattern.paletteId, row.code);
    if (label) ctx.fillText(label, 360, y);
  }
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = '#6B7369';
  ctx.fillText('EMPTY CELLS = NO BEAD', 24, y + FOOTER_ROW);
  if (hasNotes) {
    ctx.fillText(
      'EFFECT = COLOUR VARIES (TEMPERATURE / UV / ANGLE); DISPUTED = CROSS-SOURCE HEX DIFFERENCE',
      24,
      y + FOOTER_ROW + NOTE_LINE_GAP,
    );
  }

  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
