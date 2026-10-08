import type { PaintBuffer, BandView, FaceView, Paint } from '../buffer';
import { paint } from '../buffer';
import type { SkinSpec } from '../spec';
import type { Rng } from '../prng';

// 各パーツを塗る処理に渡すもの
//   rng: その処理専用の乱数の流れ (他の処理が乱数を何回使っても、影響を受けない)
export interface PaintContext {
  buf: PaintBuffer;
  spec: SkinSpec;
  rng: Rng;
}

export const clampTone = (tone: number) => Math.max(-2, Math.min(2, tone));

// 既に塗ってある色の段階を delta だけずらす (何も塗っていなければ何もしない)
// シワや縁など、「今の色より少し暗く/明るく」したいときに使う
function nudged(p: Paint | null, delta: number): Paint | null {
  return p ? paint(p.mat, clampTone(p.tone + delta), p.flat) : null;
}
export function nudgeBand(band: BandView, c: number, y: number, delta: number) {
  const p = nudged(band.get(c, y), delta);
  if (p) band.set(c, y, p);
}
export function nudgeFace(face: FaceView, x: number, y: number, delta: number) {
  const p = nudged(face.get(x, y), delta);
  if (p) face.set(x, y, p);
}
