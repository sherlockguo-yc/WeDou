import { useState } from 'react';
import { Modal } from '../components/ui';
import { api } from '../api/client';
import type { User } from '../api/client';

export default function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const result = mode === 'login'
        ? await api.login(username.trim(), password)
        : await api.register(username.trim(), password);
      onSuccess(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="登录以同步图纸" onClose={onClose}>
      <div className="field">
        <div className="radio-group">
          <button className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>登录</button>
          <button className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>注册</button>
        </div>
      </div>
      <div className="field">
        <label>用户名</label>
        <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
      </div>
      <div className="field">
        <label>密码（至少 6 位）</label>
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} />
      </div>
      {error ? <p className="modal-error">{error}</p> : null}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || !username.trim() || password.length < 6}>
          {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        <p className="eyebrow">只保存图纸网格与拼装进度，不保存原图。</p>
      </div>
    </Modal>
  );
}
