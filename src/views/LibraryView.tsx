import { useMemo, useRef, useState } from 'react';
import { Copy, LogIn, Pencil, Save, Search, Share2, Trash2, Undo2, Upload, X } from 'lucide-react';
import { Modal, Notice } from '../components/ui';
import PatternThumb from '../components/PatternThumb';
import { DEFAULT_PATTERN_NAME } from '../core/pattern';
import { getPalette } from '../core/palettes';
import type { Pattern } from '../core/types';
import type { User } from '../api/client';

export default function LibraryView({
  patterns,
  user,
  sharedBySource,
  marketAvailable,
  busy,
  onOpen,
  onDelete,
  onDuplicate,
  onImport,
  onLogin,
  onRename,
  onShare,
  onUnshare,
}: {
  patterns: Pattern[];
  user: User | null;
  sharedBySource: Record<string, string>;
  marketAvailable: boolean;
  busy: boolean;
  onOpen: (pattern: Pattern) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onImport: (file: File) => void;
  onLogin?: () => void;
  onRename: (id: string, name: string) => void;
  onShare: (pattern: Pattern) => void;
  onUnshare: (marketId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<Pattern | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return patterns;
    return patterns.filter((pattern) => pattern.name.toLowerCase().includes(needle));
  }, [patterns, query]);

  const beginRename = (pattern: Pattern) => {
    setRenaming(pattern);
    setDraftName(pattern.name);
    setRenameError('');
  };

  const submitRename = () => {
    if (!renaming) return;
    const name = draftName.trim();
    if (!name || name.length > 80 || name === DEFAULT_PATTERN_NAME) {
      setRenameError('请起一个 1–80 字、且不是「未命名图纸」的名字');
      return;
    }
    onRename(renaming.id, name);
    setRenaming(null);
  };

  return (
    <div className="library">
      <section className="panel">
        <div className="library-head">
          <div>
            <h2>图纸仓库</h2>
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

        <div className="search-row">
          <Search size={14} />
          <input
            className="input"
            type="search"
            value={query}
            maxLength={80}
            placeholder="按名称搜索我的图纸"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索我的图纸"
          />
          {query ? <button className="btn small ghost" onClick={() => setQuery('')} aria-label="清空搜索"><X size={13} /></button> : null}
        </div>

        {patterns.length === 0 ? (
          <div className="empty-state">
            <Save size={36} />
            <h2>还没有保存的图纸</h2>
            <p>在工作台生成图纸后点「保存图纸」，或在这里导入工程文件。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Search size={36} />
            <h2>没有匹配的图纸</h2>
            <p>试试别的关键词，或清空搜索查看全部 {patterns.length} 张图纸。</p>
            <button className="btn small" onClick={() => setQuery('')}>清空搜索</button>
          </div>
        ) : (
          <div className="pattern-grid">
            {filtered.map((pattern) => {
              const marketId = sharedBySource[pattern.id];
              return (
                <article className="pattern-card" key={pattern.id}>
                  <button className="pattern-card-preview" onClick={() => onOpen(pattern)} title="打开这张图纸">
                    <PatternThumb pattern={pattern} alt={`${pattern.name} 预览`} />
                  </button>
                  <div className="pattern-card-body">
                    <h3 title={pattern.name}>{pattern.name}</h3>
                    <div className="pattern-card-meta">
                      <span>{pattern.w}×{pattern.h} · {getPalette(pattern.paletteId).name}</span>
                      <span>{new Date(pattern.updatedAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    {marketId ? <span className="shared-badge">已分享到市集</span> : null}
                  </div>
                  <div className="pattern-card-actions">
                    <button className="btn small" onClick={() => onOpen(pattern)}>打开</button>
                    <button className="btn small ghost" onClick={() => beginRename(pattern)} title="重命名"><Pencil size={13} /> 改名</button>
                    <button className="btn small ghost" onClick={() => onDuplicate(pattern.id)} title="复制"><Copy size={13} /> 复制</button>
                    {marketId ? (
                      <button className="btn small ghost" disabled={busy} onClick={() => onUnshare(marketId)}>
                        <Undo2 size={13} /> 撤销分享
                      </button>
                    ) : (
                      <button
                        className="btn small ghost"
                        disabled={busy || !marketAvailable}
                        title={marketAvailable ? '发布到图纸市集，所有人可见' : '本地模式或后端不可用，无法分享'}
                        onClick={() => onShare(pattern)}
                      >
                        <Share2 size={13} /> 分享到市集
                      </button>
                    )}
                    <button className="btn small ghost danger" onClick={() => onDelete(pattern.id)} title="删除"><Trash2 size={13} /> 删除</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {renaming ? (
        <Modal title="给图纸起个名字" onClose={() => setRenaming(null)}>
          <p>名字会用于图纸仓库和图纸市集的搜索，也让别人一眼认出这张图纸。</p>
          <div className="field">
            <label htmlFor="rename-input">图纸名称</label>
            <input
              id="rename-input"
              className="input"
              value={draftName}
              maxLength={80}
              autoFocus
              onChange={(event) => { setDraftName(event.target.value); setRenameError(''); }}
              onKeyDown={(event) => { if (event.key === 'Enter') submitRename(); }}
            />
          </div>
          {renameError ? <p className="form-error">{renameError}</p> : null}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setRenaming(null)}>取消</button>
            <button className="btn primary" onClick={submitRename}>保存名称</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
