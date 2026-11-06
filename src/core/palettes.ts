import dataset from '../data/palettes.json';
import { buildLabCache } from './color';
import type { LabCache } from './color';
import type { BeadColor, Palette, PaletteDataset } from './types';

const data = dataset as PaletteDataset;

export const PALETTES: Palette[] = data.palettes;
export const PALETTE_SOURCE = data.source;
export const PALETTE_FETCHED_AT = data.fetchedAt;
export const PALETTE_NOTE = data.note;

/** New charts start with the MARD 221 kit; every other palette stays selectable. */
export const DEFAULT_PALETTE_ID =
  PALETTES.find((palette) => palette.id === 'mard-221')?.id ?? PALETTES[0].id;

/** Codes sharing one HEX: buying both means buying the same colour twice. */
export function duplicateCodes(paletteId: string): Map<string, string[]> {
  const byHex = new Map<string, string[]>();
  for (const color of getPalette(paletteId).colors) {
    const group = byHex.get(color.hex) ?? [];
    group.push(color.code);
    byHex.set(color.hex, group);
  }
  const duplicates = new Map<string, string[]>();
  for (const [hex, codes] of byHex) {
    if (codes.length > 1) duplicates.set(hex, codes);
  }
  return duplicates;
}

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

/**
 * MARD 291 = MARD 221 + 70 effect beads. Their HEX describes one state only
 * (temperature, UV exposure, viewing angle or translucency), so it is not a
 * stable colour to match against. Series labels verified 2026-11-06 against
 * pixel-beads.com's per-series descriptions.
 */
export const SPECIAL_SERIES: Record<string, string> = {
  P: '珠光（光泽随角度变化）',
  Q: '温变（颜色随温度可逆变化）',
  R: '果冻（半透明）',
  T: '透明',
  Y: '夜光',
  ZG: '光变（紫外照射显色）',
};

/**
 * Codes whose HEX differs by ΔE00 > 10 between bitbead.app and trypetrelic.com.
 * bitbead.app and pixel-beads.com agree on all ten; the outlier is the third
 * source, and most gaps are effect beads recorded in a different state.
 */
export const CROSS_SOURCE_DISPUTES: Record<string, number> = {
  Q5: 38.3,
  Q2: 27.4,
  R6: 22.1,
  P19: 20.5,
  P14: 16.1,
  E24: 11.3,
  H16: 11.2,
  F24: 10.6,
  G19: 10.3,
  G5: 10.1,
};

export interface BeadNote {
  finish?: string;
  disputedDeltaE?: number;
}

const SPECIAL_PREFIX = /^(ZG|P|Q|R|T|Y)\d/;

/** Read-only metadata for a bead code; never changes the colour used by quantisation. */
export function beadNote(paletteId: string, code: string): BeadNote {
  const note: BeadNote = {};
  if (paletteId === 'mard-291') {
    const match = SPECIAL_PREFIX.exec(code);
    if (match) note.finish = SPECIAL_SERIES[match[1]];
  }
  if (paletteId === 'mard-221' || paletteId === 'mard-291') {
    const deltaE = CROSS_SOURCE_DISPUTES[code];
    if (deltaE) note.disputedDeltaE = deltaE;
  }
  return note;
}

export function specialCodeCount(paletteId: string): number {
  if (paletteId !== 'mard-291') return 0;
  return getPalette(paletteId).colors.filter((color) => beadNote(paletteId, color.code).finish).length;
}
