import { useMemo } from 'react';
import { thumbFor } from '../render/thumbnail';
import type { Pattern } from '../core/types';

/** Market cards only have a stored data URL; warehouse cards render from the pattern itself. */
export default function PatternThumb({
  pattern,
  src,
  alt,
}: {
  pattern?: Pattern;
  src?: string;
  alt: string;
}) {
  const url = useMemo(() => src || (pattern ? thumbFor(pattern) : ''), [src, pattern]);
  if (!url) return <div className="pattern-thumb is-empty" aria-label={alt}>暂无预览</div>;
  return <img className="pattern-thumb" src={url} alt={alt} />;
}
