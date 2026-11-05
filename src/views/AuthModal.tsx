import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Modal } from '../components/ui';
import { api } from '../api/client';
import type { User } from '../api/client';

type Mode = 'login' | 'register' | 'reset';
interface Recovery {
  user: User;
  code: string;
}

export default function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'reset') {
        const result = await api.resetPassword(username.trim(), recoveryCode.trim(), newPassword);
        setRecovery({ user: result.user, code: result.recoveryCode });
      } else if (mode === 'register') {
        const result = await api.register(username.trim(), password);
        setRecovery({ user: result.user, code: result.recoveryCode });
      } else {
        const result = await api.login(username.trim(), password);
        onSuccess(result.user);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  if (recovery) {
    return (
      <Modal title="请保存恢复码" onClose={() => onSuccess(recovery.user)}>
        <div className="panel-head" style={{ border: 'none', marginBottom: 0 }}>
          <KeyRound size={20} />
        </div>
        <p>密码只能通过此恢复码找回，服务端只保存它的哈希，<strong>关闭后不会再显示</strong>。请复制并妥善保存。</p>
        <div className="recovery-code">{recovery.code}</div>
        <button
          className="btn small"
          onClick={() => {
            navigator.clipboard.writeText(recovery.code).then(
              () => setCopied(true),
              () => setError('复制失败，请手动选中恢复码复制'),
            );
          }}
        >
          <Copy size={14} /> {copied ? '已复制' : '复制恢复码'}
        </button>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="btn primary" onClick={() => onSuccess(recovery.user)}>我已保存</button>
        </div>
      </Modal>
    );
  }

  const ready =
    username.trim().length >= 2 &&
    (mode === 'reset' ? recoveryCode.trim().length > 0 && newPassword.length >= 6 : password.length >= 6);

  return (
    <Modal title="账号与图纸同步" onClose={onClose}>
      <div className="field">
        <div className="radio-group">
          <button className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>登录</button>
          <button className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>注册</button>
          <button className={mode === 'reset' ? 'selected' : ''} onClick={() => setMode('reset')}>忘记密码</button>
        </div>
      </div>
      <div className="field">
        <label>用户名</label>
        <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
      </div>
      {mode === 'reset' ? (
        <>
          <div className="field">
            <label>注册时保存的恢复码</label>
            <input className="input mono" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="例如 Ab3…-_xY9" />
          </div>
          <div className="field">
            <label>新密码（至少 6 位）</label>
            <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
          </div>
          <p className="eyebrow">重置成功后会生成一张新恢复码，旧码立即作废。</p>
        </>
      ) : (
        <div className="field">
          <label>密码（至少 6 位）</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
          />
        </div>
      )}
      {error ? <p className="modal-error">{error}</p> : null}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || !ready}>
          {busy ? '处理中…' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '重置密码'}
        </button>
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        <p className="eyebrow">
          {mode === 'register'
            ? '注册后会给你一张一次性恢复码，用于日后找回密码（不依赖邮箱或第三方服务）。'
            : '只保存图纸网格与拼装进度，不保存原图。'}
        </p>
      </div>
    </Modal>
  );
}
