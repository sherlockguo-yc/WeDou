import { boardLabel, clampBoardRange, splitBoards } from '../core/boards';
import { beadNote, getColor, getPalette } from '../core/palettes';
import { patternStats, usageRows } from '../core/stats';
import type { Pattern } from '../core/types';
import { GRID_BLOCK } from './grid';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CELL = 6.4; // 29 * 6.4 = 185.6mm, fits A4 and keeps symbols legible

/** Corner map: how many 29x29 boards make up the whole chart, in columns and rows. */
export function assemblyMapLayout(cols: number, rows: number): {
  unit: number;
  gap: number;
  width: number;
  height: number;
} {
  const safeCols = Math.max(1, Math.floor(cols));
  const safeRows = Math.max(1, Math.floor(rows));
  const gap = 0.5;
  const unit = Math.min(3.4, 13 / Math.max(safeCols, safeRows));
  return {
    unit,
    gap,
    width: safeCols * unit + (safeCols - 1) * gap,
    height: safeRows * unit + (safeRows - 1) * gap,
  };
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function inkFor(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? [34, 59, 50] : [247, 243, 232];
}

/**
 * jsPDF's built-in fonts have no CJK glyphs. Embedding a full Chinese font
 * would add tens of MB to every PDF, and a static subset cannot cover names
 * users invent. Draw the title with the browser's system font at 3x instead.
 * ASCII-only titles keep using selectable native text.
 */
export function renderTitleImage(
  text: string,
): { dataUrl: string; widthMm: number; heightMm: number } | null {
  if (/^[\x20-\x7E]+$/.test(text)) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const fontPx = 40;
  const font = `700 ${fontPx}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 12;
  const height = Math.ceil(fontPx * 1.4);
  const scale = 3;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.font = font;
  ctx.fillStyle = '#223B32';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 6, height / 2);
  const heightMm = 5.2;
  const maxWidth = PAGE_W - MARGIN * 2;
  const widthMm = Math.min(maxWidth, heightMm * (width / height));
  return { dataUrl: canvas.toDataURL('image/png'), widthMm, heightMm };
}

/** One A4 page per 29x29 board, with global coordinates and a per-colour count. */
export async function exportPatternPdf(
  pattern: Pattern,
  filename: string,
  range?: { from: number; to: number },
): Promise<number> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const palette = getPalette(pattern.paletteId);
  const rows = usageRows(pattern);
  const stats = patternStats(pattern);
  const allBoards = splitBoards(pattern.cells, pattern.w, pattern.h);
  const selected = range
    ? clampBoardRange(allBoards.length, range.from, range.to)
    : { from: 1, to: allBoards.length };
  const boards = allBoards.slice(selected.from - 1, selected.to);
  const boardCols = Math.max(...allBoards.map((item) => item.col)) + 1;
  const boardRows = Math.max(...allBoards.map((item) => item.row)) + 1;
  const map = assemblyMapLayout(boardCols, boardRows);

  boards.forEach((board, pageIndex) => {
    if (pageIndex > 0) doc.addPage();

    doc.setTextColor(34, 59, 50);
    const title = (pattern.name || 'BEAD CHART').trim() || 'BEAD CHART';
    const titleImage = renderTitleImage(title);
    if (titleImage) {
      doc.addImage(titleImage.dataUrl, 'PNG', MARGIN, 9.6, titleImage.widthMm, titleImage.heightMm);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, MARGIN, 14);
    }
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 115, 105);
    doc.text(
      `${palette.name}  |  BOARD ${board.index + 1}/${allBoards.length}  |  ${boardLabel(board)}  |  ${pattern.beadSize}`,
      MARGIN,
      20,
    );

    // Assembly map: every board of the whole chart, with this page highlighted.
    if (allBoards.length > 1) {
      const x0 = PAGE_W - MARGIN - map.width;
      const y0 = 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(107, 115, 105);
      doc.text(
        `ASSEMBLY MAP ${boardCols}x${boardRows}  |  THIS PAGE ${board.index + 1}`,
        PAGE_W - MARGIN,
        y0 - 1.5,
        { align: 'right' },
      );
      for (const item of allBoards) {
        const x = x0 + item.col * (map.unit + map.gap);
        const y = y0 + item.row * (map.unit + map.gap);
        const current = item.index === board.index;
        if (current) doc.setFillColor(217, 107, 85);
        else doc.setFillColor(247, 243, 232);
        doc.setDrawColor(34, 59, 50);
        doc.setLineWidth(0.2);
        doc.rect(x, y, map.unit, map.unit, 'FD');
        if (map.unit >= 2.8) {
          doc.setFont('courier', 'bold');
          doc.setFontSize(5);
          if (current) doc.setTextColor(255, 255, 255);
          else doc.setTextColor(34, 59, 50);
          doc.text(String(item.index + 1), x + map.unit / 2, y + map.unit / 2 + 0.9, { align: 'center' });
        }
      }
    }

    const left = MARGIN + 8;
    const top = 27;
    const columns = board.c1 - board.c0 + 1;
    const rowCount = board.r1 - board.r0 + 1;

    doc.setFontSize(6);
    doc.setTextColor(107, 115, 105);
    for (let c = 0; c < columns; c += 1) {
      const global = board.c0 + c + 1;
      if (global % 5 !== 0 && global !== pattern.w) continue;
      doc.text(String(global), left + c * CELL + CELL / 2, top - 2, { align: 'center' });
    }
    for (let r = 0; r < rowCount; r += 1) {
      const global = board.r0 + r + 1;
      if (global % 5 !== 0 && global !== pattern.h) continue;
      doc.text(String(global), left - 2, top + r * CELL + CELL / 2 + 1, { align: 'right' });
    }

    for (let r = 0; r < rowCount; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const code = board.cells[r * columns + c];
        const x = left + c * CELL;
        const y = top + r * CELL;
        const hex = code ? getColor(pattern.paletteId, code)?.hex ?? '#FFFFFF' : '#EDE8DC';
        doc.setFillColor(...rgb(hex));
        doc.rect(x, y, CELL, CELL, 'F');
        if (!code) {
          doc.setDrawColor(201, 195, 180);
          doc.setFillColor(201, 195, 180);
          doc.circle(x + CELL / 2, y + CELL / 2, 0.35, 'F');
        }
      }
    }

    // Dashed separators between individual beads; solid heavy lines mark 5x5 blocks.
    doc.setLineDashPattern([1.1, 0.85], 0);
    doc.setDrawColor(90, 100, 90);
    doc.setLineWidth(0.25);
    for (let c = 0; c <= columns; c += 1) {
      const x = left + c * CELL;
      doc.line(x, top, x, top + rowCount * CELL);
    }
    for (let r = 0; r <= rowCount; r += 1) {
      const y = top + r * CELL;
      doc.line(left, y, left + columns * CELL, y);
    }
    doc.setLineDashPattern([], 0);

    // Pass 3: colour codes inside the dashed cell borders.
    for (let r = 0; r < rowCount; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const code = board.cells[r * columns + c];
        if (!code) continue;
        const hex = getColor(pattern.paletteId, code)?.hex ?? '#FFFFFF';
        const x = left + c * CELL;
        const y = top + r * CELL;
        doc.setFont('courier', 'bold');
        doc.setFontSize(code.length >= 4 ? 4.2 : 4.8);
        const [ir, ig, ib] = inkFor(hex);
        doc.setTextColor(ir, ig, ib);
        doc.text(code, x + CELL / 2, y + CELL / 2 + 1.6, { align: 'center' });
      }
    }

    doc.setDrawColor(34, 59, 50);
    doc.setLineWidth(0.8);
    for (let c = 0; c <= columns; c += 1) {
      if ((board.c0 + c) % GRID_BLOCK !== 0) continue;
      const x = left + c * CELL;
      doc.line(x, top, x, top + rowCount * CELL);
    }
    for (let r = 0; r <= rowCount; r += 1) {
      if ((board.r0 + r) % GRID_BLOCK !== 0) continue;
      const y = top + r * CELL;
      doc.line(left, y, left + columns * CELL, y);
    }

    const tableTop = top + 29 * CELL + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(34, 59, 50);
    doc.text(
      `BEADS ${stats.totalBeads}  /  COLOURS ${stats.colorCount}  /  BOARDS ${stats.boards}  /  ${stats.size}`,
      MARGIN,
      tableTop,
    );

    const perColumn = 24;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    rows.forEach((row, index) => {
      const column = Math.floor(index / perColumn);
      const line = index % perColumn;
      const x = MARGIN + column * 62;
      const y = tableTop + 6 + line * 4.6;
      doc.setFillColor(...rgb(row.hex));
      doc.setDrawColor(34, 59, 50);
      doc.rect(x, y - 2.6, 3, 3, 'FD');
      doc.setTextColor(34, 59, 50);
      const note = beadNote(pattern.paletteId, row.code);
      const flags = [
        note.finish ? 'EFFECT' : '',
        note.disputedDeltaE ? 'DISPUTED' : '',
      ].filter(Boolean);
      const label = flags.length > 0 ? ` [${flags.join('/')}]` : '';
      doc.text(`${row.code.padEnd(6)} x ${String(row.count).padStart(5)}${label}`, x + 5, y);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(107, 115, 105);
    doc.text(
      'EMPTY CELLS = NO BEAD. HEX = REFERENCE ONLY; BUY BY CODE. EFFECT BEADS CHANGE COLOUR - CHECK A PHYSICAL CHART.',
      MARGIN,
      PAGE_H - 8,
    );
    doc.text(`${PAGE_W}mm A4  |  WeDou`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  });

  doc.save(filename);
  return boards.length;
}
