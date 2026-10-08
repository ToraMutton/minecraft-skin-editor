// 描画ツールの処理。どれも層(SkinLayers)を直接書き換える純粋な計算で、canvasやReactには依存しない
import { SKIN_SIZE, PIXEL_COUNT, isInside, compositePixel, composite } from './layers';
import type { SkinLayers, RGBA } from './layers';
import { getMirrorCoord } from '../skin/mirror';
import type { SkinLayout } from '../skin/layout';

// ペン: 手描き層に色を置く。消去マスクは外す (透明にした場所の上にも描けるように)
export function paintPixel(layers: SkinLayers, x: number, y: number, color: RGBA) {
  if (!isInside(x, y)) return;
  const p = y * SKIN_SIZE + x;
  const i = p * 4;
  layers.paint[i] = color.r; layers.paint[i + 1] = color.g; layers.paint[i + 2] = color.b; layers.paint[i + 3] = color.a;
  layers.erased[p] = 0;
}

// 消しゴム: 透明にする。手描きを消し、消去マスクを立てる (下地も見えなくなる)
export function erasePixel(layers: SkinLayers, x: number, y: number) {
  if (!isInside(x, y)) return;
  const p = y * SKIN_SIZE + x;
  layers.paint.fill(0, p * 4, p * 4 + 4);
  layers.erased[p] = 1;
}

// ブラシが触れるピクセルの一覧 (太さ・ミラーを考慮。重複なし、画像の外は含まない)
export function brushPixels(layout: SkinLayout, x: number, y: number, size: number, mirror: boolean): [number, number][] {
  const result = new Map<number, [number, number]>();
  const add = (px: number, py: number) => {
    if (isInside(px, py)) result.set(py * SKIN_SIZE + px, [px, py]);
  };

  // 太さ size の正方形。太さ3なら押した点が中心、太さ2なら押した点が右下になる2×2
  const half = Math.floor(size / 2);
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      const px = x + dx, py = y + dy;
      add(px, py);
      if (mirror) {
        const m = getMirrorCoord(layout, px, py);
        if (m) add(m[0], m[1]);
      }
    }
  }
  return [...result.values()];
}

// バケツ: 見た目(合成結果)で同じ色がつながっている範囲を、手描き層に塗る
// 塗る前と同じ色なら何もしない。何か変わったら true を返す (Undoの履歴を積むかの判断に使う)
export function floodFill(layers: SkinLayers, x: number, y: number, color: RGBA): boolean {
  if (!isInside(x, y)) return false;

  const view = composite(layers); // 「見た目」で範囲を決める
  const start = (y * SKIN_SIZE + x) * 4;
  const target = [view[start], view[start + 1], view[start + 2], view[start + 3]];
  if (target[0] === color.r && target[1] === color.g && target[2] === color.b && target[3] === color.a) return false;

  const sameAsTarget = (p: number) =>
    view[p * 4] === target[0] && view[p * 4 + 1] === target[1] && view[p * 4 + 2] === target[2] && view[p * 4 + 3] === target[3];

  const visited = new Uint8Array(PIXEL_COUNT);
  const stack: number[] = [y * SKIN_SIZE + x];
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (visited[p] || !sameAsTarget(p)) continue;
    visited[p] = 1;

    const px = p % SKIN_SIZE, py = Math.floor(p / SKIN_SIZE);
    paintPixel(layers, px, py, color);

    // 上下左右 (画像の端を越えて反対側に回り込まないよう、x の範囲を確かめる)
    if (px + 1 < SKIN_SIZE) stack.push(p + 1);
    if (px - 1 >= 0) stack.push(p - 1);
    if (py + 1 < SKIN_SIZE) stack.push(p + SKIN_SIZE);
    if (py - 1 >= 0) stack.push(p - SKIN_SIZE);
  }
  return true;
}

// スポイト: 見た目(合成結果)の色。透明な場所なら null
export function pickColor(layers: SkinLayers, x: number, y: number): RGBA | null {
  if (!isInside(x, y)) return null;
  const c = compositePixel(layers, x, y);
  return c.a === 0 ? null : c;
}
