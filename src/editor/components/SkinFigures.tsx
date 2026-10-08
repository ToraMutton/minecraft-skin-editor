import { useMemo } from 'react';
import { ProjectThumbnail } from './ProjectThumbnail';
import { createLayers } from '../canvas/layers';
import type { SkinLayout } from '../skin/layout';
import { figureThumbnail } from '../../projects/thumbnail';

interface Props {
  pixels: Uint8ClampedArray; // 64×64 のスキン (RGBA)
  layout: SkinLayout;
  scale?: number;
}

// 正面と背面の2体を並べて見せる (Quick Design のプレビュー)
export function SkinFigures({ pixels, layout, scale = 8 }: Props) {
  const views = useMemo(() => {
    const layers = createLayers(pixels);
    return { front: figureThumbnail(layers, layout, 'front'), back: figureThumbnail(layers, layout, 'back') };
  }, [pixels, layout]);

  return (
    <div className="vx-figures">
      <figure className="vx-figure"><ProjectThumbnail pixels={views.front} scale={scale} label="正面" /><figcaption>正面</figcaption></figure>
      <figure className="vx-figure"><ProjectThumbnail pixels={views.back} scale={scale} label="背面" /><figcaption>背面</figcaption></figure>
    </div>
  );
}
