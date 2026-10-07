import { useEffect, useRef } from 'react';
import { THUMB_WIDTH, THUMB_HEIGHT } from '../../projects/thumbnail';

interface Props {
  pixels: Uint8ClampedArray | null; // frontThumbnail() の結果。読めない作品は null
  scale?: number; // 何倍に拡大して表示するか
  label: string;
}

// 作品の正面のサムネイル。16×32 のドットを、にじませずに拡大して見せる
export function ProjectThumbnail({ pixels, scale = 3, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    if (pixels) ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), THUMB_WIDTH, THUMB_HEIGHT), 0, 0);
  }, [pixels]);

  return (
    <div className="vx-thumb" style={{ width: THUMB_WIDTH * scale, height: THUMB_HEIGHT * scale }}>
      <canvas ref={ref} width={THUMB_WIDTH} height={THUMB_HEIGHT} role="img" aria-label={`${label}のサムネイル`} />
      {!pixels && <span className="vx-thumb-broken">?</span>}
    </div>
  );
}
