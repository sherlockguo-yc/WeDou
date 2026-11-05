import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.bitbead.app/en/colors';

const SOURCES = [
  { id: 'mard-221', slug: 'mard', brand: 'MARD', name: 'MARD 221', expected: 221 },
  { id: 'mard-291', slug: 'mard-291', brand: 'MARD', name: 'MARD 291', expected: 291 },
  { id: 'perler-117', slug: 'perler', brand: 'Perler', name: 'Perler 117', expected: 117 },
  { id: 'hama-89', slug: 'hama', brand: 'Hama', name: 'Hama 89', expected: 89 },
  { id: 'artkal-176', slug: 'artkal', brand: 'Artkal', name: 'Artkal 176', expected: 176 },
];

function decodeRsc(html) {
  const re = /self\.__next_f\.push\(\[1,(".*?")\]\)<\/script>/gs;
  let blob = '';
  for (const match of html.matchAll(re)) {
    try {
      blob += JSON.parse(match[1]);
    } catch {
      // A partial chunk is not fatal; the next chunk may still carry full records.
    }
  }
  return blob;
}

async function fetchPalette(source) {
  const url = `${BASE}/${source.slug}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'WeDou palette builder (educational, low-frequency)' },
  });
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  const html = await response.text();

  const declared = Number(/"numberOfItems"\s*:\s*(\d+)/.exec(html)?.[1] ?? 0);
  const blob = decodeRsc(html);
  const triple = /"code"\s*:\s*"([^"]{1,12})"\s*,\s*"name"\s*:\s*"([^"]*?)"\s*,\s*"hex"\s*:\s*"(#[0-9A-Fa-f]{6})"/g;

  const byCode = new Map();
  for (const match of blob.matchAll(triple)) {
    const [, code, rawName, hex] = match;
    byCode.set(code, {
      code,
      name: rawName && rawName !== code ? rawName : code,
      hex: hex.toUpperCase(),
    });
  }

  if (byCode.size !== source.expected) {
    throw new Error(`${source.id}: expected ${source.expected} colors, extracted ${byCode.size}`);
  }
  if (declared && declared !== source.expected) {
    throw new Error(`${source.id}: page declares ${declared}, expected ${source.expected}`);
  }

  const hexCounts = new Map();
  for (const color of byCode.values()) {
    hexCounts.set(color.hex, (hexCounts.get(color.hex) ?? 0) + 1);
  }
  const duplicates = [...hexCounts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.warn(`  ${source.id}: ${duplicates.length} HEX shared by multiple codes (same colour)`);
  }

  return {
    id: source.id,
    brand: source.brand,
    name: source.name,
    sourceUrl: url,
    colors: [...byCode.values()],
  };
}

async function main() {
  const palettes = [];
  for (const source of SOURCES) {
    const palette = await fetchPalette(source);
    palettes.push(palette);
    console.log(`${palette.id.padEnd(12)} ${String(palette.colors.length).padStart(4)} colors  ${palette.sourceUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const dataset = {
    source: 'bitbead.app colour charts (public reference values, not manufacturer spectrophotometer data)',
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: 'HEX values are reference approximations; dye lots vary. Charts use colour codes, not screen colour, as the source of truth.',
    palettes,
  };

  await mkdir(path.join(ROOT, 'src/data'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'src/data/palettes.json'),
    `${JSON.stringify(dataset, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nWrote ${palettes.reduce((n, p) => n + p.colors.length, 0)} colours to src/data/palettes.json`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
