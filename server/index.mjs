import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearSession,
  login,
  publicUser,
  register,
  requireUser,
  resetPassword,
  setSession,
  userFromRequest,
} from './auth.mjs';
import {
  backupNow,
  getPattern,
  initDb,
  listPatterns,
  removePattern,
  upsertPattern,
} from './store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

function validate(body) {
  const username = String(body?.username ?? '').trim();
  const password = String(body?.password ?? '');
  if (username.length < 2 || username.length > 32) throw new Error('用户名需 2-32 个字符');
  if (password.length < 6 || password.length > 128) throw new Error('密码需至少 6 个字符');
  return { username, password };
}

function validPattern(pattern) {
  return (
    pattern &&
    typeof pattern.id === 'string' &&
    Number.isInteger(pattern.w) &&
    Number.isInteger(pattern.h) &&
    Array.isArray(pattern.cells) &&
    pattern.cells.length === pattern.w * pattern.h &&
    pattern.w > 0 &&
    pattern.w <= 300 &&
    pattern.h > 0 &&
    pattern.h <= 300
  );
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'sqlite', ...(backupNow() ?? {}) });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = validate(req.body);
    const { user, recoveryCode } = register(username, password);
    setSession(res, user);
    res.json({ user: publicUser(user), recoveryCode });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = validate(req.body);
    const user = login(username, password);
    setSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/reset', (req, res) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const code = String(req.body?.recoveryCode ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');
    if (!code) throw new Error('请输入恢复码');
    if (newPassword.length < 6 || newPassword.length > 128) throw new Error('新密码需至少 6 个字符');
    const { user, recoveryCode } = resetPassword(username, code, newPassword);
    setSession(res, user);
    res.json({ user: publicUser(user), recoveryCode });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = userFromRequest(req);
  res.json({ user: user ? publicUser(user) : null });
});

app.get('/api/patterns', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ patterns: listPatterns(user.id) });
});

app.post('/api/patterns', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const pattern = req.body?.pattern;
  if (!validPattern(pattern)) {
    res.status(400).json({ error: '工程数据不合法' });
    return;
  }
  const stored = getPattern(user.id, pattern.id);
  if (stored && (stored.version ?? 1) > (pattern.version ?? 1)) {
    res.status(409).json({ error: '云端版本较新', pattern: stored });
    return;
  }
  upsertPattern(user.id, pattern);
  res.json({ pattern });
});

app.delete('/api/patterns/:id', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  removePattern(user.id, req.params.id);
  res.json({ ok: true });
});

const dist = path.join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message ?? '服务器错误' });
});

await initDb();

app.listen(PORT, () => {
  console.log(`WeDou server listening on http://localhost:${PORT} (SQLite storage)`);
});
