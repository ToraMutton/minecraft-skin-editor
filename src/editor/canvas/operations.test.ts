import { describe, it, expect } from 'vitest';
import { createLayers, compositePixel } from './layers';
import { paintPixel, erasePixel, brushPixels, floodFill, pickColor } from './operations';
import { getMirrorCoord } from '../skin/mirror';
import { getLayout } from '../skin/layout';

const CLASSIC = getLayout('classic');

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };
const CLEAR = { r: 0, g: 0, b: 0, a: 0 };

// 下地を全部 color で塗った層
function filledLayers(color = RED) {
  const layers = createLayers();
  for (let i = 0; i < layers.base.length; i += 4) layers.base.set([color.r, color.g, color.b, color.a], i);
  return layers;
}

describe('ペンと消しゴム', () => {
  it('ペンは手描き層に描き、下地は変えない', () => {
    const layers = filledLayers(RED);
    paintPixel(layers, 5, 5, BLUE);
    expect(compositePixel(layers, 5, 5)).toEqual(BLUE);
    expect([...layers.base.slice((5 * 64 + 5) * 4, (5 * 64 + 5) * 4 + 4)]).toEqual([255, 0, 0, 255]);
  });

  it('消しゴムは、読み込んだスキン(下地)の上でも透明にできる', () => {
    const layers = filledLayers(RED);
    erasePixel(layers, 5, 5);
    expect(compositePixel(layers, 5, 5)).toEqual(CLEAR);
  });

  it('消した場所にペンで描くと、ちゃんと見える (消去マスクが外れる)', () => {
    const layers = filledLayers(RED);
    erasePixel(layers, 5, 5);
    paintPixel(layers, 5, 5, BLUE);
    expect(compositePixel(layers, 5, 5)).toEqual(BLUE);
  });

  it('描いた場所を消すと、手描きも消えて透明になる', () => {
    const layers = filledLayers(RED);
    paintPixel(layers, 5, 5, BLUE);
    erasePixel(layers, 5, 5);
    expect(compositePixel(layers, 5, 5)).toEqual(CLEAR);
    expect(layers.paint[(5 * 64 + 5) * 4 + 3]).toBe(0);
  });

  it('画像の外を指定しても何も起きない (エラーにならない)', () => {
    const layers = createLayers();
    expect(() => { paintPixel(layers, -1, 0, RED); erasePixel(layers, 64, 0); }).not.toThrow();
  });
});

describe('brushPixels (太さとミラー)', () => {
  const sorted = (list: [number, number][]) => list.map(p => p.join(',')).sort();

  it('太さ1は押した点だけ', () => {
    expect(brushPixels(CLASSIC, 10, 10, 1, false)).toEqual([[10, 10]]);
  });

  it('太さ2は押した点を右下とする2×2、太さ3は押した点を中心とする3×3', () => {
    expect(sorted(brushPixels(CLASSIC, 10, 10, 2, false))).toEqual(sorted([[9, 9], [10, 9], [9, 10], [10, 10]]));
    expect(brushPixels(CLASSIC, 10, 10, 3, false)).toHaveLength(9);
    expect(brushPixels(CLASSIC, 10, 10, 3, false)).toContainEqual([9, 9]);
    expect(brushPixels(CLASSIC, 10, 10, 3, false)).toContainEqual([11, 11]);
  });

  it('画像の端では、はみ出した分は含まない', () => {
    expect(sorted(brushPixels(CLASSIC, 0, 0, 3, false))).toEqual(sorted([[0, 0], [1, 0], [0, 1], [1, 1]]));
  });

  it('ミラーONなら、各ピクセルのミラー先も含む', () => {
    // 頭の正面 (8〜15, 8〜15) の左端 → 右端
    const result = brushPixels(CLASSIC, 8, 10, 1, true);
    expect(sorted(result)).toEqual(sorted([[8, 10], getMirrorCoord(CLASSIC, 8, 10)!]));
  });

  it('ミラー先が自分と重なっても、同じピクセルを2回数えない', () => {
    // 太さ2で頭の正面の中央線をまたぐと、ミラー先がブラシの中に戻ってくる
    const result = brushPixels(CLASSIC, 12, 10, 2, true);
    expect(new Set(result.map(p => p.join(','))).size).toBe(result.length);
  });
});

describe('バケツ (floodFill)', () => {
  it('見た目で同じ色がつながっている範囲を塗る', () => {
    const layers = filledLayers(RED);
    // 縦に1列だけ青い壁を作る → 壁の左側だけが塗られるはず
    for (let y = 0; y < 64; y++) paintPixel(layers, 10, y, BLUE);
    floodFill(layers, 0, 0, { r: 0, g: 255, b: 0, a: 255 });
    expect(compositePixel(layers, 9, 30).g).toBe(255); // 壁の左
    expect(compositePixel(layers, 11, 30)).toEqual(RED); // 壁の右は塗られない
    expect(compositePixel(layers, 10, 30)).toEqual(BLUE); // 壁そのものも塗られない
  });

  it('画像の右端から次の行の左端へ回り込まない', () => {
    const layers = filledLayers(RED);
    for (let y = 0; y < 64; y++) paintPixel(layers, 1, y, BLUE); // x=0 の列だけを壁で隔離
    floodFill(layers, 0, 5, { r: 0, g: 255, b: 0, a: 255 });
    expect(compositePixel(layers, 63, 4)).toEqual(RED); // (0,5) の隣の配列要素は (63,4)
  });

  it('同じ色で塗ろうとしたら false を返し、何も変えない (Undoを積まない)', () => {
    const layers = filledLayers(RED);
    expect(floodFill(layers, 0, 0, RED)).toBe(false);
    expect(layers.paint.every(v => v === 0)).toBe(true);
  });

  it('透明にした範囲も塗れる', () => {
    const layers = filledLayers(RED);
    erasePixel(layers, 20, 20);
    expect(floodFill(layers, 20, 20, BLUE)).toBe(true);
    expect(compositePixel(layers, 20, 20)).toEqual(BLUE);
  });
});

describe('スポイト (pickColor)', () => {
  it('見た目の色を返す (手描きがあれば手描きの色)', () => {
    const layers = filledLayers(RED);
    paintPixel(layers, 3, 3, BLUE);
    expect(pickColor(layers, 3, 3)).toEqual(BLUE);
    expect(pickColor(layers, 4, 4)).toEqual(RED);
  });

  it('透明な場所では null', () => {
    const layers = filledLayers(RED);
    erasePixel(layers, 3, 3);
    expect(pickColor(layers, 3, 3)).toBeNull();
  });
});
