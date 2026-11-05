import { drawGrid, gridCanvasSize } from './grid';
import { patternStats, usageRows } from '../core/stats';
import { getPalette } from '../core/palettes';
import type { Pattern } from '../core/types';

const CELL = 26;
const FOOTER_ROW = 30;
const FOOTER_TOP = 16;

/** Full-resolution chart with a printed-style usage table. */
export function renderPatternPng(pattern: Pattern): HTMLCanvasElement {
  const grid = gridCanvasSize(pattern, CELL);
  const rows = usageRows(pattern);
  const footerHeight = FOOTER_TOP + Math.max(4, rows.length) * FOOTER_ROW + 90;
  const canvas = document.createElement('canvas');
  const width = Math.max(grid.width + 40, 720);
  canvas.width = width;
  canvas.height = grid.height + footerHeight;
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
  drawGrid(scratchCtx, pattern, { cell: CELL, showSymbols: true, showCoordinates: true });
  ctx.drawImage(scratch, 24, 80);

  const tableTop = 80 + grid.height + 24;
  const stats = patternStats(pattern);
  ctx.fillStyle = '#223B32';
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.fillText(
    `BEADS ${stats.totalBeads}   EMPTY ${stats.emptyCells}   COLOURS ${stats.colorCount}   BOARDS ${stats.boards}   SIZE ${stats.size}`,
    24,
    tableTop,
  );

  let y = tableTop + FOOTER_TOP;
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = '#6B7369';
  ctx.fillText('SYM', 24, y);
  ctx.fillText('CODE', 70, y);
  ctx.fillText('COUNT', 190, y);
  ctx.fillText('NOTE', 280, y);
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
    ctx.fillText(row.symbol, 54, y);
    ctx.fillText(row.code, 70, y);
    ctx.fillText(String(row.count), 190, y);
    ctx.fillStyle = '#6B7369';
    ctx.fillText('EMPTY CELLS = NO BEAD', 280, y);
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
