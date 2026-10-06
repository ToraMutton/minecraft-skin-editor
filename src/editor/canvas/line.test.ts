import { describe, it, expect } from 'vitest';
import { linePixels, strokePoints } from './line';
import { faceIndexAt, isSameFace } from '../skin/faces';

describe('linePixels (直線)', () => {
  it('1点だけなら、その点', () => {
    expect(linePixels(3, 3, 3, 3)).toEqual([[3, 3]]);
  });

  it('横・縦・斜め45度', () => {
    expect(linePixels(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(linePixels(5, 4, 5, 1)).toEqual([[5, 4], [5, 3], [5, 2], [5, 1]]);
    expect(linePixels(0, 0, 2, 2)).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('どんな向きでも、両端を含み、1マスずつすき間なく進む', () => {
    for (const [x0, y0, x1, y1] of [[0, 0, 7, 3], [10, 2, 1, 9], [4, 4, 4, 12], [20, 30, 25, 20]]) {
      const line = linePixels(x0, y0, x1, y1);
      expect(line[0]).toEqual([x0, y0]);
      expect(line[line.length - 1]).toEqual([x1, y1]);
      for (let i = 1; i < line.length; i++) {
        expect(Math.abs(line[i][0] - line[i - 1][0])).toBeLessThanOrEqual(1);
        expect(Math.abs(line[i][1] - line[i - 1][1])).toBeLessThanOrEqual(1);
      }
      // 長い方の辺のマス数ちょうど (余計に太くならない)
      expect(line).toHaveLength(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1);
    }
  });
});

describe('面の判定', () => {
  it('頭の正面 (8〜15, 8〜15) の中どうしは同じ面', () => {
    expect(isSameFace([8, 8], [15, 15])).toBe(true);
  });

  it('隣り合っていても、頭の右側面(〜7列)と正面(8列〜)は別の面', () => {
    expect(isSameFace([7, 10], [8, 10])).toBe(false);
  });

  it('素の層と上着の層は、同じ向きの面でも別の面', () => {
    expect(isSameFace([10, 10], [42, 10])).toBe(false); // 頭の正面 と 頭の上着の正面
  });

  it('使われていない場所 (左上の 0〜7, 0〜7 など) はどの面でもない', () => {
    expect(faceIndexAt(0, 0)).toBe(-1);
    expect(isSameFace([0, 0], [1, 1])).toBe(false);
  });
});

describe('strokePoints (なぞり描きの補間)', () => {
  it('最初の点は、その点だけ', () => {
    expect(strokePoints(null, [10, 10])).toEqual([[10, 10]]);
  });

  it('同じ面の中なら、前の点の次から今の点まで直線でつなぐ', () => {
    expect(strokePoints([8, 10], [11, 10])).toEqual([[9, 10], [10, 10], [11, 10]]);
  });

  it('別の面へ移ったら、つながずに今の点だけ (展開図で間にある別の場所を塗らない)', () => {
    // 頭の正面 → 胴体の正面: 直線で結ぶと間にある脚の上面などを通ってしまう
    expect(strokePoints([12, 15], [24, 20])).toEqual([[24, 20]]);
  });
});
