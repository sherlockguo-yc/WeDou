import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.WEDOU_DATA_DIR ?? path.join(ROOT, 'server/data');
const DB_FILE = path.join(DATA, 'wedou.sqlite');
const BACKUP_DIR = path.join(DATA, 'backups');
const LEGACY_USERS = path.join(DATA, 'users.json');
const LEGACY_PATTERNS = path.join(DATA, 'patterns');
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BACKUP_KEEP = 10;
const SECRET_FILE = path.join(DATA, 'secret');

const PATTERN_COLUMNS =
  'id, user_id, name, w, h, palette_id, bead_size, cells, params, progress, version, updated_at';
const MARKET_COLUMNS =
  'id, source_id, owner_id, owner_name, name, w, h, palette_id, bead_size, cells, params, thumb, created_at';
const MARKET_SUMMARY_COLUMNS =
  'id, source_id, owner_id, owner_name, name, w, h, palette_id, bead_size, thumb, created_at';

let db = null;
let lastBackupAt = 0;

function wasm(file) {
  return path.join(ROOT, 'node_modules', 'sql.js', 'dist', file);
}

function one(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
}

function writeBackup(bytes) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(path.join(BACKUP_DIR, `wedou-${stamp}.sqlite`), bytes);
  const files = readdirSync(BACKUP_DIR).filter((name) => name.endsWith('.sqlite')).sort();
  while (files.length > BACKUP_KEEP) unlinkSync(path.join(BACKUP_DIR, files.shift()));
}

/** Atomic replace keeps the DB readable even if a write is interrupted. */
function persist() {
  if (!db) return;
  const bytes = Buffer.from(db.export());
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, DB_FILE);
  const now = Date.now();
  if (now - lastBackupAt >= BACKUP_INTERVAL_MS) {
    writeBackup(bytes);
    lastBackupAt = now;
  }
}

