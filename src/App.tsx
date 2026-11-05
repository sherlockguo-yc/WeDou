import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid2X2, HardDrive, LayoutGrid, LogIn, LogOut, Package, Wrench } from 'lucide-react';
import { api } from './api/client';
import type { User } from './api/client';
import AuthModal from './views/AuthModal';
import GuideView from './views/GuideView';
import LibraryView from './views/LibraryView';
import StudioView from './views/StudioView';
import type { Tool } from './views/StudioView';
import { ConfirmModal, Toast } from './components/ui';
import { recommendGridSize } from './core/boards';
import { quantizeImage } from './core/convert';
import { optimizeGrid } from './core/optimize';
import { createPattern, parsePattern, replaceCode as replaceCodeCells, serialize, touch } from './core/pattern';
import { DEFAULT_PALETTE_ID, getPalette } from './core/palettes';
import {
  isTogglePatch,
  preferencesFromParams,
  readTogglePreferences,
  withTogglePreferences,
  writeTogglePreferences,
} from './core/preferences';
import { removeBackground } from './core/segment';
import type { SegmentProgress } from './core/segment';
import { DEFAULT_PARAMS } from './core/types';
import type { BeadSize, ConvertParams, Pattern } from './core/types';
import { downloadCanvas, renderPatternPng } from './render/png';
import { exportPatternPdf } from './render/pdf';

type View = 'studio' | 'guide' | 'library';
type Status = 'empty' | 'loading' | 'ready' | 'exporting' | 'error';
type ToastState = { message: string; kind: 'info' | 'error' } | null;
type ConfirmState = { message: string; onConfirm: () => void } | null;
type History = { past: Pattern[]; future: Pattern[] };

const DRAFTS_KEY = 'wedou.drafts';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 4000;

/** GitHub Pages builds have no Express backend; every feature still works locally. */
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === '1';

function readDrafts(): Pattern[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value as Pattern[]) : [];
  } catch {
    return [];
  }
}

/** Restores remembered switches once, at page load; sizes still come from the image. */
function initialStudioState(): { params: ConvertParams; lockRatio: boolean } {
  const preferences = readTogglePreferences();
  return {
    params: withTogglePreferences(DEFAULT_PARAMS, preferences),
    lockRatio: preferences.lockRatio,
  };
}

function upsertDraft(pattern: Pattern): Pattern[] {
  const drafts = readDrafts().filter((item) => item.id !== pattern.id);
  const next = [pattern, ...drafts].slice(0, 60);
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded: the in-memory copy still works for this session.
  }
  return next;
}

