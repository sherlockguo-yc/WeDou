import dataset from '../data/palettes.json';
import { buildLabCache } from './color';
import type { LabCache } from './color';
import type { BeadColor, Palette, PaletteDataset } from './types';

const data = dataset as PaletteDataset;

export const PALETTES: Palette[] = data.palettes;
export const PALETTE_SOURCE = data.source;
export const PALETTE_FETCHED_AT = data.fetchedAt;
export const PALETTE_NOTE = data.note;

export const DEFAULT_PALETTE_ID = PALETTES[0].id;

const cacheByPalette = new Map<string, LabCache>();
const colorIndex = new Map<string, Map<string, BeadColor>>();

export function getPalette(id: string): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export function getLabCache(paletteId: string): LabCache {
  const cached = cacheByPalette.get(paletteId);
  if (cached) return cached;
  const built = buildLabCache(getPalette(paletteId).colors);
  cacheByPalette.set(paletteId, built);
  return built;
}

export function getColor(paletteId: string, code: string): BeadColor | undefined {
  let index = colorIndex.get(paletteId);
  if (!index) {
    index = new Map(getPalette(paletteId).colors.map((color) => [color.code, color]));
    colorIndex.set(paletteId, index);
  }
  return index.get(code);
}

export function hexOf(paletteId: string, code: string | null): string | null {
  if (!code) return null;
  return getColor(paletteId, code)?.hex ?? null;
}
