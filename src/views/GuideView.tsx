import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, EyeOff, Save } from 'lucide-react';
import ChartViewport from '../components/ChartViewport';
import { Notice, Toggle } from '../components/ui';
import { boardLabel, splitBoards } from '../core/boards';
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
  const [board, setBoard] = useState(0);
  const [onlyBoard, setOnlyBoard] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const total = pattern.cells.filter((cell) => cell !== null).length;
  const done = pattern.progress.filter((value, index) => value && pattern.cells[index] !== null).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const rows = useMemo(() => usageRows(pattern), [pattern]);
  const boards = useMemo(() => splitBoards(pattern.cells, pattern.w, pattern.h), [pattern]);
  const activeIndex = Math.min(board, boards.length - 1);
  const activeBoard = boards[activeIndex];
  const focusBoard = useMemo(
    () => ({ r0: activeBoard.r0, r1: activeBoard.r1, c0: activeBoard.c0, c1: activeBoard.c1 }),
    [activeBoard],
  );
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

        <div className="tool-row">
          <span className="guide-progress">{done} / {total} 颗已完成 · {percent}%</span>
        </div>
        <div className="progress-line">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
        </div>

        <div className="tool-row">
          <div className="color-picker-block">
            <span className="eyebrow">1 · 选一个色号，把这种颜色全部拼完</span>
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

        <div className="guide-controls">
          {boards.length > 1 ? (
            <>
              <button
                className="btn small"
                onClick={() => setBoard((value) => Math.max(0, value - 1))}
                disabled={activeIndex === 0}
              >
                <ChevronLeft size={14} /> 上一板
              </button>
              <span className="guide-progress">2 · 第 {activeIndex + 1} / {boards.length} 板 · {boardLabel(activeBoard)}</span>
              <button
                className="btn small"
                onClick={() => setBoard((value) => Math.min(boards.length - 1, value + 1))}
                disabled={activeIndex === boards.length - 1}
              >
                下一板 <ChevronRight size={14} />
              </button>
            </>
          ) : (
            <span className="guide-progress">2 · 单块 29×29 板 · {boardLabel(activeBoard)}</span>
          )}
          <span className="spacer" />
          <button className="btn small ghost" onClick={onSave}><Save size={14} /> 保存进度</button>
        </div>

        <div className="tool-row">
          <div style={{ width: '100%' }}>
            <Toggle
              label="只看当前板"
              hint="淡化其它板，配合板切换一次专注一块"
              checked={onlyBoard}
              onChange={setOnlyBoard}
              disabled={boards.length <= 1}
            />
          </div>
        </div>
        <div className="tool-row">
          <div style={{ width: '100%' }}>
            <Toggle
              label="隐藏已完成"
              hint="拼过的格子淡出，只看还没拼的"
              checked={hideCompleted}
              onChange={setHideCompleted}
            />
          </div>
        </div>

        <ChartViewport
          pattern={pattern}
          interactive
          onCell={onToggleCell}
          progress={pattern.progress}
          highlightCode={highlightCode}
          focusBoard={focusBoard}
          dimOutsideBoard={onlyBoard}
          hideCompleted={hideCompleted}
        />
        <div className="tool-row">
          <Notice>点格子标记完成/取消；选一个色号只高亮这一种颜色，拼完再换下一个。进度随图纸保存在本地，登录后会同步到云端。</Notice>
        </div>
        <div className="tool-row">
          <span className="eyebrow"><Check size={12} /> 深色覆盖 = 已完成</span>
          <span className="eyebrow"><EyeOff size={12} /> 空格 = 不放豆</span>
        </div>
      </section>
    </div>
  );
}
