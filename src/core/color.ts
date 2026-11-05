import type { BeadColor, Lab, Rgb } from './types';

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = Number.parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToLab(rgb: Rgb): Lab {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(rgb.r);
  const g = channel(rgb.g);
  const b = channel(rgb.b);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degValue: number) => (degValue * Math.PI) / 180;

/** CIEDE2000 colour difference. Reference: Sharma, Wu & Dalal (2005). */
export function deltaE00(first: Lab, second: Lab): number {
  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));

  const a1p = first.a * (1 + g);
  const a2p = second.a * (1 + g);
  const c1p = Math.hypot(a1p, first.b);
  const c2p = Math.hypot(a2p, second.b);
  const h1p = c1p === 0 ? 0 : (deg(Math.atan2(first.b, a1p)) + 360) % 360;
  const h2p = c2p === 0 ? 0 : (deg(Math.atan2(second.b, a2p)) + 360) % 360;

  const dLp = second.L - first.L;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp) / 2);

  const lBarP = (first.L + second.L) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP: number;
  if (c1p * c2p === 0) hBarP = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
  else hBarP = (h1p + h2p - 360) / 2;

  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63));

  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;

  const termL = dLp / sl;
  const termC = dCp / sc;
  const termH = dHp / sh;
  return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + rt * termC * termH);
}

export interface ColorMatch {
  color: BeadColor;
  deltaE: number;
}

export type LabCache = Map<string, Lab>;

export function buildLabCache(colors: BeadColor[]): LabCache {
  return new Map(colors.map((color) => [color.code, hexToLab(color.hex)]));
}

export function nearestColor(
  target: Lab,
  colors: BeadColor[],
  cache?: LabCache,
): ColorMatch | null {
  let best: ColorMatch | null = null;
  for (const color of colors) {
    const lab = cache?.get(color.code) ?? hexToLab(color.hex);
    const deltaE = deltaE00(target, lab);
    if (!best || deltaE < best.deltaE) best = { color, deltaE };
  }
  return best;
}

/** Approximate cross-brand equivalent: nearest colour in the target palette. */
export function findEquivalent(
  hex: string,
  targetColors: BeadColor[],
  targetCache?: LabCache,
): ColorMatch | null {
  return nearestColor(hexToLab(hex), targetColors, targetCache);
}

export function isApproximate(deltaE: number): boolean {
  return deltaE > 10;
}
