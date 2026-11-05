/** Excludes 0/O, 1/I and 8/B so symbols stay readable in greyscale print. */
const ALPHABET = '2345679ACDEFGHJKLMNPQRSTUVWXYZ';

export function symbolAt(index: number): string {
  if (index < ALPHABET.length) return ALPHABET[index];
  const first = Math.floor(index / ALPHABET.length) - 1;
  const second = index % ALPHABET.length;
  return `${ALPHABET[first % ALPHABET.length]}${ALPHABET[second]}`;
}

export function assignSymbols(codesInOrder: string[]): Map<string, string> {
  const symbols = new Map<string, string>();
  codesInOrder.forEach((code, index) => symbols.set(code, symbolAt(index)));
  return symbols;
}
