import { DEFAULT_BACKGROUND_TOLERANCE, DEFAULT_PARAMS } from './types';
import type { ConvertParams } from './types';

export const PREFERENCES_KEY = 'wedou.toggle-preferences';

/** The eight switches in "3 · 定图纸". Sizes and colour count belong to one image, not to a preference. */
export interface TogglePreferences {
  lockRatio: boolean;
  transparentAsEmpty: boolean;
  autoBackground: boolean;
  removeIsolated: boolean;
  mergeSmallRegions: boolean;
  detailPreserve: boolean;
  dithering: boolean;
  excludeSpecial: boolean;
}

/** Param keys that a user toggle can change; everything else in ConvertParams is per-image. */
export const TOGGLE_KEYS = [
  'transparentAsEmpty',
  'backgroundTolerance',
  'removeIsolated',
  'mergeSmallRegions',
  'detailPreserve',
  'dithering',
  'excludeSpecial',
] as const satisfies readonly (keyof ConvertParams)[];

export function isTogglePatch(patch: Partial<ConvertParams>): boolean {
  return TOGGLE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

export function preferencesFromParams(params: ConvertParams, lockRatio: boolean): TogglePreferences {
  return {
    lockRatio,
    transparentAsEmpty: params.transparentAsEmpty,
    autoBackground: params.backgroundTolerance > 0,
    removeIsolated: params.removeIsolated,
    mergeSmallRegions: params.mergeSmallRegions,
    detailPreserve: params.detailPreserve !== false,
    dithering: params.dithering,
    excludeSpecial: params.excludeSpecial !== false,
  };
}

/** Restores only the switches; width / height / maxColors stay untouched. */
export function withTogglePreferences(
  params: ConvertParams,
  preferences: TogglePreferences,
): ConvertParams {
  return {
    ...params,
    transparentAsEmpty: preferences.transparentAsEmpty,
    backgroundTolerance: preferences.autoBackground ? DEFAULT_BACKGROUND_TOLERANCE : 0,
    removeIsolated: preferences.removeIsolated,
    mergeSmallRegions: preferences.mergeSmallRegions,
    detailPreserve: preferences.detailPreserve,
    dithering: preferences.dithering,
    excludeSpecial: preferences.excludeSpecial,
  };
}

export const DEFAULT_TOGGLE_PREFERENCES: TogglePreferences = preferencesFromParams(DEFAULT_PARAMS, true);

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** localStorage is user-editable input: only booleans are trusted, everything else falls back. */
export function readTogglePreferences(): TogglePreferences {
  const storage = browserStorage();
  if (!storage) return DEFAULT_TOGGLE_PREFERENCES;
  let raw: string | null;
  try {
    raw = storage.getItem(PREFERENCES_KEY);
  } catch {
    return DEFAULT_TOGGLE_PREFERENCES;
  }
  if (!raw) return DEFAULT_TOGGLE_PREFERENCES;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_TOGGLE_PREFERENCES;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_TOGGLE_PREFERENCES;
  }

  const record = value as Record<string, unknown>;
  const bool = (key: keyof TogglePreferences): boolean => {
    const stored = record[key];
    return typeof stored === 'boolean' ? stored : DEFAULT_TOGGLE_PREFERENCES[key];
  };
  return {
    lockRatio: bool('lockRatio'),
    transparentAsEmpty: bool('transparentAsEmpty'),
    autoBackground: bool('autoBackground'),
    removeIsolated: bool('removeIsolated'),
    mergeSmallRegions: bool('mergeSmallRegions'),
    detailPreserve: bool('detailPreserve'),
    dithering: bool('dithering'),
    excludeSpecial: bool('excludeSpecial'),
  };
}

export function writeTogglePreferences(preferences: TogglePreferences): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Private mode or quota exceeded: the app still works, it just cannot remember.
  }
}
