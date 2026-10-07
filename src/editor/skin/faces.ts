// 64×64 の各ピクセルが、展開図のどの面(パーツ×層×向き)に属するか
import { SKIN_UV, SKIN_UV_OVER } from './uv';

// 1つの面の、展開図上の範囲と層
export interface FaceRect {
  u: number; v: number; w: number; h: number;
  layer: 'base' | 'over';
}

// 面ごとの通し番号を入れた表。どの面でもない(使われていない)ピクセルは -1
const FACE_INDEX = new Int16Array(64 * 64).fill(-1);
const FACE_RECTS: FaceRect[] = []; // 通し番号 → 面の範囲
for (const table of [SKIN_UV, SKIN_UV_OVER]) {
  for (const partUV of Object.values(table)) {
    for (const r of Object.values(partUV)) {
      for (let y = r.v; y < r.v + r.h; y++) {
        for (let x = r.u; x < r.u + r.w; x++) FACE_INDEX[y * 64 + x] = FACE_RECTS.length;
      }
      FACE_RECTS.push({ u: r.u, v: r.v, w: r.w, h: r.h, layer: table === SKIN_UV ? 'base' : 'over' });
    }
  }
}

// ピクセル(x, y)が属する面の番号 (どの面でもなければ -1)
export function faceIndexAt(x: number, y: number): number {
  if (x < 0 || x >= 64 || y < 0 || y >= 64) return -1;
  return FACE_INDEX[y * 64 + x];
}

// ピクセル(x, y)が属する面の範囲 (どの面でもなければ null)
export function faceAt(x: number, y: number): FaceRect | null {
  const index = faceIndexAt(x, y);
  return index < 0 ? null : FACE_RECTS[index];
}

// 2つのピクセルが同じ面にあるか (どちらかが面の外なら false)
export function isSameFace(a: readonly [number, number], b: readonly [number, number]): boolean {
  const face = faceIndexAt(a[0], a[1]);
  return face >= 0 && face === faceIndexAt(b[0], b[1]);
}
