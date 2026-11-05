import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  createUser,
  findUserById,
  findUserByName,
  getOrCreateSecret,
  hashRecoveryCode,
  newRecoveryCode,
  updateCredentials,
} from './store.mjs';

const COOKIE = 'wedou_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET = getOrCreateSecret();

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = createHmac('sha256', SECRET).update(`${header}.${body}`).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function checkPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function publicUser(user) {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}

export function register(username, password) {
  if (findUserByName(username)) throw new Error('该用户名已被使用');
  const { salt, hash } = hashPassword(password);
  const recoveryCode = newRecoveryCode();
  const user = createUser({
    username,
    passwordHash: hash,
    salt,
    recoveryHash: hashRecoveryCode(recoveryCode),
  });
  return { user, recoveryCode };
}

export function login(username, password) {
  const user = findUserByName(username);
  if (!user || !checkPassword(password, user.salt, user.hash)) throw new Error('用户名或密码不正确');
  return user;
}

/** Recovery codes replace email-based reset: no external service, no credentials. */
export function resetPassword(username, recoveryCode, newPassword) {
  const user = findUserByName(username);
  if (!user || !user.recoveryHash) throw new Error('用户名或恢复码不正确');
  const supplied = Buffer.from(hashRecoveryCode(recoveryCode), 'hex');
  const stored = Buffer.from(user.recoveryHash, 'hex');
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) {
    throw new Error('用户名或恢复码不正确');
  }
  const { salt, hash } = hashPassword(newPassword);
  const nextCode = newRecoveryCode();
  updateCredentials(user.id, hash, salt, hashRecoveryCode(nextCode));
  return { user: { ...user, hash, salt }, recoveryCode: nextCode };
}

export function setSession(res, user) {
  const token = sign({ sub: user.id, exp: Date.now() + SESSION_MS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MS,
    secure: false,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax' });
}

export function userFromRequest(req) {
  const payload = verify(req.cookies?.[COOKIE]);
  if (!payload) return null;
  return findUserById(payload.sub);
}

export function requireUser(req, res) {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return null;
  }
  return user;
}
