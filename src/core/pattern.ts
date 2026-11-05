import { DEFAULT_PALETTE_ID } from './palettes';
import { DEFAULT_PARAMS } from './types';
import type { BeadSize, Cell, ConvertParams, Pattern } from './types';

export function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreatePatternInput {
  name?: string;
  w: number;
  h: number;
  paletteId?: string;
  beadSize?: BeadSize;
  cells: Cell[];
  params?: ConvertParams;
  id?: string;
}

export function createPattern(input: CreatePatternInput): Pattern {
  const w = Math.max(1, Math.floor(input.w));
  const h = Math.max(1, Math.floor(input.h));
  if (input.cells.length !== w * h) {
    throw new Error(`cells length ${input.cells.length} does not match ${w}x${h}`);
  }
  return {
    id: input.id ?? newId(),
    name: input.name ?? '未命名图纸',
    w,
    h,
    paletteId: input.paletteId ?? DEFAULT_PALETTE_ID,
    beadSize: input.beadSize ?? '5mm',
    cells: [...input.cells],
    params: { ...DEFAULT_PARAMS, ...input.params },
    progress: new Array<boolean>(w * h).fill(false),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function touch(pattern: Pattern): Pattern {
  return { ...pattern, version: pattern.version + 1, updatedAt: new Date().toISOString() };
}

/** Replace every bead of one code with another; progress and grid length stay untouched. */
export function replaceCode(
  cells: Cell[],
  from: string,
  to: string | null,
): { cells: Cell[]; changed: number } {
  if (from === to) return { cells: [...cells], changed: 0 };
  let changed = 0;
  const next = cells.map((cell) => {
    if (cell !== from) return cell;
    changed += 1;
    return to;
  });
  return { cells: next, changed };
}

export function serialize(pattern: Pattern): string {
  return JSON.stringify(pattern, null, 2);
}

export function parsePattern(json: string): Pattern {
  const value: unknown = JSON.parse(json);
  if (typeof value !== 'object' || value === null) throw new Error('工程文件不是对象');
  const raw = value as Partial<Pattern>;
  if (!Array.isArray(raw.cells) || typeof raw.w !== 'number' || typeof raw.h !== 'number') {
    throw new Error('工程文件缺少网格数据');
  }
  if (raw.cells.length !== raw.w * raw.h) throw new Error('工程文件网格尺寸不一致');
  if (!raw.cells.every((cell) => cell === null || typeof cell === 'string')) {
    throw new Error('工程文件含非法格子');
  }
  return createPattern({
    id: raw.id,
    name: raw.name,
    w: raw.w,
    h: raw.h,
    paletteId: raw.paletteId,
    beadSize: raw.beadSize,
    cells: raw.cells as Cell[],
    params: raw.params,
  });
}

export interface ConflictResult {
  winner: Pattern;
  conflict: boolean;
}

/** Never silently discard either side: keep the newer one and flag a tie. */
export function resolveConflict(local: Pattern, remote: Pattern): ConflictResult {
  const localTime = Date.parse(local.updatedAt) || 0;
  const remoteTime = Date.parse(remote.updatedAt) || 0;
  if (localTime === remoteTime && local.version === remote.version) {
    return { winner: local, conflict: false };
  }
  const conflict = Math.abs(localTime - remoteTime) < 2000 && local.version !== remote.version;
  return { winner: localTime >= remoteTime ? local : remote, conflict };
}
