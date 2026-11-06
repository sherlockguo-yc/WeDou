import { useCallback, useEffect, useState } from 'react';
import { PackageOpen, Search, Store, X } from 'lucide-react';
import { api } from '../api/client';
import type { MarketItem, MarketSummary, User } from '../api/client';
import PatternThumb from '../components/PatternThumb';
import { Modal, Notice } from '../components/ui';
import { getPalette } from '../core/palettes';

const PAGE_SIZE = 24;

export default function MarketView({
  user,
  refreshToken,
  onShared,
  onLogin,
  onSaveToLibrary,
  onUnshare,
  notify,
}: {
  user: User | null;
  refreshToken: number;
  onShared: (shared: { id: string; sourceId: string }[]) => void;
  onLogin?: () => void;
  onSaveToLibrary: (item: MarketItem) => void;
  onUnshare: (marketId: string) => void;
  notify: (message: string, kind?: 'info' | 'error') => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<MarketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState<MarketItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (needle: string, offset: number, append: boolean) => {
    setStatus('loading');
    try {
      const result = await api.listMarket(needle, PAGE_SIZE, offset);
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setTotal(result.total);
      onShared(result.shared);
      setStatus('ready');
      return result.items.length;
    } catch {
      setStatus('error');
      return 0;
    }
  }, [onShared]);

  useEffect(() => {
    void load(debounced, 0, false);
  }, [debounced, refreshToken, load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const result = await api.getMarketItem(id);
      setDetail(result.item);
    } catch (error) {
      notify(error instanceof Error ? error.message : '图纸加载失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const save = () => {
    if (!detail) return;
    if (!user) {
      notify('请先登录后再保存到图纸仓库', 'error');
      onLogin?.();
      return;
    }
    onSaveToLibrary(detail);
    setDetail(null);
  };

  const unshare = (id: string) => {
    onUnshare(id);
    setDetail(null);
  };

  const isMine = (item: MarketSummary) => Boolean(user && item.ownerId === user.id);

  return (
    <div className="library">
      <section className="panel">
        <div className="library-head">
          <div>
            <h2>图纸市集</h2>
            <span className="eyebrow">{total} 张公开图纸 · 所有人可见</span>
          </div>
          <Store size={18} />
        </div>

        {!user ? (
          <div style={{ marginBottom: 'var(--s3)' }}>
            <Notice>
              {onLogin
                ? '市集里都是其他用户分享的图纸，任何人都能浏览。登录后可以把喜欢的图纸保存到自己的图纸仓库。'
                : '当前为本地模式，市集内容由完整版服务提供。'}
            </Notice>
          </div>
        ) : null}

        <div className="search-row">
          <Search size={14} />
          <input
            className="input"
            type="search"
            value={query}
            maxLength={80}
            placeholder="按图纸名称或作者搜索"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索图纸市集"
          />
          {query ? <button className="btn small ghost" onClick={() => setQuery('')} aria-label="清空搜索"><X size={13} /></button> : null}
        </div>

        {status === 'error' ? (
          <div className="empty-state">
            <PackageOpen size={36} />
            <h2>市集暂时打不开</h2>
            <p>可能是网络或服务端暂时不可用，图纸仓库里的本地图纸不受影响。</p>
            <button className="btn small" onClick={() => void load(debounced, 0, false)}>重试</button>
          </div>
        ) : total === 0 && status === 'ready' ? (
          <div className="empty-state">
            <Store size={36} />
            <h2>{debounced ? '没有匹配的图纸' : '市集还没有图纸'}</h2>
            <p>{debounced ? '换个关键词试试，或清空搜索查看全部。' : '去图纸仓库把自己喜欢的图纸分享出来吧。'}</p>
            {debounced ? <button className="btn small" onClick={() => setQuery('')}>清空搜索</button> : null}
          </div>
        ) : (
          <>
            <div className="pattern-grid">
              {items.map((item) => (
                <article className="pattern-card" key={item.id}>
                  <button className="pattern-card-preview" onClick={() => void openDetail(item.id)} title={`查看 ${item.name}`}>
                    <PatternThumb src={item.thumb} alt={`${item.name} 预览`} />
                  </button>
                  <div className="pattern-card-body">
                    <h3 title={item.name}>{item.name}</h3>
                    <div className="pattern-card-meta">
                      <span>by {item.ownerName}</span>
                      <span>{item.w}×{item.h} · {getPalette(item.paletteId).name}</span>
                    </div>
                    {isMine(item) ? <span className="shared-badge">我分享的</span> : null}
                  </div>
                  <div className="pattern-card-actions">
                    <button className="btn small" disabled={detailLoading} onClick={() => void openDetail(item.id)}>查看</button>
                    {isMine(item) ? (
                      <button className="btn small ghost" onClick={() => unshare(item.id)}>撤销分享</button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            {items.length < total ? (
              <div className="tool-row" style={{ justifyContent: 'center', marginTop: 'var(--s3)' }}>
                <button className="btn small" disabled={status === 'loading'} onClick={() => void load(debounced, items.length, true)}>
                  {status === 'loading' ? '加载中…' : `加载更多（还有 ${total - items.length} 张）`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {detail ? (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div className="market-detail">
            <PatternThumb src={detail.thumb} alt={`${detail.name} 预览`} />
            <dl className="market-detail-meta">
              <dt>作者</dt><dd>{detail.ownerName}</dd>
              <dt>尺寸</dt><dd>{detail.w}×{detail.h} 格</dd>
              <dt>色板</dt><dd>{getPalette(detail.paletteId).name}</dd>
              <dt>发布时间</dt><dd>{new Date(detail.createdAt).toLocaleDateString('zh-CN')}</dd>
            </dl>
          </div>
          <Notice>保存到图纸仓库后会生成一张独立副本，可以随意编辑，作者撤销分享也不会影响它。</Notice>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setDetail(null)}>关闭</button>
            {isMine(detail) ? (
              <button className="btn ghost danger" onClick={() => unshare(detail.id)}>撤销分享</button>
            ) : null}
            <button className="btn primary" onClick={save}>保存到我的图纸仓库</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
