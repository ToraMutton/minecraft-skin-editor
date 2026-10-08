// 64×64 の各ピクセルが、展開図のどの面(パーツ×層×向き)に属するか
import type { PartUV } from './uv';
import type { SkinLayout } from './layout';

// 1つの面の、展開図上の範囲と層
export interface FaceRect {
  u: number; v: number; w: number; h: number;
  layer: 'base' | 'over';
}

// 面の番号表 (モデルごとに1つ)
export interface FaceTable {
  faceIndex: Int16Array; // ピクセル(y * 64 + x) → 面の通し番号 (どの面でもない(使われていない)ピクセルは -1)
  faceRects: FaceRect[]; // 通し番号 → 面の範囲
}

// 展開図から、面の番号表を作る
export function buildFaceTable(uv: Record<string, PartUV>, uvOver: Record<string, PartUV>): FaceTable {
  const faceIndex = new Int16Array(64 * 64).fill(-1);
  const faceRects: FaceRect[] = [];
  for (const [table, layer] of [[uv, 'base'], [uvOver, 'over']] as const) {
    for (const partUV of Object.values(table)) {
      for (const r of Object.values(partUV)) {
        for (let y = r.v; y < r.v + r.h; y++) {
          for (let x = r.u; x < r.u + r.w; x++) faceIndex[y * 64 + x] = faceRects.length;
        }
        faceRects.push({ u: r.u, v: r.v, w: r.w, h: r.h, layer });
      }
    }
  }
  return { faceIndex, faceRects };
}

// ピクセル(x, y)が属する面の番号 (どの面でもなければ -1)
export function faceIndexAt(layout: SkinLayout, x: number, y: number): number {
  if (x < 0 || x >= 64 || y < 0 || y >= 64) return -1;
  return layout.faceIndex[y * 64 + x];
}

// ピクセル(x, y)が属する面の範囲 (どの面でもなければ null)
export function faceAt(layout: SkinLayout, x: number, y: number): FaceRect | null {
  const index = faceIndexAt(layout, x, y);
  return index < 0 ? null : layout.faceRects[index];
}

// 2つのピクセルが同じ面にあるか (どちらかが面の外なら false)
export function isSameFace(layout: SkinLayout, a: readonly [number, number], b: readonly [number, number]): boolean {
  const face = faceIndexAt(layout, a[0], a[1]);
  return face >= 0 && face === faceIndexAt(layout, b[0], b[1]);
}
