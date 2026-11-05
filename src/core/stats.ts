import { boardCount, finishedSize } from './boards';
import { getColor, getPalette } from './palettes';
import type { Cell, Pattern, UsageRow } from './types';

export function countCells(cells: Cell[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of cells) {
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

export function usageRows(pattern: Pattern): UsageRow[] {
  const counts = countCells(pattern.cells);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => {
      const color = getColor(pattern.paletteId, code) ?? getPalette(pattern.paletteId).colors[0];
      return {
        code,
        name: color?.name ?? code,
        hex: color?.hex ?? '#FFFFFF',
        count,
        ratio: total === 0 ? 0 : count / total,
      };
    });
}

export interface PatternStats {
  totalBeads: number;
  emptyCells: number;
  colorCount: number;
  boards: number;
  size: string;
}

export function patternStats(pattern: Pattern): PatternStats {
  const totalBeads = pattern.cells.filter((cell) => cell !== null).length;
  return {
    totalBeads,
    emptyCells: pattern.cells.length - totalBeads,
    colorCount: countCells(pattern.cells).size,
    boards: boardCount(pattern.w, pattern.h),
    size: finishedSize(pattern.w, pattern.h, pattern.beadSize),
  };
}
