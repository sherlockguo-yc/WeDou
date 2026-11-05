import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { cellFromPoint, drawGrid } from '../render/grid';
import type { Pattern } from '../core/types';

export interface ChartCanvasProps {
  pattern: Pattern;
  cell: number;
  onCell?: (index: number) => void;
  progress?: boolean[];
  highlightRows?: Set<number>;
  completedOnly?: boolean;
  highlightCode?: string | null;
  interactive?: boolean;
}

export default function ChartCanvas({
  pattern,
  cell,
  onCell,
  progress,
  highlightRows,
  completedOnly,
  highlightCode,
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
      highlightRows,
      completedOnly,
      highlightCode,
    });
  }, [pattern, cell, progress, highlightRows, completedOnly, highlightCode]);

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
