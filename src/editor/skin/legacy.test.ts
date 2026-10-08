import { describe, it, expect } from 'vitest';
import { legacyToSkin64, LEGACY_HEIGHT } from './legacy';

// 64×32 の画像: 場所ごとに違う色 (どのピクセルがどこへ写ったか追えるように)。alpha は指定できる
function legacyImage(alpha = 255): Uint8ClampedArray {
  const img = new Uint8ClampedArray(64 * LEGACY_HEIGHT * 4);
  for (let y = 0; y < LEGACY_HEIGHT; y++) for (let x = 0; x < 64; x++) img.set([x * 4, y * 8, (x + y) % 256, alpha], (y * 64 + x) * 4);
  return img;
}
const at = (img: Uint8ClampedArray, x: number, y: number) => [...img.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];

describe('legacyToSkin64 (旧形式 64×32 → 64×64)', () => {
  it('64×64 になり、上半分はそのまま', () => {
    const src = legacyImage(200);
    const out = legacyToSkin64(src);
    expect(out).toHaveLength(64 * 64 * 4);
    for (let y = 0; y < LEGACY_HEIGHT; y++) for (let x = 0; x < 64; x++) {
      expect(at(out, x, y), `(${x},${y})`).toEqual(at(src, x, y));
    }
  });

  it('右腕は、左右反転して左腕の場所にコピーされる (正面: 右腕 x=44〜47 → 左腕 x=36〜39 の逆順)', () => {
    const src = legacyImage(200);
    const out = legacyToSkin64(src);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 4; x++) {
      expect(at(out, 36 + x, 52 + y)).toEqual(at(src, 47 - x, 20 + y));
    }
  });

  it('右脚は、左右反転して左脚の場所にコピーされる (正面: 右脚 x=4〜7 → 左脚 x=20〜23 の逆順)', () => {
    const src = legacyImage(200);
    const out = legacyToSkin64(src);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 4; x++) {
      expect(at(out, 20 + x, 52 + y)).toEqual(at(src, 7 - x, 20 + y));
    }
  });

  it('腕と脚の6面すべて(上面・底面・外側・正面・内側・背面)がコピーされる', () => {
    const src = legacyImage(200);
    const out = legacyToSkin64(src);
    // 左腕・左脚の領域 (x, y, w, h) には、元の絵が写っている (空ではない)
    for (const [x0, y0, w, h] of [[36, 48, 4, 4], [40, 48, 4, 4], [32, 52, 4, 12], [36, 52, 4, 12], [40, 52, 4, 12], [44, 52, 4, 12],
                                  [20, 48, 4, 4], [24, 48, 4, 4], [16, 52, 4, 12], [20, 52, 4, 12], [24, 52, 4, 12], [28, 52, 4, 12]]) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) expect(at(out, x, y)[3], `(${x},${y})`).toBe(200);
    }
  });

  it('上着の層(下半分の、左腕・左脚以外)は空のまま', () => {
    const out = legacyToSkin64(legacyImage(200));
    for (const [x, y] of [[44, 36], [20, 36], [4, 36], [52, 52], [0, 52], [8, 40]]) expect(at(out, x, y), `(${x},${y})`).toEqual([0, 0, 0, 0]);
  });

  it('透明な画素が1つも無い旧スキンは、帽子の層(頭の上着)を透明にする', () => {
    const out = legacyToSkin64(legacyImage(255));
    for (const [x, y] of [[40, 8], [47, 15], [32, 8], [63, 15], [40, 0], [55, 7]]) expect(at(out, x, y), `(${x},${y})`).toEqual([0, 0, 0, 0]);
    expect(at(out, 8, 8)[3]).toBe(255); // 頭本体の正面は残る
  });

  it('透明な画素が1つでもあれば、帽子の層はそのまま残す', () => {
    const src = legacyImage(255);
    src.set([0, 0, 0, 0], (31 * 64 + 63) * 4); // 隅に透明な画素を1つ
    const out = legacyToSkin64(src);
    expect(at(out, 40, 8)).toEqual(at(src, 40, 8));
    expect(at(out, 55, 7)).toEqual(at(src, 55, 7));
  });

  it('64×32 でない画素は断る', () => {
    expect(() => legacyToSkin64(new Uint8ClampedArray(64 * 64 * 4))).toThrow();
  });
});
