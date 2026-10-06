import { describe, it, expect } from 'vitest';
import { createLayers, cloneLayers, composite, compositePixel, PIXEL_COUNT } from './layers';

// (x, y) のピクセルに直接値を書くための小さな道具
const at = (x: number, y: number) => (y * 64 + x) * 4;
function setRGBA(data: Uint8ClampedArray, x: number, y: number, rgba: [number, number, number, number]) {
  data.set(rgba, at(x, y));
}

describe('層の合成 (composite)', () => {
  it('何も描いていなければ、下地がそのまま見える', () => {
    const base = new Uint8ClampedArray(PIXEL_COUNT * 4);
    setRGBA(base, 3, 4, [10, 20, 30, 255]);
    const layers = createLayers(base);
    expect(compositePixel(layers, 3, 4)).toEqual({ r: 10, g: 20, b: 30, a: 255 });
  });

  it('手描きがある場所は、手描きが下地より優先される', () => {
    const layers = createLayers();
    setRGBA(layers.base, 1, 1, [255, 0, 0, 255]);
    setRGBA(layers.paint, 1, 1, [0, 0, 255, 255]);
    expect(compositePixel(layers, 1, 1)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });

  it('消去マスクがある場所は、下地も手描きも無視して透明', () => {
    const layers = createLayers();
    setRGBA(layers.base, 2, 2, [255, 0, 0, 255]);
    setRGBA(layers.paint, 2, 2, [0, 0, 255, 255]);
    layers.erased[2 * 64 + 2] = 1;
    expect(compositePixel(layers, 2, 2)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('composite() 全体の結果は、compositePixel() を全ピクセル並べたものと一致する', () => {
    const layers = createLayers();
    for (let i = 0; i < PIXEL_COUNT * 4; i++) layers.base[i] = (i * 7) % 256;
    for (let p = 0; p < PIXEL_COUNT; p += 5) setRGBA(layers.paint, p % 64, Math.floor(p / 64), [1, 2, 3, 255]);
    for (let p = 0; p < PIXEL_COUNT; p += 11) layers.erased[p] = 1;

    const all = composite(layers);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const { r, g, b, a } = compositePixel(layers, x, y);
        expect([...all.slice(at(x, y), at(x, y) + 4)]).toEqual([r, g, b, a]);
      }
    }
  });
});

describe('createLayers / cloneLayers', () => {
  it('下地を渡しても、元の配列とは別物になる (元を書き換えても影響しない)', () => {
    const base = new Uint8ClampedArray(PIXEL_COUNT * 4);
    const layers = createLayers(base);
    base[0] = 99;
    expect(layers.base[0]).toBe(0);
  });

  it('64×64 以外の大きさの下地はエラーにする', () => {
    expect(() => createLayers(new Uint8ClampedArray(10))).toThrow();
  });

  it('複製は中身まで別物になる', () => {
    const layers = createLayers();
    const copy = cloneLayers(layers);
    copy.paint[0] = 1; copy.base[0] = 1; copy.erased[0] = 1;
    expect([layers.paint[0], layers.base[0], layers.erased[0]]).toEqual([0, 0, 0]);
  });
});
