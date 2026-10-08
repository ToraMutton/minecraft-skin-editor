import { describe, it, expect } from 'vitest';
import { createStarterPixels } from './starter';
import { createLayers } from '../canvas/layers';
import { getLayout } from './layout';

const MODELS = ['classic', 'slim'] as const;

const alphaAt = (pixels: Uint8ClampedArray, x: number, y: number) => pixels[(y * 64 + x) * 4 + 3];
const colorAt = (pixels: Uint8ClampedArray, x: number, y: number) => [...pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 3)];

describe.each(MODELS)('素体スキン (%s)', model => {
  const layout = getLayout(model);
  const SKIN_UV = layout.uv, SKIN_UV_OVER = layout.uvOver;
  const pixels = createStarterPixels(layout);

  it('64×64 のRGBAで、下地としてそのまま使える', () => {
    expect(pixels).toHaveLength(64 * 64 * 4);
    expect(() => createLayers(pixels)).not.toThrow();
  });

  it('素の層の全ての面が不透明に塗られている (透けて真っ黒に見える所が無い)', () => {
    const transparent: string[] = [];
    for (const [part, uv] of Object.entries(SKIN_UV)) {
      for (const [face, r] of Object.entries(uv)) {
        for (let y = r.v; y < r.v + r.h; y++) {
          for (let x = r.u; x < r.u + r.w; x++) if (alphaAt(pixels, x, y) !== 255) transparent.push(`${part}.${face}(${x},${y})`);
        }
      }
    }
    expect(transparent).toEqual([]);
  });

  it('上着の層は空 (素体の上に、自由に上着を描ける)', () => {
    for (const uv of Object.values(SKIN_UV_OVER)) {
      for (const r of Object.values(uv)) {
        for (let y = r.v; y < r.v + r.h; y++) {
          for (let x = r.u; x < r.u + r.w; x++) expect(alphaAt(pixels, x, y)).toBe(0);
        }
      }
    }
  });

  it('人の形になっている: 頭の正面に目、胴体はシャツ、脚の下端は靴', () => {
    const head = SKIN_UV.head.front, body = SKIN_UV.body.front, leg = SKIN_UV.rightLeg.front;
    expect(colorAt(pixels, head.u + 1, head.v + 4)).toEqual([255, 255, 255]); // 白目
    expect(colorAt(pixels, head.u + 2, head.v + 4)).toEqual([47, 95, 208]); // 黒目
    expect(colorAt(pixels, body.u + 4, body.v + 5)).toEqual([60, 133, 39]); // シャツ
    expect(colorAt(pixels, leg.u + 2, leg.v + 11)).toEqual([80, 80, 86]); // 靴
  });

  it('後頭部は髪で覆われている (後ろから見ても顔が肌色に見えない)', () => {
    const back = SKIN_UV.head.back;
    const hairLike = (c: number[]) => c[0] < 130 && c[1] < 90; // 肌色(232,185,143)より十分暗い茶色
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(hairLike(colorAt(pixels, back.u + x, back.v + y)), `(${x},${y})`).toBe(true);
  });

  it('左右対称に作られている (右目と左目、右腕と左腕、右足と左足)', () => {
    const head = SKIN_UV.head.front;
    expect(colorAt(pixels, head.u + 1, head.v + 4)).toEqual(colorAt(pixels, head.u + 6, head.v + 4)); // 白目どうし
    expect(colorAt(pixels, head.u + 2, head.v + 4)).toEqual(colorAt(pixels, head.u + 5, head.v + 4)); // 黒目どうし
    const [ra, la] = [SKIN_UV.rightArm.front, SKIN_UV.leftArm.front];
    const [rl, ll] = [SKIN_UV.rightLeg.front, SKIN_UV.leftLeg.front];
    for (let y = 0; y < 12; y++) {
      expect(colorAt(pixels, ra.u + 1, ra.v + y)).toEqual(colorAt(pixels, la.u + 1, la.v + y));
      expect(colorAt(pixels, rl.u + 1, rl.v + y)).toEqual(colorAt(pixels, ll.u + 1, ll.v + y));
    }
  });

  it('呼ぶたびに新しい配列を返す (1つを書き換えても他に影響しない)', () => {
    const a = createStarterPixels(layout);
    a[0] = 123;
    expect(createStarterPixels(layout)[0]).not.toBe(123);
  });
});
