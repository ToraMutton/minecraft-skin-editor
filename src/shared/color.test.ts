import { describe, it, expect } from 'vitest';
import { hexToRgba, rgbaToHex } from './color';

describe('色の変換', () => {
  it('#RRGGBB を数値に変換できる', () => {
    expect(hexToRgba('#3B82F6')).toEqual({ r: 59, g: 130, b: 246, a: 255 });
  });

  it('# なし・小文字でも変換できる', () => {
    expect(hexToRgba('3b82f6')).toEqual({ r: 59, g: 130, b: 246, a: 255 });
  });

  it('形式が正しくない文字列は黒になる', () => {
    // カラー入力欄に入力途中の値(#ff0 など)が入ることがあるため
    for (const bad of ['#ff0', '#ff00', '', 'red', '#gggggg']) {
      expect(hexToRgba(bad), bad).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    }
  });

  it('1桁の値は0埋めして2桁にする', () => {
    expect(rgbaToHex(0, 15, 255)).toBe('#000fff');
  });

  it('数値 → 色コード → 数値 で元に戻る', () => {
    for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [1, 128, 254], [59, 130, 246]]) {
      expect(hexToRgba(rgbaToHex(r, g, b))).toEqual({ r, g, b, a: 255 });
    }
  });
});
