import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, Info, Search, Sparkles, X } from 'lucide-react';
import { beadNote, duplicateCodes, getPalette, specialCodeCount } from '../core/palettes';

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
        {hint ? <div className="toggle-hint">{hint}</div> : null}
      </div>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="toggle-track" />
      </label>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  nested,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  nested?: boolean;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`modal-mask${nested ? ' nested' : ''}`} onMouseDown={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="请确认" onClose={onCancel}>
      <p>{message}</p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onCancel}>取消</button>
        <button className="btn primary" onClick={onConfirm}>继续</button>
      </div>
    </Modal>
  );
}

export function Toast({ message, kind }: { message: string; kind: 'info' | 'error' }) {
  return (
    <div className={`toast${kind === 'error' ? ' error' : ''}`} role="status">
      {kind === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
      <span>{message}</span>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <Info size={14} />
      <span>{children}</span>
    </div>
  );
}

/** 7+ options require a searchable list, not a plain select. */
export function ColorSearch({
  paletteId,
  value,
  onChange,
}: {
  paletteId: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => setQuery(''), [paletteId]);
  const palette = getPalette(paletteId);
  const duplicates = useMemo(() => duplicateCodes(paletteId), [paletteId]);
  const specialCount = useMemo(() => specialCodeCount(paletteId), [paletteId]);
  const sameColour = useMemo(() => {
    const byCode = new Map<string, string[]>();
    for (const codes of duplicates.values()) {
      for (const code of codes) byCode.set(code, codes.filter((item) => item !== code));
    }
    return byCode;
  }, [duplicates]);
  const needle = query.trim().toLowerCase();
  const matches = palette.colors.filter(
    (color) =>
      !needle ||
      color.code.toLowerCase().includes(needle) ||
      color.name.toLowerCase().includes(needle) ||
      color.hex.toLowerCase().includes(needle),
  );

  return (
    <div className="color-search">
      <div className="input" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s1)', padding: 0 }}>
        <Search size={14} style={{ marginLeft: 'var(--s2)', flexShrink: 0 }} />
        <input
          className="input"
          style={{ border: 'none', background: 'transparent', padding: 'var(--s2) var(--s2) var(--s2) 0' }}
          placeholder={`在 ${palette.colors.length} 个色号中搜索`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {duplicates.size > 0 ? (
        <div className="eyebrow">
          <AlertTriangle size={12} /> 该色板有 {duplicates.size} 组「同色不同号」，悬停色号可查看，避免买重豆
        </div>
      ) : null}
      {specialCount > 0 ? (
        <Notice>
          该色板含 {specialCount} 个特效色号（温变 / 光变 / 珠光 / 果冻 / 夜光 / 透明），HEX 只代表其中一种状态。菱形图标标出特效豆，三角图标标出多来源色值差异较大的色号，请以实物色卡为准。
        </Notice>
      ) : null}
      <div className="color-search-results">
        {matches.slice(0, 60).map((color) => {
          const peers = sameColour.get(color.code);
          const note = beadNote(paletteId, color.code);
          const notes = [
            peers ? `与 ${peers.join('、')} 完全相同` : '',
            note.finish ? `特效豆：${note.finish}` : '',
            note.disputedDeltaE ? `多来源色值差异 ΔE≈${note.disputedDeltaE}` : '',
          ].filter(Boolean);
          return (
            <button
              key={color.code}
              className={`color-option${value === color.code ? ' selected' : ''}${peers ? ' duplicate' : ''}`}
              onClick={() => onChange(color.code)}
              title={`${color.name} ${color.hex}${notes.length > 0 ? ` — ${notes.join('；')}` : ''}`}
            >
              <span className="color-swatch" style={{ background: color.hex }} />
              {color.code}
              {note.finish ? <Sparkles size={12} style={{ flexShrink: 0 }} /> : null}
              {note.disputedDeltaE ? <AlertTriangle size={12} style={{ flexShrink: 0 }} /> : null}
            </button>
          );
        })}
        {matches.length === 0 ? <span className="eyebrow">没有匹配的色号</span> : null}
      </div>
    </div>
  );
}