function mergedLibrary(drafts: Pattern[], cloud: Pattern[]): Pattern[] {
  const map = new Map<string, Pattern>();
  for (const pattern of drafts) map.set(pattern.id, pattern);
  for (const pattern of cloud) {
    const local = map.get(pattern.id);
    map.set(
      pattern.id,
      local && Date.parse(local.updatedAt) > Date.parse(pattern.updatedAt) ? local : pattern,
    );
  }
  return [...map.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function filename(pattern: Pattern): string {
  return (pattern.name || 'bead-chart').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describeRatio(ratio: number): string {
  return ratio >= 1 ? `约 ${ratio.toFixed(2)} : 1` : `约 1 : ${(1 / ratio).toFixed(2)}`;
}

export default function App() {
  const [view, setView] = useState<View>('studio');
  const [status, setStatus] = useState<Status>('empty');
  const [source, setSource] = useState<ImageData | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [originalSource, setOriginalSource] = useState<ImageData | null>(null);
  const [segmentApplied, setSegmentApplied] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [initial] = useState(initialStudioState);
  const [params, setParams] = useState<ConvertParams>(initial.params);
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);
  const [beadSize, setBeadSize] = useState<BeadSize>('5mm');
  const [tool, setTool] = useState<Tool>('brush');
  const [activeCode, setActiveCode] = useState(getPalette(DEFAULT_PALETTE_ID).colors[0].code);
  const [approximated, setApproximated] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [sourceRatio, setSourceRatio] = useState<number | null>(null);
  const [lockRatio, setLockRatio] = useState(initial.lockRatio);
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const [dirty, setDirty] = useState(false);
  const [segment, setSegment] = useState<SegmentProgress | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cloud, setCloud] = useState<Pattern[]>([]);
  const [drafts, setDrafts] = useState<Pattern[]>(readDrafts);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);

  useEffect(() => {
    if (highlightCode && (!pattern || !pattern.cells.includes(highlightCode))) {
      setHighlightCode(null);
    }
  }, [pattern, highlightCode]);

  const requestRef = useRef(0);
  const patternRef = useRef<Pattern | null>(null);
  const nameRef = useRef('');
  const objectUrlRef = useRef('');
  const lastPaintRef = useRef<number>(-1);
  patternRef.current = pattern;
  nameRef.current = sourceName;

  const notify = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const [backendAvailable, setBackendAvailable] = useState(!STATIC_MODE);

  useEffect(() => {
    if (STATIC_MODE) return;
    api.me()
      .then((result) => { setBackendAvailable(true); setUser(result.user); })
      .catch(() => { setBackendAvailable(false); setUser(null); });
  }, []);

  const refreshCloud = useCallback(async () => {
    try {
      const result = await api.listPatterns();
      setCloud(result.patterns);
    } catch {
      setCloud([]);
    }
  }, []);

  useEffect(() => {
    if (user) void refreshCloud();
    else setCloud([]);
  }, [user, refreshCloud]);

  /* ---------- conversion pipeline ---------- */
  useEffect(() => {
    // Uploading only stages the image; conversion waits for an explicit click.
    if (!source || !generated) return;
    const id = ++requestRef.current;
    setStatus('loading');
    const timer = window.setTimeout(() => {
      if (id !== requestRef.current) return;
      try {
        const w = params.width;
        const h = params.height;
        const quantized = quantizeImage(source, w, h, paletteId, params);
        const optimized = optimizeGrid(quantized.cells, w, h, paletteId, params);
        const previous = patternRef.current;
        const baseName = nameRef.current.replace(/\.[^.]+$/, '') || '未命名图纸';
        const next = createPattern({
          name: previous?.name ?? baseName,
          w,
          h,
          paletteId,
          beadSize,
          cells: optimized.cells,
          params,
        });
        if (previous && previous.w === w && previous.h === h && previous.paletteId === paletteId) {
          next.progress = previous.progress.slice(0, w * h);
        }
        setPattern(next);
        setApproximated(quantized.approximated);
        setStatus('ready');
        if (optimized.mergedCodes.length > 0) {
          notify(`已把 ${optimized.mergedCodes.length} 个稀有色号合并到最接近的常用色`);
        }
      } catch (error) {
        setStatus('error');
        notify(error instanceof Error ? error.message : '转换失败', 'error');
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [source, params, paletteId, beadSize, generated, notify]);

  /* ---------- image input ---------- */
  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件（PNG / JPG / WebP / GIF）', 'error');
      return;
    }
    setStatus('loading');
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      bitmap.close();

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;

      const ratio = width / height;
      const recommended = recommendGridSize(width, height);
      setSource(imageData);
      setOriginalSource(imageData);
      setSegmentApplied(false);
      setGenerated(false);
      setSourceRatio(ratio);
      setPattern(null);
      setApproximated(0);
      setSourceBlob(file);
      setSourceUrl(url);
      setSourceName(file.name);
      setParams((current) => ({ ...current, width: recommended.w, height: recommended.h }));
      setStatus('empty');
      setHistory({ past: [], future: [] });
      setDirty(false);
      setView('studio');
      const downscaled = file.size > MAX_IMAGE_BYTES || scale < 1 ? '（图片较大，已降采样）' : '';
      notify(
        `已载入${describeRatio(ratio)}的图片，按原比例推荐 ${recommended.w}×${recommended.h} 格${downscaled}；确认参数后点「生成图纸」`,
      );
    } catch (error) {
      setStatus('error');
      notify(error instanceof Error ? error.message : '图片读取失败', 'error');
    }
  }, [notify]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) void loadFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  /* ---------- config changes ---------- */
  /** Only explicit user switches are remembered; opening a saved pattern must not overwrite them. */
  const changeLockRatio = (value: boolean) => {
    setLockRatio(value);
    writeTogglePreferences(preferencesFromParams(params, value));
  };

  const applyConfig = (patch: { params?: Partial<ConvertParams>; paletteId?: string; beadSize?: BeadSize }) => {
    const paramsPatch = patch.params;
    if (paramsPatch) {
      if (isTogglePatch(paramsPatch)) {
        writeTogglePreferences(preferencesFromParams({ ...params, ...paramsPatch }, lockRatio));
      }
      setParams((current) => {
        const next = { ...current, ...paramsPatch };
        if (lockRatio && sourceRatio) {
          const clamp = (value: number) => Math.max(1, Math.min(200, Math.round(value)));
          if ('width' in paramsPatch) next.height = clamp(next.width / sourceRatio);
          else if ('height' in paramsPatch) next.width = clamp(next.height * sourceRatio);
        }
        return next;
      });
    }
    if (patch.paletteId) {
      setPaletteId(patch.paletteId);
      const colors = getPalette(patch.paletteId).colors;
      if (!colors.some((color) => color.code === activeCode)) setActiveCode(colors[0].code);
    }
    if (patch.beadSize) setBeadSize(patch.beadSize);
  };

  const changeConfig = (patch: { params?: Partial<ConvertParams>; paletteId?: string; beadSize?: BeadSize }) => {
    if (dirty) {
      setConfirm({
        message: '这会重新生成图纸并覆盖你的手工修改，要继续吗？',
        onConfirm: () => {
          setDirty(false);
          setHistory({ past: [], future: [] });
          applyConfig(patch);
          setConfirm(null);
        },
      });
    } else applyConfig(patch);
  };

  const regenerate = () => {
    if (!source) {
      notify('没有原图，请重新上传图片后再生成', 'error');
      return;
    }
    if (dirty) {
      setConfirm({
        message: '重新生成会覆盖手工修改，要继续吗？',
        onConfirm: () => {
          setDirty(false);
          setHistory({ past: [], future: [] });
          requestRef.current += 1;
          setSource(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height));
          setConfirm(null);
        },
      });
    } else {
      setSource(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height));
    }
  };

  /** First click generates; later clicks behave as the existing regenerate. */
  const generateOrRegenerate = () => {
    if (!source) {
      notify('请先上传一张图片', 'error');
      return;
    }
    if (!generated) {
      setGenerated(true);
      return;
    }
    regenerate();
  };

  /* ---------- AI background removal ---------- */
  const doSegment = async () => {
    if (!sourceBlob) {
      notify('请先上传一张照片', 'error');
      return;
    }
    if (dirty) {
      setConfirm({
        message: '去背景后会重新生成图纸，手工修改将被覆盖，要继续吗？',
        onConfirm: () => { setDirty(false); setConfirm(null); void runSegment(); },
      });
      return;
    }
    await runSegment();
  };

  const runSegment = async () => {
    if (!sourceBlob) return;
    setSegment({ phase: 'loading', ratio: 0.02, message: '准备中…' });
    try {
      const imageData = await removeBackground(sourceBlob, setSegment);
      if (!segmentApplied && source) {
        setOriginalSource(
          new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
        );
      }
      setSource(imageData);
      setSegmentApplied(true);
      notify(
        generated
          ? '去背景完成，图纸已按新原图重算；效果不理想可点「恢复原图」回退'
          : '去背景完成，点「生成图纸」查看效果；不理想可点「恢复原图」回退',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : '智能去背景失败，可用橡皮手动擦除', 'error');
    } finally {
      setSegment(null);
    }
  };

  const revertSegment = () => {
    if (!originalSource) {
      notify('没有可恢复的原图', 'error');
      return;
    }
    const apply = () => {
      setDirty(false);
      setHistory({ past: [], future: [] });
      setSource(
        new ImageData(
          new Uint8ClampedArray(originalSource.data),
          originalSource.width,
          originalSource.height,
        ),
      );
      setSegmentApplied(false);
      setConfirm(null);
      notify(
        generated
          ? '已恢复去背景前的原图，图纸已重新生成'
          : '已恢复去背景前的原图，可点「生成图纸」重新出图',
      );
    };
    if (dirty) {
      setConfirm({
        message: '恢复原图会重新生成图纸，手工修改将被覆盖，要继续吗？',
        onConfirm: apply,
      });
    } else apply();
  };

  /* ---------- manual editing ---------- */
  const paintCell = (index: number) => {
    const current = patternRef.current;
    if (!current || lastPaintRef.current === index) return;
    lastPaintRef.current = index;
    if (tool === 'picker') {
      const code = current.cells[index];
      if (code) {
        setActiveCode(code);
        notify(`已取色 ${code}`);
      }
      return;
    }
    const code = tool === 'eraser' ? null : activeCode;
    if (current.cells[index] === code) return;
    const cells = [...current.cells];
    cells[index] = code;
    const next = touch({ ...current, cells });
    setHistory((state) => ({ past: [...state.past.slice(-49), current], future: [] }));
    setPattern(next);
    setDirty(true);
  };

  useEffect(() => {
    lastPaintRef.current = -1;
  }, [pattern]);

  const undo = () => {
    if (!history.past.length || !pattern) return;
    const previous = history.past[history.past.length - 1];
    setHistory({ past: history.past.slice(0, -1), future: [pattern, ...history.future] });
    setPattern(previous);
    setDirty(true);
  };

  const redo = () => {
    if (!history.future.length || !pattern) return;
    const next = history.future[0];
    setHistory({ past: [...history.past, pattern], future: history.future.slice(1) });
    setPattern(next);
    setDirty(true);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const replaceColour = (from: string, to: string) => {
    const current = patternRef.current;
    if (!current || from === to) return;
    const result = replaceCodeCells(current.cells, from, to);
    if (!result.changed) {
      notify(`图纸里没有 ${from}`, 'error');
      return;
    }
    const next = touch({ ...current, cells: result.cells });
    setHistory((state) => ({ past: [...state.past.slice(-49), current], future: [] }));
    setPattern(next);
    setDirty(true);
    notify(`已把 ${from} 的 ${result.changed} 颗豆换成 ${to}`);
  };

  /* ---------- exports ---------- */
  const exportPdf = async (range?: { from: number; to: number }) => {
    const current = patternRef.current;
    if (!current) return;
    setStatus('exporting');
    try {
      const suffix = range ? `-boards-${range.from}-${range.to}` : '';
      const pages = await exportPatternPdf(current, `${filename(current)}${suffix}.pdf`, range);
      notify(`已导出 ${pages} 页 A4 分板图纸`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PDF 导出失败', 'error');
    } finally {
      setStatus('ready');
    }
  };

  const exportPng = () => {
    const current = patternRef.current;
    if (!current) return;
    setStatus('exporting');
    try {
      downloadCanvas(renderPatternPng(current), `${filename(current)}.png`);
      notify('高清 PNG 已导出');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PNG 导出失败', 'error');
    } finally {
      setStatus('ready');
    }
  };

  const exportJson = () => {
    const current = patternRef.current;
    if (!current) return;
    downloadBlob(new Blob([serialize(current)], { type: 'application/json' }), `${filename(current)}.json`);
    notify('工程文件已导出');
  };

  /* ---------- persistence ---------- */
  const saveCurrent = async () => {
    const current = patternRef.current;
    if (!current) return;
    const next = touch(current);
    setPattern(next);
    setDrafts(upsertDraft(next));
    if (user) {
      try {
        await api.savePattern(next);
        await refreshCloud();
        notify('已保存到云端');
      } catch (error) {
        const conflict = error as Error & { status?: number };
        if (conflict.status === 409) notify('云端版本较新，本地副本已保留，请在图纸库核对', 'error');
        else notify('云端保存失败，已保留本地草稿', 'error');
      }
    } else {
      notify('已保存到本地草稿');
    }
  };

  const toggleProgress = (index: number) => {
    const current = patternRef.current;
    if (!current || !current.cells[index]) return;
    const progress = [...current.progress];
    progress[index] = !progress[index];
    const next = touch({ ...current, progress });
    setPattern(next);
    setDrafts(upsertDraft(next));
  };

  const openPattern = (target: Pattern) => {
    setSource(null);
    setSourceBlob(null);
    setOriginalSource(null);
    setSegmentApplied(false);
    setGenerated(true);
    setSourceRatio(null);
    setApproximated(0);
    setPattern(target);
    setParams(target.params);
    setPaletteId(target.paletteId);
    setBeadSize(target.beadSize);
    setHistory({ past: [], future: [] });
    setDirty(false);
    setView('studio');
    notify('已打开图纸。工程文件不含原图，调整参数需重新上传图片');
  };

  const deletePattern = async (id: string) => {
    const next = readDrafts().filter((item) => item.id !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    setDrafts(next);
    if (user) {
      try {
        await api.deletePattern(id);
        await refreshCloud();
      } catch {
        notify('云端删除失败，请稍后重试', 'error');
      }
    }
    notify('已删除');
  };

  const duplicatePattern = async (id: string) => {
    const all = mergedLibrary(readDrafts(), cloud);
    const original = all.find((item) => item.id === id);
    if (!original) return;
    const copy = createPattern({
      name: `${original.name} 副本`,
      w: original.w,
      h: original.h,
      paletteId: original.paletteId,
      beadSize: original.beadSize,
      cells: original.cells,
      params: original.params,
    });
    setDrafts(upsertDraft(copy));
    if (user) {
      try { await api.savePattern(copy); await refreshCloud(); } catch { /* local copy is kept */ }
    }
    notify('已复制图纸');
  };

  const importProject = async (file: File) => {
    try {
      const target = parsePattern(await file.text());
      setDrafts(upsertDraft(target));
      openPattern(target);
      if (user) { try { await api.savePattern(target); await refreshCloud(); } catch { /* local copy kept */ } }
      notify('工程文件已导入');
    } catch (error) {
      notify(error instanceof Error ? error.message : '工程文件无法解析', 'error');
    }
  };

  const onAuthSuccess = async (nextUser: User) => {
    setUser(nextUser);
    setAuthOpen(false);
    const local = readDrafts();
    for (const draft of local) {
      try { await api.savePattern(draft); } catch { /* keep the local draft */ }
    }
    await refreshCloud();
    notify(`已登录为 ${nextUser.username}，本地草稿已同步`);
  };

  const library = useMemo(() => mergedLibrary(drafts, cloud), [drafts, cloud]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-dot" style={{ background: '#e8b44a' }} />
            <span className="brand-dot" style={{ background: '#d96b55' }} />
            <span className="brand-dot" style={{ background: '#6b9c8c' }} />
            <span className="brand-dot" style={{ background: '#efe3c8' }} />
          </span>
          <span>
            <span className="brand-name">豆格</span>
            <span className="brand-tag"> BEAD CHART ATELIER</span>
          </span>
        </div>

        <nav className="topnav">
          <button className={view === 'studio' ? 'active' : ''} onClick={() => setView('studio')}>
            <Wrench size={14} /> 工作台
          </button>
          <button className={view === 'guide' ? 'active' : ''} onClick={() => pattern ? setView('guide') : notify('请先生成一张图纸', 'error')}>
            <Grid2X2 size={14} /> 开始拼
          </button>
          <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>
            <LayoutGrid size={14} /> 图纸库
          </button>
        </nav>

        <div className="topbar-right">
          {user ? <span className="user-chip"><Package size={12} /> {user.username}</span> : null}
          {user ? (
            <button className="btn small ghost" onClick={async () => { await api.logout().catch(() => undefined); setUser(null); notify('已退出登录'); }}>
              <LogOut size={14} /> 退出
            </button>
          ) : backendAvailable ? (
            <button className="btn small warm" onClick={() => setAuthOpen(true)}><LogIn size={14} /> 登录 / 注册</button>
          ) : (
            <span className="user-chip"><HardDrive size={12} /> 本地模式</span>
          )}
        </div>
      </header>

      <main className="main">
        {view === 'studio' ? (
          <StudioView
            status={status}
            hasSource={Boolean(source)}
            sourceUrl={sourceUrl}
            sourceName={sourceName}
            pattern={pattern}
            params={params}
            paletteId={paletteId}
            beadSize={beadSize}
            segment={segment}
            segmentApplied={segmentApplied}
            approximated={approximated}
            generated={generated}
            ratioLabel={sourceRatio ? describeRatio(sourceRatio) : ''}
            lockRatio={lockRatio}
            onLockRatio={changeLockRatio}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            tool={tool}
            activeCode={activeCode}
            highlightCode={highlightCode}
            onHighlightCode={setHighlightCode}
            onFile={(file) => void loadFile(file)}
            onParam={(patch) => changeConfig({ params: patch })}
            onPalette={(id) => changeConfig({ paletteId: id })}
            onBeadSize={(size) => changeConfig({ beadSize: size })}
            onRegenerate={generateOrRegenerate}
            onSegment={() => void doSegment()}
            onRevertSegment={revertSegment}
            onTool={setTool}
            onActiveCode={setActiveCode}
            onPaint={paintCell}
            onUndo={undo}
            onRedo={redo}
            onExportPdf={() => void exportPdf()}
            onExportPdfRange={(from, to) => void exportPdf({ from, to })}
            onReplaceCode={replaceColour}
            onExportPng={exportPng}
            onExportJson={exportJson}
            onOpenGuide={() => setView('guide')}
            onSave={() => void saveCurrent()}
          />
        ) : null}

        {view === 'guide' && pattern ? (
          <GuideView
            pattern={pattern}
            highlightCode={highlightCode}
            onHighlightCode={setHighlightCode}
            onToggleCell={toggleProgress}
            onBack={() => setView('studio')}
            onSave={() => void saveCurrent()}
          />
        ) : null}

        {view === 'library' ? (
          <LibraryView
            patterns={library}
            user={user}
            onOpen={openPattern}
            onDelete={(id) => void deletePattern(id)}
            onDuplicate={(id) => void duplicatePattern(id)}
            onImport={(file) => void importProject(file)}
            onLogin={backendAvailable ? () => setAuthOpen(true) : undefined}
          />
        ) : null}
      </main>

      {confirm ? <ConfirmModal message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} /> : null}
      {authOpen ? <AuthModal onClose={() => setAuthOpen(false)} onSuccess={(nextUser) => void onAuthSuccess(nextUser)} /> : null}
      {toast ? <Toast message={toast.message} kind={toast.kind} /> : null}
    </div>
  );
}
