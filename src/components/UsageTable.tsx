import { usageRows } from '../core/stats';
import type { Pattern } from '../core/types';

export default function UsageTable({ pattern }: { pattern: Pattern }) {
  const rows = usageRows(pattern);
  return (
    <div className="data-table">
      <div className="table-head">
        <span>色号 CODE</span>
        <span>参考色值 HEX</span>
        <span className="num">颗数</span>
        <span className="num">占比</span>
      </div>
      {rows.map((row) => (
        <div className="table-row" key={row.code}>
          <span className="table-cell">
            <span className="color-swatch" style={{ background: row.hex }} />
            <span className="mono">{row.code}</span>
          </span>
          <span className="table-cell"><span className="mono">{row.hex}</span></span>
          <span className="num mono">{row.count}</span>
          <span className="num mono">{`${(row.ratio * 100).toFixed(1)}%`}</span>
        </div>
      ))}
      {rows.length === 0 ? (
        <div className="table-row"><span className="table-cell"><span>暂无用豆</span></span></div>
      ) : null}
    </div>
  );
}
