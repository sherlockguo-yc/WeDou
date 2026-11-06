import { AlertTriangle, Sparkles } from 'lucide-react';
import { beadNote } from '../core/palettes';
import { usageRows } from '../core/stats';
import type { Pattern } from '../core/types';

export default function UsageTable({
  pattern,
  selectedCode,
  onSelect,
}: {
  pattern: Pattern;
  selectedCode?: string | null;
  onSelect?: (code: string | null) => void;
}) {
  const rows = usageRows(pattern);
  return (
    <div className="data-table">
      <div className="table-head">
        <span>色号 CODE</span>
        <span>参考色值 HEX</span>
        <span className="num">颗数</span>
        <span className="num">占比</span>
      </div>
      {rows.map((row) => {
        const selected = selectedCode === row.code;
        const note = beadNote(pattern.paletteId, row.code);
        const noteText = [
          note.finish ? `特效豆：${note.finish}` : '',
          note.disputedDeltaE ? `多来源色值差异 ΔE≈${note.disputedDeltaE}` : '',
        ]
          .filter(Boolean)
          .join('；');
        const cells = (
          <>
            <span className="table-cell">
              <span className="color-swatch" style={{ background: row.hex }} />
              <span className="mono">{row.code}</span>
              {note.finish ? <Sparkles size={12} style={{ flexShrink: 0 }} /> : null}
              {note.disputedDeltaE ? <AlertTriangle size={12} style={{ flexShrink: 0 }} /> : null}
            </span>
            <span className="table-cell"><span className="mono">{row.hex}</span></span>
            <span className="num mono">{row.count}</span>
            <span className="num mono">{`${(row.ratio * 100).toFixed(1)}%`}</span>
          </>
        );
        return onSelect ? (
          <button
            type="button"
            className={`table-row is-button${selected ? ' selected' : ''}`}
            key={row.code}
            aria-pressed={selected}
            title={`${selected ? '取消高亮' : '只高亮'} ${row.code}${noteText ? ` — ${noteText}` : ''}`}
            onClick={() => onSelect(selected ? null : row.code)}
          >
            {cells}
          </button>
        ) : (
          <div className="table-row" key={row.code} title={noteText || undefined}>{cells}</div>
        );
      })}
      {rows.length === 0 ? (
        <div className="table-row"><span className="table-cell"><span>暂无用豆</span></span></div>
      ) : null}
    </div>
  );
}
