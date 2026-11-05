import { useRef } from 'react';
import { Copy, LogIn, Save, Trash2, Upload } from 'lucide-react';
import { Notice } from '../components/ui';
import { getPalette } from '../core/palettes';
import type { Pattern } from '../core/types';
import type { User } from '../api/client';

export default function LibraryView({
  patterns,
  user,
  onOpen,
  onDelete,
  onDuplicate,
  onImport,
  onLogin,
}: {
  patterns: Pattern[];
  user: User | null;
  onOpen: (pattern: Pattern) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onImport: (file: File) => void;
  onLogin?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="library">
      <section className="panel">
        <div className="library-head">
          <div>
            <h2>图纸库</h2>
            <span className="eyebrow">{patterns.length} 张图纸 · {user ? `已同步到 ${user.username}` : '本地草稿'}</span>
          </div>
          <div className="tool-row">
            <button className="btn small" onClick={() => fileRef.current?.click()}><Upload size={14} /> 导入工程</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.target.value = '';
              }}
            />
            {!user && onLogin ? <button className="btn small primary" onClick={onLogin}><LogIn size={14} /> 登录同步</button> : null}
          </div>
        </div>

        {!user ? (
          <div style={{ marginBottom: 'var(--s3)' }}>
            <Notice>
              {onLogin
                ? '当前是本地草稿，刷新后仍在但换设备看不到。登录后会把草稿同步到账号。'
                : '当前为本地模式：图纸保存在此浏览器，刷新后仍在。换设备请用「工程文件」导出再导入。'}
            </Notice>
          </div>
        ) : null}

        {patterns.length === 0 ? (
          <div className="empty-state">
            <Save size={36} />
            <h2>还没有保存的图纸</h2>
            <p>在工作台生成图纸后点「保存图纸」，或在这里导入工程文件。</p>
          </div>
        ) : (
          <div className="data-table">
            <div className="table-head">
              <span>名称</span>
              <span>尺寸 / 色板</span>
              <span>更新</span>
              <span>操作</span>
            </div>
            {patterns.map((pattern) => (
              <div className="table-row" key={pattern.id}>
                <button className="table-cell btn ghost small" style={{ border: 'none', justifyContent: 'flex-start', padding: 0 }} onClick={() => onOpen(pattern)}>
                  <span>{pattern.name}</span>
                </button>
                <span className="table-cell"><span className="mono">{pattern.w}×{pattern.h} · {getPalette(pattern.paletteId).name}</span></span>
                <span className="table-cell"><span className="mono">{new Date(pattern.updatedAt).toLocaleDateString('zh-CN')}</span></span>
                <span className="table-cell">
                  <button className="btn small ghost" onClick={() => onDuplicate(pattern.id)} title="复制"><Copy size={13} /></button>
                  <button className="btn small ghost danger" onClick={() => onDelete(pattern.id)} title="删除"><Trash2 size={13} /></button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
