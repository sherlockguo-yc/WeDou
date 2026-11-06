import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = mkdtempSync(path.join(tmpdir(), 'wedou-market-'));
process.env.WEDOU_DATA_DIR = dataDir;
const store = await import('../server/store.mjs');
await store.initDb();

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const THUMB = 'data:image/png;base64,AAA';
const alice = { id: 'alice-id', username: 'alice' };
const bob = { id: 'bob-id', username: 'bob_user' };

function pattern(id, name) {
  return {
    id,
    name,
    w: 2,
    h: 2,
    paletteId: 'mard-221',
    beadSize: '5mm',
    cells: ['A1', null, 'A2', null],
    params: { width: 2, height: 2 },
    progress: [false, false, false, false],
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

describe('market search input', () => {
  it('trims and bounds the length without dropping literal characters', () => {
    expect(store.sanitizeSearch('  小熊%_\\  ')).toBe('小熊%_\\');
    expect(store.sanitizeSearch('x'.repeat(200))).toHaveLength(80);
    expect(store.sanitizeSearch(null)).toBe('');
  });
});

describe('market items', () => {
  it('publishes a snapshot and never returns cells in the list', () => {
    const item = store.upsertMarketItem(alice, pattern('p1', '小熊'), THUMB);
    expect(item.name).toBe('小熊');
    expect(item.ownerName).toBe('alice');
    expect(item.cells).toEqual(['A1', null, 'A2', null]);

    const list = store.listMarket({});
    expect(list.total).toBe(1);
    expect(list.items[0].cells).toBeUndefined();
    expect(list.items[0].params).toBeUndefined();
    expect(list.items[0].thumb).toBe(THUMB);
  });

  it('searches by name and author, keeping _ and % literal', () => {
    store.upsertMarketItem(bob, pattern('p2', '小猫'), THUMB);
    expect(store.listMarket({ q: '小熊' }).items.map((item) => item.name)).toEqual(['小熊']);
    expect(store.listMarket({ q: 'bob_user' }).items.map((item) => item.name)).toEqual(['小猫']);
    expect(store.listMarket({ q: '%' }).total).toBe(0);
    expect(store.listMarket({ q: '小' }).total).toBe(2);
  });

  it('republishing the same private pattern updates one row and keeps its id', () => {
    const firstId = store.listMarket({ q: '小熊' }).items[0].id;
    store.upsertMarketItem(alice, pattern('p1', '小熊改名'), THUMB);
    const list = store.listMarket({ q: '小熊' });
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(firstId);
    expect(list.items[0].name).toBe('小熊改名');
  });

  it('exposes the author mapping and full detail', () => {
    const shared = store.listSharedItems('alice-id');
    expect(shared).toEqual([{ id: expect.any(String), sourceId: 'p1' }]);
    const item = store.getMarketItem(shared[0].id);
    expect(item.cells).toHaveLength(4);
    expect(item.params.width).toBe(2);
    expect(store.getMarketOwner(shared[0].id)).toBe('alice-id');
    expect(store.listSharedItems('nobody')).toEqual([]);
  });

  it('paginates deterministically', () => {
    const first = store.listMarket({ limit: 1, offset: 0 });
    const second = store.listMarket({ limit: 1, offset: 1 });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0].id).not.toBe(second.items[0].id);
    expect(first.total).toBe(2);
  });

  it('removes an item and reports a missing owner', () => {
    const id = store.listSharedItems('alice-id')[0].id;
    store.removeMarketItem(id);
    expect(store.getMarketItem(id)).toBeNull();
    expect(store.getMarketOwner(id)).toBeNull();
    expect(store.listSharedItems('bob-id')).toHaveLength(1);
  });
});
