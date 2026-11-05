import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { cellFromPoint, drawGrid } from '../render/grid';
import type { BoardRect } from '../render/grid';
import type { Pattern } from '../core/types';

export interface ChartCanvasProps {
  pattern: Pattern;
  cell: number;
  onCell?: (index: number) => void;
  progress?: boolean[];
  hideCompleted?: boolean;
  highlightCode?: string | null;
  focusBoard?: BoardRect | null;
  dimOutsideBoard?: boolean;
  interactive?: boolean;
}

export default function ChartCanvas({
  pattern,
  cell,
  onCell,
  progress,
  hideCompleted,
  highlightCode,
  focusBoard,
  dimOutsideBoard,
  interactive,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawGrid(ctx, pattern, {
      cell,
      showCodes: true,
      showCoordinates: true,
      progress,
      hideCompleted,
      highlightCode,
      focusBoard,
      dimOutsideBoard,
    });
  }, [pattern, cell, progress, hideCompleted, highlightCode, focusBoard, dimOutsideBoard]);

  const handle = (event: PointerEvent<HTMLCanvasElement>, started: boolean) => {
    if (!onCell || !interactive) return;
    if (started) dragging.current = true;
    if (!dragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const index = cellFromPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), pattern, cell);
    if (index !== null) onCell(index);
  };

  return (
    <canvas
      ref={canvasRef}
      className={`chart-canvas${interactive ? ' tool-active' : ''}`}
      onPointerDown={(event) => {
        event.preventDefault();
        handle(event, true);
      }}
      onPointerMove={(event) => handle(event, false)}
      onPointerUp={() => { dragging.current = false; }}
      onPointerLeave={() => { dragging.current = false; }}
      aria-label="拼豆图纸网格"
    />
  );
}
