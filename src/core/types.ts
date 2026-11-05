export type BeadSize = '5mm' | '2.6mm';

export interface BeadColor {
  code: string;
  name: string;
  hex: string;
}

export interface Palette {
  id: string;
  brand: string;
  name: string;
  sourceUrl: string;
  colors: BeadColor[];
}

export interface PaletteDataset {
  source: string;
  fetchedAt: string;
  note: string;
  palettes: Palette[];
}

export type Cell = string | null;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface ConvertParams {
  width: number;
  height: number;
  maxColors: number;
  dithering: boolean;
  removeIsolated: boolean;
  mergeSmallRegions: boolean;
  transparentAsEmpty: boolean;
  backgroundTolerance: number;
  /** Optional so project files saved before this feature still load; undefined means on. */
  detailPreserve?: boolean;
}

/** Opt-in strength for flat-background removal; 0 means never guess a background. */
export const DEFAULT_BACKGROUND_TOLERANCE = 18;

export const DEFAULT_PARAMS: ConvertParams = {
  width: 29,
  height: 29,
  maxColors: 24,
  dithering: false,
  removeIsolated: true,
  mergeSmallRegions: true,
  transparentAsEmpty: true,
  backgroundTolerance: 0,
  detailPreserve: true,
};

export interface Pattern {
  id: string;
  name: string;
  w: number;
  h: number;
  paletteId: string;
  beadSize: BeadSize;
  cells: Cell[];
  params: ConvertParams;
  progress: boolean[];
  version: number;
  updatedAt: string;
}

export interface UsageRow {
  code: string;
  name: string;
  hex: string;
  count: number;
  ratio: number;
}

export interface Board {
  index: number;
  row: number;
  col: number;
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  cells: Cell[];
}
