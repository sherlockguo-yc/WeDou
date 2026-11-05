import { findEquivalent, isApproximate } from '../core/color';
import { PALETTES, getColor, getLabCache, getPalette } from '../core/palettes';
import { Notice } from './ui';

/** Suggests the nearest code in other brands when the user runs out of a colour. */
export default function EquivalentPanel({
  paletteId,
  code,
}: {
  paletteId: string;
  code: string;
}) {
  const source = getColor(paletteId, code);
  if (!source) return null;
  const others = PALETTES.filter((palette) => palette.id !== paletteId).map((palette) => {
    const match = findEquivalent(source.hex, palette.colors, getLabCache(palette.id));
    return {
      brand: palette.name,
      code: match?.color.code ?? '-',
      deltaE: match?.deltaE ?? 0,
      approximate: isApproximate(match?.deltaE ?? 0),
    };
  });

  return (
    <div style={{ marginTop: 'var(--s3)' }}>
      <div className="panel-head">
        <h2 style={{ fontSize: 'calc(var(--font-size) * 0.95)' }}>
          缺 {code} 时找替代
        </h2>
        <span className="eyebrow">{getPalette(paletteId).name}</span>
      </div>
      <div className="data-table">
        <div className="table-head">
          <span>其它品牌</span>
          <span>最近色号</span>
          <span className="num">色差 ΔE</span>
          <span className="num">结论</span>
        </div>
        {others.map((item) => (
          <div className="table-row" key={item.brand}>
            <span className="table-cell"><span className="mono">{item.brand}</span></span>
            <span className="table-cell"><span className="mono">{item.code}</span></span>
            <span className="num mono">{item.deltaE.toFixed(1)}</span>
            <span className="num mono">{item.approximate ? '需人工确认' : '接近'}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'var(--s2)' }}>
        <Notice>等效色按 Lab 色差自算，不同品牌色号体系互不相干；ΔE 较大时建议先看实物色卡再替换。</Notice>
      </div>
    </div>
  );
}
