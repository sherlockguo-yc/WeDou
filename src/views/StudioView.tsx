import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  Brush,
  Download,
  Eraser,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  LayoutGrid,
  Package,
  Pipette,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react';
import ChartCanvas from '../components/ChartCanvas';
import EquivalentPanel from '../components/EquivalentPanel';
import UsageTable from '../components/UsageTable';
import { ColorSearch, Notice, Toggle } from '../components/ui';
import { PALETTES, getPalette } from '../core/palettes';
import { patternStats } from '../core/stats';
import type { SegmentProgress } from '../core/segment';
import type { BeadSize, ConvertParams, Pattern } from '../core/types';

export type Tool = 'brush' | 'eraser' | 'picker';

export interface StudioProps {
  status: string;
  hasSource: boolean;
  sourceUrl: string;
  sourceName: string;
  pattern: Pattern | null;
  params: ConvertParams;
  paletteId: string;
  beadSize: BeadSize;
  segment: SegmentProgress | null;
  canUndo: boolean;
  canRedo: boolean;
  tool: Tool;
  activeCode: string;
  onFile: (file: File) => void;
  onParam: (patch: Partial<ConvertParams>) => void;
  onPalette: (id: string) => void;
  onBeadSize: (size: BeadSize) => void;
  onRegenerate: () => void;
  onSegment: () => void;
  onTool: (tool: Tool) => void;
  onActiveCode: (code: string) => void;
  onPaint: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onOpenGuide: () => void;
  onSave: () => void;
}

