// なぞり描きで、点と点の間を埋める
import { isSameFace } from '../skin/faces';

type Point = [number, number];

// 2点を結ぶ直線上のピクセル (両端を含む)
// ブレゼンハムのアルゴリズム: 整数の足し算だけで、斜めでもすき間なく1マスずつ進む直線を引く定番の方法
export function linePixels(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; // 「理想の直線」からのずれ。これを見て x と y のどちらを進めるか決める
  let x = x0, y = y0;
  for (;;) {
    points.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return points;
}

// なぞり描きで、前の点(from)から今の点(to)までに塗る点
// 同じ面の中なら直線でつなぐ。違う面なら(展開図では離れた場所なので)つながず、今の点だけ
export function strokePoints(from: Point | null, to: Point): Point[] {
  if (!from || !isSameFace(from, to)) return [to];
  return linePixels(from[0], from[1], to[0], to[1]).slice(1); // from は前回もう塗っているので除く
}
