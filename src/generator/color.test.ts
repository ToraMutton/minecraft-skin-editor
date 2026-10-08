import { describe, it, expect } from 'vitest';
import { toRgb, rgbToOklch, shade, makeRamp, RAMP_BASE, RAMP_SIZE } from './color';
import type { Oklch } from './color';

// 色相の差 (-180〜180)
const hueDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

describe('toRgb / rgbToOklch', () => {
  it('RGBに変換して戻すと、ほぼ元の色 (表示できる範囲の色)', () => {
    for (const c of [{ l: 0.7, c: 0.1, h: 30 }, { l: 0.5, c: 0.12, h: 250 }, { l: 0.85, c: 0.08, h: 150 }]) {
      const back = rgbToOklch(toRgb(c));
      expect(back.l).toBeCloseTo(c.l, 1);
      expect(back.c).toBeCloseTo(c.c, 1);
      expect(Math.abs(hueDiff(back.h, c.h))).toBeLessThan(4);
    }
  });

  it('表示できない鮮やかさでも、鮮やかさを下げて表示できる色にする (0〜255に収まる)', () => {
    for (const rgb of [toRgb({ l: 0.9, c: 0.4, h: 260 }), toRgb({ l: 0.2, c: 0.4, h: 100 })]) {
      for (const v of rgb) expect(v >= 0 && v <= 255).toBe(true);
    }
  });

  it('真っ黒・真っ白にならない (どんなに暗く・明るくしても、濃い色・オフホワイト)', () => {
    expect(toRgb({ l: 0, c: 0, h: 0 })).not.toEqual([0, 0, 0]);
    expect(toRgb({ l: 1, c: 0, h: 0 })).not.toEqual([255, 255, 255]);
    expect(Math.max(...toRgb({ l: 1.5, c: 0, h: 0 }))).toBeLessThan(255);
    expect(Math.min(...toRgb({ l: -1, c: 0, h: 0 }))).toBeGreaterThan(0);
  });
});

describe('shade (色相シフト)', () => {
  it('暗くすると赤紫(300°)の方へ、明るくすると黄色(90°)の方へ、色相がずれる', () => {
    const brown: Oklch = { l: 0.5, c: 0.08, h: 55 }; // 茶色
    const dark = shade(brown, -0.15), light = shade(brown, 0.12);
    expect(dark.l).toBeCloseTo(0.35); expect(light.l).toBeCloseTo(0.62);
    // 茶色(55°)は 300° へは「下がる向き」(55 → 0 → 300) が近い
    expect(hueDiff(dark.h, 55)).toBeLessThan(0);
    // 黄色(90°)へは「上がる向き」
    expect(hueDiff(light.h, 55)).toBeGreaterThan(0);
  });

  it('青い色は、影で紫寄り(300°の方)になる', () => {
    const blue: Oklch = { l: 0.55, c: 0.12, h: 250 };
    expect(hueDiff(shade(blue, -0.15).h, 250)).toBeGreaterThan(0); // 250 → 300 へ
  });

  it('色相の動きは、ずれすぎない (1段階で15°まで)。目標の色相を通り過ぎない', () => {
    for (const h of [0, 60, 120, 200, 280, 330]) {
      for (const dl of [-0.17, -0.085, 0.07, 0.13]) {
        expect(Math.abs(hueDiff(shade({ l: 0.5, c: 0.1, h }, dl).h, h))).toBeLessThanOrEqual(15.0001);
      }
    }
    expect(shade({ l: 0.5, c: 0.1, h: 295 }, -0.17).h).toBeCloseTo(300, 5); // 届いたら止まる
    expect(shade({ l: 0.5, c: 0.1, h: 92 }, 0.13).h).toBeCloseTo(90, 5);
  });

  it('dl = 0 は同じ色。暗くすると少し鮮やかに、明るくすると少し淡くなる', () => {
    const c: Oklch = { l: 0.5, c: 0.1, h: 100 };
    expect(shade(c, 0)).toEqual(c);
    expect(shade(c, -0.1).c).toBeGreaterThan(c.c);
    expect(shade(c, 0.1).c).toBeLessThan(c.c);
  });
});

describe('makeRamp (素材の色の段階)', () => {
  const base: Oklch = { l: 0.6, c: 0.1, h: 30 };

  it('5色で、暗い → 明るい の順 (明るさが単調に増える)', () => {
    const ramp = makeRamp(base);
    expect(ramp).toHaveLength(RAMP_SIZE);
    const lights = ramp.map(c => rgbToOklch(c).l);
    for (let i = 1; i < lights.length; i++) expect(lights[i], `段階${i}`).toBeGreaterThan(lights[i - 1]);
  });

  it('真ん中が基本の色', () => {
    expect(makeRamp(base)[RAMP_BASE]).toEqual(toRgb(base));
  });

  it('隣り合う段階は、はっきり違う色だが、離れすぎない (明るさの差が 0.04〜0.12)', () => {
    const lights = makeRamp(base).map(c => rgbToOklch(c).l);
    for (let i = 1; i < lights.length; i++) {
      const d = lights[i] - lights[i - 1];
      expect(d).toBeGreaterThan(0.04); expect(d).toBeLessThan(0.12);
    }
  });

  it('ほぼ黒・ほぼ白の素材でも、真っ黒・真っ白は含まない', () => {
    for (const color of [{ l: 0.17, c: 0.01, h: 270 }, { l: 0.96, c: 0.005, h: 90 }]) {
      for (const [r, g, b] of makeRamp(color)) {
        expect(r + g + b).toBeGreaterThan(0);
        expect(r + g + b).toBeLessThan(765);
      }
    }
  });
});
