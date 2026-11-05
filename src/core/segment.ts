const CDN =
  import.meta.env.VITE_BG_MODULE_URL ??
  'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
/** Optional self-hosted model base (the ~40MB ONNX files). Empty = library CDN. */
const MODEL_BASE = import.meta.env.VITE_BG_MODEL_BASE;
const TIMEOUT_MS = 120_000;

export type SegmentPhase = 'loading' | 'model' | 'inference' | 'done';

export interface SegmentProgress {
  phase: SegmentPhase;
  ratio: number;
  message: string;
}

let modulePromise: Promise<{ removeBackground: (input: Blob, options?: Record<string, unknown>) => Promise<Blob> }> | null = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ CDN) as Promise<{
      removeBackground: (input: Blob, options?: Record<string, unknown>) => Promise<Blob>;
    }>;
  }
  return modulePromise;
}

/**
 * Runs ISNet segmentation entirely in the browser (ONNX Runtime Web).
 * The image never leaves the tab. Any failure is surfaced so the UI can fall
 * back to manual erasing without blocking the conversion pipeline.
 */
export async function removeBackground(
  input: Blob,
  onProgress: (progress: SegmentProgress) => void,
): Promise<ImageData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    onProgress({ phase: 'loading', ratio: 0.02, message: '正在加载本地抠图模块…' });
    const module = await loadModule();
    onProgress({ phase: 'model', ratio: 0.1, message: '首次使用需下载约 40MB 模型，之后会缓存' });

    const options: Record<string, unknown> = {
      model: 'isnet_quint8',
      progress: (key: string, current: number, total: number) => {
        const ratio = total > 0 ? Math.min(0.9, 0.1 + (current / total) * 0.8) : 0.5;
        onProgress({
          phase: key.includes('fetch') ? 'model' : 'inference',
          ratio,
          message: key.includes('fetch') ? '下载模型中…' : '正在识别主体…',
        });
      },
    };
    if (MODEL_BASE) options.publicPath = MODEL_BASE;
    const blob = await module.removeBackground(input, options);

    if (controller.signal.aborted) throw new Error('抠图超时，请改用手动擦除');
    onProgress({ phase: 'done', ratio: 1, message: '去背景完成' });

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (error) {
    modulePromise = null;
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`智能去背景不可用（${reason}）。已保留原图，可用橡皮手动擦除背景。`);
  } finally {
    clearTimeout(timer);
  }
}