function exec(sql, params = []) {
  run(sql, params);
  persist();
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function patternArgs(userId, p) {
  return [
    p.id,
    userId,
    p.name ?? '',
    p.w,
    p.h,
    p.paletteId ?? '',
    p.beadSize ?? '5mm',
    JSON.stringify(p.cells ?? []),
    JSON.stringify(p.params ?? {}),
    JSON.stringify(p.progress ?? []),
    p.version ?? 1,
    p.updatedAt ?? new Date().toISOString(),
  ];
}

function rowToPattern(row) {
  return {
    id: row.id,
    name: row.name,
    w: row.w,
    h: row.h,
    paletteId: row.palette_id,
    beadSize: row.bead_size,
    cells: parseJson(row.cells, []),
    params: parseJson(row.params, {}),
    progress: parseJson(row.progress, []),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function rowToMarketSummary(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    name: row.name,
    w: row.w,
    h: row.h,
    paletteId: row.palette_id,
    beadSize: row.bead_size,
    thumb: row.thumb,
    createdAt: row.created_at,
  };
}

/** Bounds the query; matching uses instr(), so % and _ stay literal characters. */
export function sanitizeSearch(value, maxLength = 80) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function userFromRow(row) {
  return {
    id: row.id,
    username: row.username,
    hash: row.password_hash,
    salt: row.salt,
    recoveryHash: row.recovery_hash || '',
    createdAt: row.created_at,
  };
}

const INSERT_PATTERN = `INSERT OR REPLACE INTO patterns (${PATTERN_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
const INSERT_MARKET = `INSERT OR REPLACE INTO market_items (${MARKET_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;

/** One-time import of the pre-SQLite JSON files; originals are kept as .migrated. */
function migrateLegacy() {
  if (!existsSync(LEGACY_USERS)) return;
  const existing = one('SELECT COUNT(*) AS n FROM users');
  if (existing && Number(existing.n) > 0) return;

  const users = parseJson(readFileSync(LEGACY_USERS, 'utf8'), []);
  for (const user of users) {
    run(
      'INSERT OR IGNORE INTO users (id,username,password_hash,salt,recovery_hash,created_at) VALUES (?,?,?,?,?,?)',
      [user.id, user.username, user.hash, user.salt, '', user.createdAt ?? new Date().toISOString()],
    );
  }
  if (existsSync(LEGACY_PATTERNS)) {
    for (const file of readdirSync(LEGACY_PATTERNS).filter((name) => name.endsWith('.json'))) {
      const userId = path.basename(file, '.json');
      const patterns = parseJson(readFileSync(path.join(LEGACY_PATTERNS, file), 'utf8'), []);
      for (const pattern of patterns) run(INSERT_PATTERN, patternArgs(userId, pattern));
    }
  }
  renameSync(LEGACY_USERS, `${LEGACY_USERS}.migrated`);
  console.log(`WeDou: migrated ${users.length} legacy accounts into SQLite`);
}

export async function initDb() {
  if (db) return;
  mkdirSync(DATA, { recursive: true });
  const SQL = await initSqlJs({ locateFile: wasm });
  db = existsSync(DB_FILE) ? new SQL.Database(readFileSync(DB_FILE)) : new SQL.Database();

  run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    recovery_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS patterns (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    w INTEGER NOT NULL,
    h INTEGER NOT NULL,
    palette_id TEXT NOT NULL DEFAULT '',
    bead_size TEXT NOT NULL DEFAULT '5mm',
    cells TEXT NOT NULL,
    params TEXT NOT NULL DEFAULT '{}',
    progress TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`);
  run('CREATE INDEX IF NOT EXISTS idx_patterns_user ON patterns(user_id, updated_at DESC)');
  run(`CREATE TABLE IF NOT EXISTS market_items (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    name TEXT NOT NULL,
    w INTEGER NOT NULL,
    h INTEGER NOT NULL,
    palette_id TEXT NOT NULL DEFAULT '',
    bead_size TEXT NOT NULL DEFAULT '5mm',
    cells TEXT NOT NULL,
    params TEXT NOT NULL DEFAULT '{}',
    thumb TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (owner_id, source_id)
  )`);
  run('CREATE INDEX IF NOT EXISTS idx_market_created ON market_items(created_at DESC, id DESC)');

  migrateLegacy();
  persist();
}

export function getOrCreateSecret() {
  mkdirSync(DATA, { recursive: true });
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(SECRET_FILE, `${secret}\n`, 'utf8');
  return secret;
}

/* ---------- users ---------- */

export function findUserById(id) {
  const row = one('SELECT * FROM users WHERE id = ?', [id]);
  return row ? userFromRow(row) : null;
}

export function findUserByName(username) {
  const row = one('SELECT * FROM users WHERE lower(username) = lower(?)', [username]);
  return row ? userFromRow(row) : null;
}

export function newRecoveryCode() {
  return randomBytes(12).toString('base64url');
}

export function hashRecoveryCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

export function createUser({ username, passwordHash, salt, recoveryHash }) {
  const id = randomBytes(12).toString('hex');
  const createdAt = new Date().toISOString();
  exec(
    'INSERT INTO users (id,username,password_hash,salt,recovery_hash,created_at) VALUES (?,?,?,?,?,?)',
    [id, username, passwordHash, salt, recoveryHash, createdAt],
  );
  return { id, username, hash: passwordHash, salt, recoveryHash, createdAt };
}

export function updateCredentials(id, passwordHash, salt, recoveryHash) {
  exec(
    'UPDATE users SET password_hash = ?, salt = ?, recovery_hash = ? WHERE id = ?',
    [passwordHash, salt, recoveryHash, id],
  );
}

/* ---------- private patterns ---------- */

export function listPatterns(userId) {
  return all(
    `SELECT ${PATTERN_COLUMNS} FROM patterns WHERE user_id = ? ORDER BY updated_at DESC`,
    [userId],
  ).map(rowToPattern);
}

export function getPattern(userId, id) {
  const row = one(`SELECT ${PATTERN_COLUMNS} FROM patterns WHERE user_id = ? AND id = ?`, [userId, id]);
  return row ? rowToPattern(row) : null;
}

export function upsertPattern(userId, pattern) {
  exec(INSERT_PATTERN, patternArgs(userId, pattern));
  return pattern;
}

export function removePattern(userId, id) {
  exec('DELETE FROM patterns WHERE user_id = ? AND id = ?', [userId, id]);
}

/* ---------- public market ---------- */

/** Summaries never carry cells/params: the list must stay cheap to transfer. */
export function listMarket({ q = '', limit = 24, offset = 0 } = {}) {
  const needle = sanitizeSearch(q);
  const where = needle
    ? 'WHERE instr(lower(name), lower(?)) > 0 OR instr(lower(owner_name), lower(?)) > 0'
    : '';
  const params = needle ? [needle, needle] : [];
  const counted = one(`SELECT COUNT(*) AS n FROM market_items ${where}`, params);
  const total = Number(counted?.n ?? 0);
  const rows = all(
    `SELECT ${MARKET_SUMMARY_COLUMNS} FROM market_items ${where}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { items: rows.map(rowToMarketSummary), total };
}

/** Lets the signed-in author find and revoke their own published items. */
export function listSharedItems(userId) {
  if (!userId) return [];
  return all('SELECT id, source_id FROM market_items WHERE owner_id = ?', [userId])
    .map((row) => ({ id: row.id, sourceId: row.source_id }));
}

export function getMarketItem(id) {
  const row = one(`SELECT ${MARKET_COLUMNS} FROM market_items WHERE id = ?`, [id]);
  if (!row) return null;
  return {
    ...rowToMarketSummary(row),
    cells: parseJson(row.cells, []),
    params: parseJson(row.params, {}),
  };
}

export function getMarketOwner(id) {
  const row = one('SELECT owner_id FROM market_items WHERE id = ?', [id]);
  return row?.owner_id ?? null;
}

/** Republishing the same private pattern updates one row instead of spamming the market. */
export function upsertMarketItem(user, pattern, thumb) {
  const existing = one(
    'SELECT id, created_at FROM market_items WHERE owner_id = ? AND source_id = ?',
    [user.id, pattern.id],
  );
  const id = existing?.id ?? randomBytes(12).toString('hex');
  const createdAt = existing?.created_at ?? new Date().toISOString();
  exec(INSERT_MARKET, [
    id,
    pattern.id,
    user.id,
    user.username,
    pattern.name.trim(),
    pattern.w,
    pattern.h,
    pattern.paletteId ?? '',
    pattern.beadSize ?? '5mm',
    JSON.stringify(pattern.cells),
    JSON.stringify(pattern.params ?? {}),
    thumb,
    createdAt,
  ]);
  return getMarketItem(id);
}

export function removeMarketItem(id) {
  exec('DELETE FROM market_items WHERE id = ?', [id]);
}

export function backupNow() {
  if (!db) return null;
  return { file: DB_FILE, backups: BACKUP_DIR, bytes: Buffer.from(db.export()).length };
}
