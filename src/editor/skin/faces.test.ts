import { describe, it, expect } from 'vitest';
import { faceAt, faceIndexAt } from './faces';

describe('faceAt', () => {
  it('素の層の頭の正面', () => {
    expect(faceAt(10, 10)).toEqual({ u: 8, v: 8, w: 8, h: 8, layer: 'base' });
  });

  it('上着の層の頭の正面', () => {
    expect(faceAt(42, 9)).toEqual({ u: 40, v: 8, w: 8, h: 8, layer: 'over' });
  });

  it('どの面でもないピクセル・画像の外は null', () => {
    expect(faceAt(0, 0)).toBeNull();
    expect(faceAt(-1, 10)).toBeNull();
    expect(faceAt(64, 10)).toBeNull();
  });

  it('どのピクセルも、返された面の範囲の中にあり、その面の全ピクセルが同じ面になる', () => {
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const face = faceAt(x, y);
        if (!face) continue;
        expect(x >= face.u && x < face.u + face.w && y >= face.v && y < face.v + face.h).toBe(true);
        expect(faceIndexAt(face.u, face.v)).toBe(faceIndexAt(x, y));
        expect(faceIndexAt(face.u + face.w - 1, face.v + face.h - 1)).toBe(faceIndexAt(x, y));
      }
    }
  });
});
