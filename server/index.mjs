import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearSession, login, publicUser, register, requireUser, setSession, userFromRequest } from './auth.mjs';
import { getUserPatterns, saveUserPatterns } from './store.mjs';

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

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = validate(req.body);
    const user = register(username, password);
    setSession(res, user);
    res.json({ user: publicUser(user) });
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

app.post('/api/auth/logout', (req, res) => {
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
  res.json({ patterns: getUserPatterns(user.id) });
});

app.post('/api/patterns', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const pattern = req.body?.pattern;
  if (!validPattern(pattern)) {
    res.status(400).json({ error: '工程数据不合法' });
    return;
  }
  const patterns = getUserPatterns(user.id);
  const existing = patterns.findIndex((item) => item.id === pattern.id);
  if (existing >= 0) {
    const stored = patterns[existing];
    if ((stored.version ?? 1) > (pattern.version ?? 1)) {
      res.status(409).json({ error: '云端版本较新', pattern: stored });
      return;
    }
    patterns[existing] = pattern;
  } else {
    patterns.push(pattern);
  }
  saveUserPatterns(user.id, patterns);
  res.json({ pattern });
});

app.delete('/api/patterns/:id', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const patterns = getUserPatterns(user.id).filter((item) => item.id !== req.params.id);
  saveUserPatterns(user.id, patterns);
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

app.listen(PORT, () => {
  console.log(`WeDou server listening on http://localhost:${PORT}`);
});
