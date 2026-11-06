import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TOGGLE_PREFERENCES,
  PREFERENCES_KEY,
  isTogglePatch,
  preferencesFromParams,
  readTogglePreferences,
  withTogglePreferences,
  writeTogglePreferences,
} from '../src/core/preferences';
import { DEFAULT_BACKGROUND_TOLERANCE, DEFAULT_PARAMS } from '../src/core/types';

function memoryStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    entries,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toggle preferences', () => {
  it('derives factory defaults from DEFAULT_PARAMS', () => {
    expect(DEFAULT_TOGGLE_PREFERENCES).toEqual({
      lockRatio: true,
      transparentAsEmpty: DEFAULT_PARAMS.transparentAsEmpty,
      autoBackground: false,
      removeIsolated: DEFAULT_PARAMS.removeIsolated,
      mergeSmallRegions: DEFAULT_PARAMS.mergeSmallRegions,
      detailPreserve: true,
      dithering: DEFAULT_PARAMS.dithering,
      excludeSpecial: true,
    });
  });

  it('round-trips a user-chosen set of switches', () => {
    const params = {
      ...DEFAULT_PARAMS,
      transparentAsEmpty: false,
      backgroundTolerance: DEFAULT_BACKGROUND_TOLERANCE,
      removeIsolated: false,
      mergeSmallRegions: false,
      detailPreserve: false,
      dithering: true,
      excludeSpecial: false,
    };
    const preferences = preferencesFromParams(params, false);
    expect(preferences).toEqual({
      lockRatio: false,
      transparentAsEmpty: false,
      autoBackground: true,
      removeIsolated: false,
      mergeSmallRegions: false,
      detailPreserve: false,
      dithering: true,
      excludeSpecial: false,
    });
    const restored = withTogglePreferences(DEFAULT_PARAMS, preferences);
    expect(preferencesFromParams(restored, preferences.lockRatio)).toEqual(preferences);
  });

  it('maps the auto-background switch to a tolerance value', () => {
    expect(withTogglePreferences(DEFAULT_PARAMS, { ...DEFAULT_TOGGLE_PREFERENCES, autoBackground: true }).backgroundTolerance)
      .toBe(DEFAULT_BACKGROUND_TOLERANCE);
    expect(withTogglePreferences({ ...DEFAULT_PARAMS, backgroundTolerance: 99 }, { ...DEFAULT_TOGGLE_PREFERENCES, autoBackground: false }).backgroundTolerance)
      .toBe(0);
  });

  it('treats a missing detailPreserve as on, like the UI does', () => {
    expect(preferencesFromParams({ ...DEFAULT_PARAMS, detailPreserve: undefined }, true).detailPreserve).toBe(true);
  });

  it('keeps per-image fields and does not mutate its input', () => {
    const params = { ...DEFAULT_PARAMS, width: 42, height: 21, maxColors: 7 };
    const restored = withTogglePreferences(params, { ...DEFAULT_TOGGLE_PREFERENCES, dithering: true });
    expect(restored.width).toBe(42);
    expect(restored.height).toBe(21);
    expect(restored.maxColors).toBe(7);
    expect(restored.dithering).toBe(true);
    expect(params.dithering).toBe(DEFAULT_PARAMS.dithering);
  });

  it('recognises only switch patches', () => {
    expect(isTogglePatch({ dithering: true })).toBe(true);
    expect(isTogglePatch({ backgroundTolerance: 0 })).toBe(true);
    expect(isTogglePatch({ width: 30, maxColors: 12 })).toBe(false);
    expect(isTogglePatch({})).toBe(false);
  });
});

describe('toggle preference storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('reads back what was written', () => {
    const preferences = { ...DEFAULT_TOGGLE_PREFERENCES, removeIsolated: false, lockRatio: false };
    writeTogglePreferences(preferences);
    expect(readTogglePreferences()).toEqual(preferences);
  });

  it('falls back field by field when entries are missing or malformed', () => {
    const raw = { dithering: true, removeIsolated: 'false', transparentAsEmpty: null, unknown: 1 };
    vi.stubGlobal('localStorage', memoryStorage({ [PREFERENCES_KEY]: JSON.stringify(raw) }));
    expect(readTogglePreferences()).toEqual({ ...DEFAULT_TOGGLE_PREFERENCES, dithering: true });
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a primitive', '"on"'],
  ])('falls back to factory defaults for %s', (_label, raw) => {
    vi.stubGlobal('localStorage', memoryStorage({ [PREFERENCES_KEY]: raw }));
    expect(readTogglePreferences()).toEqual(DEFAULT_TOGGLE_PREFERENCES);
  });

  it('degrades quietly when storage is unavailable or throws', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readTogglePreferences()).toEqual(DEFAULT_TOGGLE_PREFERENCES);
    expect(() => writeTogglePreferences(DEFAULT_TOGGLE_PREFERENCES)).not.toThrow();

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    });
    expect(readTogglePreferences()).toEqual(DEFAULT_TOGGLE_PREFERENCES);
    expect(() => writeTogglePreferences(DEFAULT_TOGGLE_PREFERENCES)).not.toThrow();
  });
});
