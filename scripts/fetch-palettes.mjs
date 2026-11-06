import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src/data/palettes.json');
const BASE = 'https://www.bitbead.app/en/colors';

const SOURCES = [
  { id: 'mard-221', slug: 'mard', brand: 'MARD', name: 'MARD 221', expected: 221 },
  { id: 'mard-291', slug: 'mard-291', brand: 'MARD', name: 'MARD 291', expected: 291 },
  { id: 'perler-117', slug: 'perler', brand: 'Perler', name: 'Perler 117', expected: 117 },
  { id: 'hama-89', slug: 'hama', brand: 'Hama', name: 'Hama 89', expected: 89 },
  { id: 'artkal-176', slug: 'artkal', brand: 'Artkal', name: 'Artkal 176', expected: 176 },
  { id: 'artkal-mini-221', slug: 'artkal-mini', brand: 'Artkal', name: 'Artkal Mini 221', expected: 221 },
  { id: 'coco-291', slug: 'coco', brand: 'COCO', name: 'COCO 291', expected: 291 },
];

const SOURCE_NOTE = 'bitbead.app colour charts (public reference values, not manufacturer spectrophotometer data)';
const DATASET_NOTE = 'HEX values are reference approximations; dye lots vary. Charts use colour codes, not screen colour, as the source of truth.';

const FLAGS = new Set(process.argv.slice(2));
const UNKNOWN = [...FLAGS].filter((flag) => flag !== '--check' && flag !== '--update');
const CHECK = FLAGS.has('--check');
const UPDATE = FLAGS.has('--update');

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

/** Only colours take part in the fingerprint: metadata changes must not look like data drift. */
function compact(palettes) {
  return palettes.map((palette) => ({
    id: palette.id,
    colors: palette.colors.map((color) => [color.code, color.name, color.hex]),
  }));
}

function contentHash(palettes) {
  return createHash('sha256').update(JSON.stringify(compact(palettes))).digest('hex');
}

/** A human-readable diff so a scraper change can never silently rewrite 1406 colours. */
function diffPalettes(previous, next) {
  const lines = [];
  const before = new Map(previous.map((palette) => [palette.id, palette]));
  const after = new Map(next.map((palette) => [palette.id, palette]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const b = after.get(id);
    if (!a) {
      lines.push(`+ palette ${id} (${b.colors.length} colours)`);
      continue;
    }
    if (!b) {
      lines.push(`- palette ${id} (${a.colors.length} colours)`);
      continue;
    }
    const oldCodes = new Map(a.colors.map((color) => [color.code, color]));
    const newCodes = new Map(b.colors.map((color) => [color.code, color]));
    for (const code of new Set([...oldCodes.keys(), ...newCodes.keys()])) {
      const x = oldCodes.get(code);
      const y = newCodes.get(code);
      if (!x) {
        lines.push(`+ ${id}/${code} ${y.hex}`);
      } else if (!y) {
        lines.push(`- ${id}/${code} ${x.hex}`);
      } else {
        if (x.hex !== y.hex) lines.push(`~ ${id}/${code} HEX ${x.hex} -> ${y.hex}`);
        if (x.name !== y.name) lines.push(`~ ${id}/${code} NAME ${x.name} -> ${y.name}`);
      }
    }
  }
  return lines;
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
    const entry = {
      code,
      name: rawName && rawName !== code ? rawName : code,
      hex: hex.toUpperCase(),
    };
    const existing = byCode.get(code);
    // RSC chunks are concatenated: a code paired with two HEX values means records got crossed.
    if (existing) {
      if (existing.hex !== entry.hex) {
        throw new Error(`${source.id}: ${code} has conflicting HEX ${existing.hex} / ${entry.hex}`);
      }
      continue;
    }
    byCode.set(code, entry);
  }

  if (byCode.size !== source.expected) {
    throw new Error(`${source.id}: expected ${source.expected} colors, extracted ${byCode.size}`);
  }
  if (declared && declared !== source.expected) {
    throw new Error(`${source.id}: page declares ${declared}, expected ${source.expected}`);
  }
  for (const color of byCode.values()) {
    if (!color.code.trim() || !color.name.trim() || !/^#[0-9A-F]{6}$/.test(color.hex)) {
      throw new Error(`${source.id}: invalid record ${JSON.stringify(color)}`);
    }
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

async function readBaseline() {
  try {
    return JSON.parse(await readFile(DATA_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`cannot read ${DATA_PATH}: ${error.message}`);
  }
}

async function main() {
  if (UNKNOWN.length > 0) throw new Error(`unknown flag(s): ${UNKNOWN.join(', ')}`);
  if (CHECK && UPDATE) throw new Error('--check and --update cannot be combined');

  const palettes = [];
  for (const source of SOURCES) {
    const palette = await fetchPalette(source);
    palettes.push(palette);
    console.log(`${palette.id.padEnd(16)} ${String(palette.colors.length).padStart(4)} colors  ${palette.sourceUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const baseline = await readBaseline();
  const changes = baseline ? diffPalettes(baseline.palettes, palettes) : [];
  const hash = contentHash(palettes);
  const staleHash = Boolean(baseline?.contentHash && baseline.contentHash !== hash);
  console.log(`\ncontentHash ${hash}`);
  if (!baseline) {
    console.log('No existing dataset; this is the first generation.');
  } else if (changes.length > 0 || staleHash) {
    console.log(`${changes.length} colour change(s) vs src/data/palettes.json${staleHash ? '; stored contentHash is stale' : ''}:`);
    for (const line of changes.slice(0, 40)) console.log(`  ${line}`);
    if (changes.length > 40) console.log(`  ... ${changes.length - 40} more`);
  } else {
    console.log('No colour changes vs src/data/palettes.json.');
  }

  if (CHECK) {
    if (!baseline || changes.length > 0 || staleHash) {
      throw new Error('check failed: dataset is missing or differs from the live source');
    }
    console.log('Check OK: live source matches the committed dataset.');
    return;
  }

  const dirty = changes.length > 0 || staleHash;
  if (dirty && !UPDATE) {
    throw new Error('colour data changed: review the diff above, then re-run with --update to write it');
  }

  const dataset = {
    source: SOURCE_NOTE,
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: DATASET_NOTE,
    contentHash: hash,
    palettes,
  };

  await mkdir(path.join(ROOT, 'src/data'), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${palettes.reduce((n, p) => n + p.colors.length, 0)} colours to src/data/palettes.json`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
