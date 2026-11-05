import { hexToLab, nearestColor } from './color';
import { getColor, getLabCache } from './palettes';
import { countCells } from './stats';
import type { Cell, ConvertParams } from './types';

export interface OptimizeResult {
  cells: Cell[];
  mergedCodes: string[];
}

/** Keep the most-used colours and fold the rest into their closest surviving colour. */
export function limitColors(cells: Cell[], maxColors: number, paletteId: string): OptimizeResult {
  const counts = countCells(cells);
  if (counts.size <= maxColors) return { cells: [...cells], mergedCodes: [] };

  const keep = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxColors)
    .map(([code]) => getColor(paletteId, code))
    .filter((color): color is NonNullable<typeof color> => Boolean(color));
  const cache = getLabCache(paletteId);
  const replacements = new Map<string, string>();

  for (const [code] of counts) {
    if (keep.some((color) => color.code === code)) continue;
    const source = getColor(paletteId, code);
    if (!source) continue;
    const match = nearestColor(hexToLab(source.hex), keep, cache);
    if (match) replacements.set(code, match.color.code);
  }

  return {
    cells: cells.map((cell) => (cell ? replacements.get(cell) ?? cell : null)),
    mergedCodes: [...replacements.keys()],
  };
}

/** An isolated single bead is painful to place; fold it into its neighbours. */
export function removeIsolated(cells: Cell[], w: number, h: number): Cell[] {
  const result = [...cells];
  const neighbours = (x: number, y: number): Cell[] => {
    const out: Cell[] = [];
    if (y > 0) out.push(cells[(y - 1) * w + x]);
    if (y < h - 1) out.push(cells[(y + 1) * w + x]);
    if (x > 0) out.push(cells[y * w + x - 1]);
    if (x < w - 1) out.push(cells[y * w + x + 1]);
    return out;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const index = y * w + x;
      const code = cells[index];
      if (!code) continue;
      const around = neighbours(x, y).filter((value): value is string => Boolean(value));
      if (around.length === 0 || around.some((value) => value === code)) continue;
      const tally = new Map<string, number>();
      for (const value of around) tally.set(value, (tally.get(value) ?? 0) + 1);
      const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      result[index] = dominant[0];
    }
  }
  return result;
}

/** Flood-fill tiny patches (<= minSize) into the most common adjacent colour. */
export function mergeSmallRegions(cells: Cell[], w: number, h: number, minSize = 2): Cell[] {
  const result = [...cells];
  const visited = new Set<number>();
  for (let start = 0; start < cells.length; start += 1) {
    const code = cells[start];
    if (!code || visited.has(start)) continue;
    const region: number[] = [];
    const queue = [start];
    visited.add(start);
    const border = new Map<string, number>();
    while (queue.length) {
      const index = queue.pop() as number;
      region.push(index);
      const x = index % w;
      const y = Math.floor(index / w);
      const adjacent: number[] = [];
      if (x > 0) adjacent.push(index - 1);
      if (x < w - 1) adjacent.push(index + 1);
      if (y > 0) adjacent.push(index - w);
      if (y < h - 1) adjacent.push(index + w);
      for (const next of adjacent) {
        const value = cells[next];
        if (value === code) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        } else if (value) {
          border.set(value, (border.get(value) ?? 0) + 1);
        }
      }
    }
    if (region.length <= minSize && border.size > 0) {
      const dominant = [...border.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const index of region) result[index] = dominant;
    }
  }
  return result;
}

export function optimizeGrid(
  cells: Cell[],
  w: number,
  h: number,
  paletteId: string,
  params: Pick<ConvertParams, 'maxColors' | 'removeIsolated' | 'mergeSmallRegions'>,
): OptimizeResult {
  const limited = limitColors(cells, params.maxColors, paletteId);
  let output = limited.cells;
  if (params.mergeSmallRegions) output = mergeSmallRegions(output, w, h);
  if (params.removeIsolated) output = removeIsolated(output, w, h);
  return { cells: output, mergedCodes: limited.mergedCodes };
}

