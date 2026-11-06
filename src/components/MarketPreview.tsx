import { useEffect, useMemo, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { MarketItem } from '../api/client';
import { getPalette } from '../core/palettes';
import { renderGridPreview } from '../render/thumbnail';

/** Read-only large preview so visitors can judge a chart before saving it. */
export default function MarketPreview({ item }: { item: MarketItem }) {
  const [fullscreen, setFullscreen] = useState(false);
  const src = useMemo(
    () => renderGridPreview(item.cells, item.w, item.h, item.paletteId) || item.thumb || '',
    [item],
  );

  useEffect(() => {
    setFullscreen(false);
  }, [item.id]);

  useEffect(() => {
    if (!fullscreen) return;
    // Capture phase keeps Escape from also closing the parent detail dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen]);

  return (
    <div className="market-preview">
      <div className="market-preview-stage">
        {src ? (
          <img className="pattern-thumb" src={src} alt={`${item.name} 大图预览`} />
        ) : (
          <div className="pattern-thumb is-empty">暂无预览</div>
        )}
        <button className="btn small" onClick={() => setFullscreen(true)} disabled={!src}>
          <Maximize2 size={14} /> 放大查看
        </button>
      </div>
      <p className="eyebrow">按真实色号渲染的纯色块预览；保存到图纸仓库后可查看带色号与坐标的完整施工图。</p>

      {fullscreen && src ? (
        <div
          className="preview-overlay"
          onMouseDown={() => setFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${item.name} 全屏预览`}
        >
          <div className="preview-overlay-bar" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">{item.name} · {item.w}×{item.h} 格 · {getPalette(item.paletteId).name}</span>
            <button className="btn small" onClick={() => setFullscreen(false)}><X size={14} /> 关闭（Esc）</button>
          </div>
          <div className="preview-overlay-stage" onMouseDown={(event) => event.stopPropagation()}>
            <img className="pattern-thumb" src={src} alt={`${item.name} 全屏预览`} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
