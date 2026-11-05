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

/* ---------- patterns ---------- */

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

export function backupNow() {
  if (!db) return null;
  return { file: DB_FILE, backups: BACKUP_DIR, bytes: Buffer.from(db.export()).length };
}
