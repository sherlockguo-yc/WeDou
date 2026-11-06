import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowRightLeft,
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
import ChartViewport from '../components/ChartViewport';
import EquivalentPanel from '../components/EquivalentPanel';
import UsageTable from '../components/UsageTable';
import { ColorSearch, Modal, Notice, Toggle } from '../components/ui';
import { PALETTES, getPalette } from '../core/palettes';
import { patternStats } from '../core/stats';
import type { SegmentProgress } from '../core/segment';
import { DEFAULT_BACKGROUND_TOLERANCE } from '../core/types';
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
  segmentApplied: boolean;
  approximated: number;
  generated: boolean;
  ratioLabel: string;
  lockRatio: boolean;
  onLockRatio: (value: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  tool: Tool;
  activeCode: string;
  highlightCode: string | null;
  onHighlightCode: (code: string | null) => void;
  onFile: (file: File) => void;
  onParam: (patch: Partial<ConvertParams>) => void;
  onPalette: (id: string) => void;
  onBeadSize: (size: BeadSize) => void;
  onRegenerate: () => void;
  onSegment: () => void;
  onRevertSegment: () => void;
  onTool: (tool: Tool) => void;
  onActiveCode: (code: string) => void;
  onPaint: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportPdf: () => void;
  onExportPdfRange: (from: number, to: number) => void;
  onReplaceCode: (from: string, to: string | null) => void;
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
  const boards = stats?.boards ?? 1;
  const source = props.highlightCode;
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState('');
  const [pdfFrom, setPdfFrom] = useState(1);
  const [pdfTo, setPdfTo] = useState(1);

  useEffect(() => {
    setPdfFrom(1);
    setPdfTo(boards);
  }, [boards]);

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

          {props.segmentApplied ? (
            <div className="segment-state">
              <span className="eyebrow"><Wand2 size={12} /> 已应用智能去背景</span>
              <button className="btn small" onClick={props.onRevertSegment} disabled={busy} title="丢弃抠图效果，恢复上传时的原图">
                <RotateCcw size={14} /> 恢复原图
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
          {props.hasSource && props.ratioLabel ? (
            <div className="eyebrow" style={{ marginBottom: 'var(--s2)' }}>
              原图比例 {props.ratioLabel} · 推荐 {props.params.width}×{props.params.height} 格（约 841 颗豆，与 29×29 相当）
            </div>
          ) : null}
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
          <Toggle
            label="锁定原图比例"
            hint="改宽或高时另一边自动联动"
            checked={props.lockRatio}
            onChange={props.onLockRatio}
            disabled={!props.ratioLabel}
          />
          <Toggle label="透明区留空" hint="不放豆，不等于白色" checked={props.params.transparentAsEmpty} onChange={(value) => props.onParam({ transparentAsEmpty: value })} />
          <Toggle
            label="自动抠纯色背景"
            hint="只删四角同色、且连到画面边缘的背景；渐变与主体内部不会误删"
            checked={props.params.backgroundTolerance > 0}
            onChange={(value) => props.onParam({ backgroundTolerance: value ? DEFAULT_BACKGROUND_TOLERANCE : 0 })}
          />
          <Toggle label="去掉孤立单颗豆" hint="减少难拼的杂点" checked={props.params.removeIsolated} onChange={(value) => props.onParam({ removeIsolated: value })} />
          <Toggle label="合并小色块" checked={props.params.mergeSmallRegions} onChange={(value) => props.onParam({ mergeSmallRegions: value })} />
          <Toggle
            label="保留细线细节"
            hint="眼睛、发丝、描边这类面积小但对比强的部分优先保留；照片噪点多时可关掉"
            checked={props.params.detailPreserve !== false}
            onChange={(value) => props.onParam({ detailPreserve: value })}
          />
          <Toggle label="色彩抖动" hint="渐变更细腻，但会产生更多杂点" checked={props.params.dithering} onChange={(value) => props.onParam({ dithering: value })} />
          <Toggle
            label="排除特效豆"
            hint="温变 / 光变 / 珠光 / 果冻 / 夜光 / 透明色号不参与自动选色；关掉后仍可手动选这些色号"
            checked={props.params.excludeSpecial !== false}
            onChange={(value) => props.onParam({ excludeSpecial: value })}
          />
          <button className="btn primary" style={{ width: '100%', marginTop: 'var(--s2)' }} onClick={props.onRegenerate} disabled={!props.hasSource || busy}>
            {props.generated ? <RotateCcw size={15} /> : <LayoutGrid size={15} />}
            {props.generated ? '重新生成' : '生成图纸'}
          </button>
        </section>
      </div>

      <div className="studio-main">
        {!props.pattern ? (
          <section className="panel">
            {props.hasSource ? (
              <div className="empty-state">
                <ImageIcon size={40} />
                <h2>原图已就绪，等你确认</h2>
                <p>
                  检测到{props.ratioLabel}的比例，按原比例推荐 {props.params.width}×{props.params.height} 格。
                  选好色板与参数后，点下面的按钮生成图纸。
                </p>
                {props.sourceUrl ? (
                  <img
                    className="pending-preview"
                    src={props.sourceUrl}
                    alt="待生成的原图"
                    data-fb={'<span class="thumb-fallback">?</span>'}
                    onError={(event) => {
                      event.currentTarget.outerHTML = event.currentTarget.dataset.fb ?? '';
                    }}
                  />
                ) : null}
                <button className="btn primary" onClick={props.onRegenerate} disabled={busy}>
                  <LayoutGrid size={16} /> 生成图纸
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <LayoutGrid size={40} />
                <h2>图纸会在这里长出来</h2>
                <p>先放一张图，确认推荐的尺寸与色板，再点「生成图纸」得到带色号、坐标和用量的施工图。</p>
              </div>
            )}
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
              {props.approximated > 0 ? (
                <div style={{ marginBottom: 'var(--s2)' }}>
                  <Notice>
                    有 {props.approximated} 格与色板颜色差异较大（ΔE &gt; 10），属于近似替代。建议放大核对该处色号，或换一套更接近的色板。
                  </Notice>
                </div>
              ) : null}
              <ChartViewport pattern={props.pattern} interactive onCell={props.onPaint} highlightCode={props.highlightCode} />
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
                <span className="eyebrow">按颗数从多到少 · 点色号只看这一种颜色</span>
              </div>
              <UsageTable
                pattern={props.pattern}
                selectedCode={props.highlightCode}
                onSelect={props.onHighlightCode}
              />
              <div className="tool-row">
                <button className="btn small ghost" disabled={!source} onClick={() => setReplaceOpen(true)}>
                  <ArrowRightLeft size={14} /> 区域换色
                </button>
                <span className="eyebrow">{source ? `把选中的 ${source} 全部换成另一色号` : '先点上面某个色号'}</span>
              </div>
              <EquivalentPanel paletteId={props.paletteId} code={props.activeCode} />
              <div className="tool-row">
                <button className="btn primary" onClick={props.onExportPdf} disabled={busy}><FileText size={15} /> A4 分板 PDF</button>
                <button className="btn" onClick={props.onExportPng} disabled={busy}><Download size={15} /> 高清 PNG</button>
                <button className="btn ghost" onClick={props.onExportJson} disabled={busy}><Download size={15} /> 工程文件</button>
                <span className="spacer" />
                <button className="btn warm" onClick={props.onOpenGuide} disabled={busy}><LayoutGrid size={15} /> 开始拼</button>
                <button className="btn ghost" onClick={props.onSave} disabled={busy}><Save size={15} /> 保存图纸</button>
              </div>
              {boards > 12 ? (
                <div style={{ marginTop: 'var(--s2)' }}>
                  <Notice>共 {boards} 块 29×29 板，PDF 会导出 {boards} 页；可只导出一段分批打印。</Notice>
                </div>
              ) : null}
              {boards > 1 ? (
                <div className="tool-row">
                  <span className="eyebrow">分批导出第</span>
                  <input
                    className="input mono"
                    type="number"
                    min={1}
                    max={boards}
                    value={pdfFrom}
                    aria-label="起始板号"
                    style={{ width: '5em' }}
                    onChange={(event) => setPdfFrom(Number(event.target.value))}
                  />
                  <span className="eyebrow">至</span>
                  <input
                    className="input mono"
                    type="number"
                    min={1}
                    max={boards}
                    value={pdfTo}
                    aria-label="结束板号"
                    style={{ width: '5em' }}
                    onChange={(event) => setPdfTo(Number(event.target.value))}
                  />
                  <span className="eyebrow">板</span>
                  <button className="btn small ghost" disabled={busy} onClick={() => props.onExportPdfRange(pdfFrom, pdfTo)}>
                    <FileText size={14} /> 导出所选板
                  </button>
                </div>
              ) : null}
              <div style={{ marginTop: 'var(--s2)' }}>
                <Notice>空格 = 不放豆。格内符号用于灰度打印时区分相近色；请以色号为准，不要按屏幕颜色配豆。</Notice>
              </div>
            </section>
          </>
        )}
      </div>
      {replaceOpen && source ? (
        <Modal title={`替换色号 ${source}`} onClose={() => setReplaceOpen(false)}>
          <p>把图纸里所有 <span className="mono">{source}</span> 一次性换成另一种颜色，或直接留空；替换后可用「撤销」一次还原。</p>
          <div className="tool-row">
            <button
              className="btn small ghost"
              onClick={() => {
                props.onReplaceCode(source, null);
                setReplaceOpen(false);
              }}
            >
              全部留空（不放豆）
            </button>
            <span className="eyebrow">或选一个色号替换</span>
          </div>
          <ColorSearch paletteId={props.paletteId} value={replaceTarget} onChange={setReplaceTarget} />
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setReplaceOpen(false)}>取消</button>
            <button
              className="btn primary"
              disabled={!replaceTarget || replaceTarget === source}
              onClick={() => {
                props.onReplaceCode(source, replaceTarget);
                setReplaceOpen(false);
              }}
            >
              确认替换
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
