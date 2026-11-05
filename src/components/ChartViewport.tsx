import { useEffect, useState } from 'react';
import { Grid2X2, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import ChartCanvas from './ChartCanvas';
import type { Pattern } from '../core/types';

const CELL_STEPS = [8, 12, 16, 22, 30, 42];

function defaultCell(w: number): number {
  if (w <= 29) return 22;
  if (w <= 60) return 16;
  if (w <= 120) return 12;
  return 8;
}

export interface ChartViewportProps {
  pattern: Pattern;
  onCell?: (index: number) => void;
  progress?: boolean[];
  highlightRows?: Set<number>;
  completedOnly?: boolean;
  highlightCode?: string | null;
  interactive?: boolean;
}

/** Shared chart viewport: native-size scrolling plus zoom, fit-to-window and fullscreen. */
export default function ChartViewport({
  pattern,
  onCell,
  progress,
  highlightRows,
  completedOnly,
  highlightCode,
  interactive,
}: ChartViewportProps) {
  const [cell, setCell] = useState(() => defaultCell(pattern.w));
  const [fit, setFit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setCell(defaultCell(pattern.w));
  }, [pattern.w]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const zoom = (direction: -1 | 1) => {
    const current = CELL_STEPS.indexOf(cell);
    const base = current >= 0 ? current : CELL_STEPS.findIndex((step) => step >= cell);
    const next = Math.max(0, Math.min(CELL_STEPS.length - 1, base + direction));
    setFit(false);
    setCell(CELL_STEPS[next]);
  };

  return (
    <div className={`chart-viewport${fullscreen ? ' is-fullscreen' : ''}`}>
      <div className="viewport-bar">
        <span className="eyebrow">
          {pattern.w}×{pattern.h} · 共 {pattern.w * pattern.h} 格 · 可滚动查看
          {cell < 14 && !fit ? ' · 当前格子过小，放大后可看格内符号' : ''}
        </span>
        <div className="viewport-tools">
          <button className="btn small ghost" onClick={() => zoom(-1)} disabled={!fit && cell === CELL_STEPS[0]} title="缩小">
            <ZoomOut size={14} />
          </button>
          <span className="viewport-scale mono">{fit ? '适应窗口' : `${cell}px/格`}</span>
          <button className="btn small ghost" onClick={() => zoom(1)} disabled={!fit && cell === CELL_STEPS[CELL_STEPS.length - 1]} title="放大">
            <ZoomIn size={14} />
          </button>
          <button className={`btn small${fit ? ' primary' : ' ghost'}`} onClick={() => setFit((value) => !value)} title="缩放到一屏看全图">
            <Grid2X2 size={14} /> 适应窗口
          </button>
          <button className="btn small ghost" onClick={() => setFullscreen((value) => !value)} title={fullscreen ? '退出全屏（Esc）' : '全屏查看'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {fullscreen ? '退出全屏' : '全屏'}
          </button>
        </div>
      </div>
      <div className={`canvas-scroll${fit ? ' is-fit' : ''}`}>
        <ChartCanvas
          pattern={pattern}
          cell={cell}
          interactive={interactive}
          onCell={onCell}
          progress={progress}
          highlightRows={highlightRows}
          completedOnly={completedOnly}
          highlightCode={highlightCode}
        />
      </div>
    </div>
  );
}
