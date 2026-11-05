import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'server/data');
const USERS = path.join(DATA, 'users.json');
const PATTERNS = path.join(DATA, 'patterns');

function ensure() {
  mkdirSync(PATTERNS, { recursive: true });
  if (!existsSync(USERS)) writeFileSync(USERS, '[]\n', 'utf8');
}

function read(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function write(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function getUsers() {
  ensure();
  return read(USERS, []);
}

export function saveUsers(users) {
  ensure();
  write(USERS, users);
}

export function getUserPatterns(userId) {
  ensure();
  return read(path.join(PATTERNS, `${userId}.json`), []);
}

export function saveUserPatterns(userId, patterns) {
  ensure();
  write(path.join(PATTERNS, `${userId}.json`), patterns);
}

export function getOrCreateSecret() {
  ensure();
  const file = path.join(DATA, 'secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, `${secret}\n`, 'utf8');
  return secret;
}