export default function StudioView(props: StudioProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = props.status === 'loading' || props.status === 'exporting' || Boolean(props.segment);
  const stats = props.pattern ? patternStats(props.pattern) : null;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) props.onFile(file);
  };

  return (
    <div className="studio">
      <div className="studio-side">
        <section className="panel">
          <div className="panel-head">
            <h2>1 · 放一张图</h2>
            <Upload size={16} />
          </div>
          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <ImageIcon size={30} />
            <p>拖拽图片到这里</p>
            <div className="dropzone-note">也支持点击选择或 Ctrl/Cmd + V 粘贴</div>
            <button className="btn small" onClick={() => fileRef.current?.click()}>选择图片</button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) props.onFile(file);
                event.target.value = '';
              }}
            />
          </div>

          {props.hasSource ? (
            <div className="thumb-strip">
              {props.sourceUrl ? (
                <img
                  className="thumb"
                  src={props.sourceUrl}
                  alt="原图预览"
                  data-fb={'<span class="thumb-fallback">?</span>'}
                  onError={(event) => {
                    event.currentTarget.outerHTML = event.currentTarget.dataset.fb ?? '';
                  }}
                />
              ) : (
                <span className="thumb-fallback">?</span>
              )}
              <span className="thumb-name">{props.sourceName}</span>
              <button className="btn small ghost" onClick={props.onSegment} disabled={busy} title="浏览器内 AI 去背景">
                <Wand2 size={14} /> 智能去背景
              </button>
            </div>
          ) : null}

          {props.segment ? (
            <div className="progress-line">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round(props.segment.ratio * 100)}%` }} />
              </div>
              <span className="progress-text">{props.segment.message}</span>
            </div>
          ) : null}

          <div style={{ marginTop: 'var(--s2)' }}>
            <Notice>图片只在浏览器里处理，不会上传；云端只保存图纸数据。色卡 HEX 是公开参考值，不同批次实物会有色差，请按色号买豆。</Notice>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>2 · 选你手里的豆</h2>
            <Package size={16} />
          </div>
          <div className="field">
            <label>品牌色板</label>
            <div className="radio-group">
              {PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  className={props.paletteId === palette.id ? 'selected' : ''}
                  onClick={() => props.onPalette(palette.id)}
                  title={`${palette.colors.length} 色`}
                >
                  {palette.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>豆子规格</label>
            <div className="radio-group">
              {(['5mm', '2.6mm'] as BeadSize[]).map((size) => (
                <button
                  key={size}
                  className={props.beadSize === size ? 'selected' : ''}
                  onClick={() => props.onBeadSize(size)}
                >
                  {size === '5mm' ? '5mm 标准豆' : '2.6mm 迷你豆'}
                </button>
              ))}
            </div>
          </div>
          <Notice>先按实际拥有的套装选色板再生成。色号是买豆依据，屏幕颜色仅供参考。</Notice>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>3 · 定图纸</h2>
            <Grid2X2 size={16} />
          </div>
          <div className="field-row field">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>宽（格）</label>
              <input
                className="input"
                type="number"
                min={1}
                max={200}
                value={props.params.width}
                onChange={(event) => props.onParam({ width: Math.max(1, Math.min(200, Number(event.target.value) || 1)) })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>高（格）</label>
              <input
                className="input"
                type="number"
                min={1}
                max={200}
                value={props.params.height}
                onChange={(event) => props.onParam({ height: Math.max(1, Math.min(200, Number(event.target.value) || 1)) })}
              />
            </div>
          </div>
          <div className="field">
            <label>最多颜色数：{props.params.maxColors}</label>
            <input
              className="input"
              type="range"
              min={2}
              max={48}
              value={props.params.maxColors}
              onChange={(event) => props.onParam({ maxColors: Number(event.target.value) })}
            />
          </div>
          <Toggle label="透明区留空" hint="不放豆，不等于白色" checked={props.params.transparentAsEmpty} onChange={(value) => props.onParam({ transparentAsEmpty: value })} />
          <Toggle label="去掉孤立单颗豆" hint="减少难拼的杂点" checked={props.params.removeIsolated} onChange={(value) => props.onParam({ removeIsolated: value })} />
          <Toggle label="合并小色块" checked={props.params.mergeSmallRegions} onChange={(value) => props.onParam({ mergeSmallRegions: value })} />
          <Toggle label="色彩抖动" hint="渐变更细腻，但会产生更多杂点" checked={props.params.dithering} onChange={(value) => props.onParam({ dithering: value })} />
          <button className="btn primary" style={{ width: '100%', marginTop: 'var(--s2)' }} onClick={props.onRegenerate} disabled={!props.hasSource || busy}>
            <RotateCcw size={15} /> 重新生成
          </button>
        </section>
      </div>

      <div className="studio-main">
        {!props.pattern ? (
          <section className="panel">
            <div className="empty-state">
              <LayoutGrid size={40} />
              <h2>图纸会在这里长出来</h2>
              <p>先放一张图，选好色板和尺寸，就能得到带色号、坐标和用量的施工图。</p>
            </div>
          </section>
        ) : (
          <>
            <section className="panel">
              <div className="panel-head">
                <h2>图纸预览</h2>
                <span className="eyebrow">{getPalette(props.paletteId).name} · {props.pattern.w}×{props.pattern.h}</span>
              </div>
              <div className="preview-bar">
                <div className="stat-row">
                  <div className="stat"><span className="stat-value">{stats?.totalBeads}</span><span className="stat-label">总豆数</span></div>
                  <div className="stat"><span className="stat-value">{stats?.colorCount}</span><span className="stat-label">色号数</span></div>
                  <div className="stat"><span className="stat-value">{stats?.boards}</span><span className="stat-label">拼豆板</span></div>
                  <div className="stat"><span className="stat-value">{stats?.size}</span><span className="stat-label">成品</span></div>
                </div>
                <span className="eyebrow">{props.status === 'loading' ? '转换中…' : props.status === 'exporting' ? '导出中…' : '实时预览'}</span>
              </div>
              <div className="canvas-scroll">
                <ChartCanvas
                  pattern={props.pattern}
                  cell={props.pattern.w > 60 ? 10 : props.pattern.w > 40 ? 14 : 20}
                  interactive
                  onCell={props.onPaint}
                />
              </div>
              <div className="tool-row">
                <button className={`btn small${props.tool === 'brush' ? ' primary' : ''}`} onClick={() => props.onTool('brush')} title="刷色"><Brush size={14} /> 刷色</button>
                <button className={`btn small${props.tool === 'eraser' ? ' primary' : ''}`} onClick={() => props.onTool('eraser')} title="橡皮（留空）"><Eraser size={14} /> 留空</button>
                <button className={`btn small${props.tool === 'picker' ? ' primary' : ''}`} onClick={() => props.onTool('picker')} title="吸管取色"><Pipette size={14} /> 吸管</button>
                <span className="spacer" />
                <button className="btn small ghost" onClick={props.onUndo} disabled={!props.canUndo}><Undo2 size={14} /> 撤销</button>
                <button className="btn small ghost" onClick={props.onRedo} disabled={!props.canRedo}><Redo2 size={14} /> 重做</button>
              </div>
              <div className="tool-row">
                <span className="eyebrow">当前色号 {props.activeCode}</span>
              </div>
              <ColorSearch paletteId={props.paletteId} value={props.activeCode} onChange={props.onActiveCode} />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>备豆清单</h2>
                <span className="eyebrow">按颗数从多到少</span>
              </div>
              <UsageTable pattern={props.pattern} />
              <EquivalentPanel paletteId={props.paletteId} code={props.activeCode} />
              <div className="tool-row">
                <button className="btn primary" onClick={props.onExportPdf} disabled={busy}><FileText size={15} /> A4 分板 PDF</button>
                <button className="btn" onClick={props.onExportPng} disabled={busy}><Download size={15} /> 高清 PNG</button>
                <button className="btn ghost" onClick={props.onExportJson} disabled={busy}><Download size={15} /> 工程文件</button>
                <span className="spacer" />
                <button className="btn warm" onClick={props.onOpenGuide} disabled={busy}><LayoutGrid size={15} /> 开始拼</button>
                <button className="btn ghost" onClick={props.onSave} disabled={busy}><Save size={15} /> 保存图纸</button>
              </div>
              <div style={{ marginTop: 'var(--s2)' }}>
                <Notice>空格 = 不放豆。格内符号用于灰度打印时区分相近色；请以色号为准，不要按屏幕颜色配豆。</Notice>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
