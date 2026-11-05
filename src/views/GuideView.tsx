import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, EyeOff, Save } from 'lucide-react';
import ChartViewport from '../components/ChartViewport';
import { Notice, Toggle } from '../components/ui';
import { usageRows } from '../core/stats';
import type { Pattern } from '../core/types';

export default function GuideView({
  pattern,
  highlightCode,
  onHighlightCode,
  onToggleCell,
  onBack,
  onSave,
}: {
  pattern: Pattern;
  highlightCode: string | null;
  onHighlightCode: (code: string | null) => void;
  onToggleCell: (index: number) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const [row, setRow] = useState(0);
  const [hideCompleted, setHideCompleted] = useState(false);
  const total = pattern.cells.filter((cell) => cell !== null).length;
  const done = pattern.progress.filter((value, index) => value && pattern.cells[index] !== null).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const highlightRows = useMemo(() => new Set([row]), [row]);
  const rows = useMemo(() => usageRows(pattern), [pattern]);
  const remaining = useMemo(() => {
    const counts = new Map<string, number>();
    pattern.cells.forEach((code, index) => {
      if (code && !pattern.progress[index]) counts.set(code, (counts.get(code) ?? 0) + 1);
    });
    return counts;
  }, [pattern]);

  return (
    <div className="guide">
      <section className="panel">
        <div className="panel-head">
          <h2>拼装引导 · {pattern.name}</h2>
          <button className="btn small ghost" onClick={onBack}><ArrowLeft size={14} /> 返回工作台</button>
        </div>
        <div className="guide-controls">
          <button className="btn small" onClick={() => setRow((value) => Math.max(0, value - 1))} disabled={row === 0}><ChevronLeft size={14} /> 上一行</button>
          <span className="guide-progress">第 {row + 1} / {pattern.h} 行</span>
          <button className="btn small" onClick={() => setRow((value) => Math.min(pattern.h - 1, value + 1))} disabled={row === pattern.h - 1}>下一行 <ChevronRight size={14} /></button>
          <span className="spacer" />
          <button className="btn small ghost" onClick={onSave}><Save size={14} /> 保存进度</button>
        </div>
        <div className="tool-row">
          <span className="guide-progress">{done} / {total} 颗已完成 · {percent}%</span>
        </div>
        <div className="progress-line">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
        </div>
        <div className="tool-row">
          <div style={{ width: '100%' }}>
            <Toggle
              label="隐藏已完成行"
              hint="只高亮还没拼完的行"
              checked={hideCompleted}
              onChange={setHideCompleted}
            />
          </div>
        </div>
        <div className="tool-row">
          <div className="color-picker-block">
            <span className="eyebrow">按色号高亮 · 一种一种颜色拼</span>
            <div className="color-chip-row">
              <button
                className={`btn small${highlightCode === null ? ' primary' : ' ghost'}`}
                onClick={() => onHighlightCode(null)}
              >
                全部颜色
              </button>
              {rows.map((item) => (
                <button
                  type="button"
                  className={`color-option${highlightCode === item.code ? ' selected' : ''}`}
                  key={item.code}
                  aria-pressed={highlightCode === item.code}
                  title={`${item.name} · 共 ${item.count} 颗`}
                  onClick={() => onHighlightCode(highlightCode === item.code ? null : item.code)}
                >
                  <span className="color-swatch" style={{ background: item.hex }} />
                  <span>{item.code}</span>
                  <span className="chip-remain">剩 {remaining.get(item.code) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <ChartViewport
          pattern={pattern}
          interactive
          onCell={onToggleCell}
          progress={pattern.progress}
          highlightRows={highlightRows}
          completedOnly={hideCompleted}
          highlightCode={highlightCode}
        />
        <div className="tool-row">
          <Notice>点击格子标记完成/取消；选一个色号可只看这一种颜色，拼完再换下一个。进度随图纸一起保存在本地，登录后会同步到云端。</Notice>
        </div>
        <div className="tool-row">
          <span className="eyebrow"><Check size={12} /> 深色覆盖 = 已完成</span>
          <span className="eyebrow"><EyeOff size={12} /> 空格 = 不放豆</span>
        </div>
      </section>
    </div>
  );
}
