import { boardLabel, splitBoards } from '../core/boards';
import { getColor, getPalette } from '../core/palettes';
import { patternStats, symbolsFor, usageRows } from '../core/stats';
import type { Pattern } from '../core/types';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CELL = 6.4; // 29 * 6.4 = 185.6mm, fits A4 and keeps symbols legible

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function inkFor(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? [34, 59, 50] : [247, 243, 232];
}

/** One A4 page per 29x29 board, with global coordinates and a per-colour count. */
export async function exportPatternPdf(pattern: Pattern, filename: string): Promise<number> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const palette = getPalette(pattern.paletteId);
  const symbols = symbolsFor(pattern.cells);
  const rows = usageRows(pattern);
  const stats = patternStats(pattern);
  const boards = splitBoards(pattern.cells, pattern.w, pattern.h);

  boards.forEach((board, pageIndex) => {
    if (pageIndex > 0) doc.addPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(34, 59, 50);
    doc.text(pattern.name.replace(/[^\x20-\x7E]/g, 'BEAD CHART'), MARGIN, 14);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 115, 105);
    doc.text(
      `${palette.name}  |  BOARD ${board.index + 1}/${boards.length}  |  ${boardLabel(board)}  |  ${pattern.beadSize}`,
      MARGIN,
      20,
    );

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
        doc.setDrawColor(180, 176, 164);
        doc.setLineWidth(0.1);
        doc.rect(x, y, CELL, CELL, 'FD');
        if (code) {
          const [ir, ig, ib] = inkFor(hex);
          doc.setTextColor(ir, ig, ib);
          doc.setFont('courier', 'bold');
          doc.setFontSize(4.2);
          doc.text(symbols.get(code) ?? '?', x + CELL / 2, y + CELL / 2 + 1.4, { align: 'center' });
        } else {
          doc.setDrawColor(201, 195, 180);
          doc.setFillColor(201, 195, 180);
          doc.circle(x + CELL / 2, y + CELL / 2, 0.35, 'F');
        }
      }
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
      doc.text(`${row.symbol.padEnd(2)} ${row.code.padEnd(6)} x ${String(row.count).padStart(5)}`, x + 5, y);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(107, 115, 105);
    doc.text(
      'EMPTY CELLS = NO BEAD. Screen/print colours are reference values; use the colour CODES when buying beads.',
      MARGIN,
      PAGE_H - 8,
    );
    doc.text(`${PAGE_W}mm A4  |  WeDou`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  });

  doc.save(filename);
  return boards.length;
}
