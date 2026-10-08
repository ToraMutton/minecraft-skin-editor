import { describe, it, expect } from 'vitest';
import { convertLayers } from './convert';
import { getLayout } from './layout';
import { createLayers, cloneLayers, SKIN_SIZE } from '../canvas/layers';
import type { SkinLayers } from '../canvas/layers';
import { createStarterPixels } from './starter';
import type { PartUV } from './uv';

const CLASSIC = getLayout('classic');
const SLIM = getLayout('slim');
const px = (x: number, y: number) => y * SKIN_SIZE + x;

// 展開図の面(のうち使われる所)すべてに、場所ごとに違う値を入れた層 (どのピクセルがどこへ動いたか追えるように)
function fillDistinct(layout: typeof CLASSIC): SkinLayers {
  const layers = createLayers();
  let n = 0;
  for (const table of [layout.uv, layout.uvOver]) {
    for (const uv of Object.values(table)) {
      for (const f of Object.values(uv)) {
        for (let y = f.v; y < f.v + f.h; y++) {
          for (let x = f.u; x < f.u + f.w; x++) {
            n++;
            layers.base.set([n % 251 + 1, 10, 20, 255], px(x, y) * 4);
            layers.paint.set([30, n % 241 + 1, 40, n % 2 ? 255 : 0], px(x, y) * 4);
            layers.erased[px(x, y)] = n % 3 === 0 ? 1 : 0;
          }
        }
      }
    }
  }
  return layers;
}

const pixelOf = (l: SkinLayers, x: number, y: number) => [...l.base.subarray(px(x, y) * 4, px(x, y) * 4 + 4), ...l.paint.subarray(px(x, y) * 4, px(x, y) * 4 + 4), l.erased[px(x, y)]];

// 腕の領域のピクセル座標の集合
function armPixels(layout: typeof CLASSIC): Set<number> {
  const set = new Set<number>();
  for (const table of [layout.uv, layout.uvOver]) {
    for (const part of ['rightArm', 'leftArm']) {
      for (const f of Object.values(table[part] as PartUV)) {
        for (let y = f.v; y < f.v + f.h; y++) for (let x = f.u; x < f.u + f.w; x++) set.add(px(x, y));
      }
    }
  }
  return set;
}

describe('convertLayers (Classic ⇄ Slim)', () => {
  it('元の層は書き換えない。同じモデルへの変換は、そのままの複製', () => {
    const original = fillDistinct(CLASSIC);
    const snapshot = cloneLayers(original);
    convertLayers(original, CLASSIC, SLIM);
    expect(original).toEqual(snapshot);
    const same = convertLayers(original, CLASSIC, CLASSIC);
    expect(same).toEqual(original);
    expect(same).not.toBe(original);
  });

  it('頭・胴・脚(腕以外)は、1ピクセルも変わらない (Classic → Slim も Slim → Classic も)', () => {
    const classic = fillDistinct(CLASSIC);
    const slim = fillDistinct(SLIM);
    const arms = new Set([...armPixels(CLASSIC), ...armPixels(SLIM)]);
    for (const [src, from, to] of [[classic, CLASSIC, SLIM], [slim, SLIM, CLASSIC]] as const) {
      const out = convertLayers(src, from, to);
      for (let p = 0; p < SKIN_SIZE * SKIN_SIZE; p++) {
        if (arms.has(p)) continue;
        expect(pixelOf(out, p % SKIN_SIZE, Math.floor(p / SKIN_SIZE)), `(${p % SKIN_SIZE},${Math.floor(p / SKIN_SIZE)})`).toEqual(pixelOf(src, p % SKIN_SIZE, Math.floor(p / SKIN_SIZE)));
      }
    }
  });

  it('Classic → Slim: 右腕の正面は、外側(左端)の1列を捨てて、残りが左に詰まる', () => {
    const src = fillDistinct(CLASSIC);
    const out = convertLayers(src, CLASSIC, SLIM);
    for (let y = 0; y < 12; y++) {
      // Classic の正面 x=44〜47 (外側が44) → Slim の正面 x=44〜46。45,46,47 → 44,45,46
      expect(pixelOf(out, 44, 20 + y)).toEqual(pixelOf(src, 45, 20 + y));
      expect(pixelOf(out, 45, 20 + y)).toEqual(pixelOf(src, 46, 20 + y));
      expect(pixelOf(out, 46, 20 + y)).toEqual(pixelOf(src, 47, 20 + y));
    }
  });

  it('Classic → Slim: 左腕の正面は、外側(右端)の1列を捨てる。内側(左端)はそのまま', () => {
    const src = fillDistinct(CLASSIC);
    const out = convertLayers(src, CLASSIC, SLIM);
    // Classic の左腕の正面 x=36〜39 (外側が39) → Slim の x=36〜38。36,37,38 → 36,37,38
    for (let y = 0; y < 12; y++) for (let x = 0; x < 3; x++) expect(pixelOf(out, 36 + x, 52 + y)).toEqual(pixelOf(src, 36 + x, 52 + y));
  });

  it('Classic → Slim: 背面は、外側(右腕なら右端)を捨てる', () => {
    const src = fillDistinct(CLASSIC);
    const out = convertLayers(src, CLASSIC, SLIM);
    // 右腕の背面: Classic x=52〜55 (外側が右端55) → Slim x=51〜53。52,53,54 → 51,52,53
    for (let y = 0; y < 12; y++) for (let x = 0; x < 3; x++) expect(pixelOf(out, 51 + x, 20 + y)).toEqual(pixelOf(src, 52 + x, 20 + y));
  });

  it('側面(奥行き4)は、場所が変わるだけで、絵はそのまま', () => {
    const src = fillDistinct(CLASSIC);
    const out = convertLayers(src, CLASSIC, SLIM);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 4; x++) {
        expect(pixelOf(out, 40 + x, 20 + y)).toEqual(pixelOf(src, 40 + x, 20 + y)); // 右腕の外側面 (場所も同じ)
        expect(pixelOf(out, 47 + x, 20 + y)).toEqual(pixelOf(src, 48 + x, 20 + y)); // 右腕の内側面: Classic x=48〜51 → Slim x=47〜50
      }
    }
  });

  it('Classic → Slim: Slim で使わなくなった場所は、空になる (絵の残骸が残らない)', () => {
    const out = convertLayers(fillDistinct(CLASSIC), CLASSIC, SLIM);
    const used = armPixels(SLIM);
    for (const p of armPixels(CLASSIC)) {
      if (used.has(p)) continue;
      expect(pixelOf(out, p % SKIN_SIZE, Math.floor(p / SKIN_SIZE)), `(${p % SKIN_SIZE},${Math.floor(p / SKIN_SIZE)})`).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it('Slim → Classic: 外側の列を複製して足す (右腕の正面は、左端が2列になる)', () => {
    const src = fillDistinct(SLIM);
    const out = convertLayers(src, SLIM, CLASSIC);
    for (let y = 0; y < 12; y++) {
      expect(pixelOf(out, 44, 20 + y)).toEqual(pixelOf(src, 44, 20 + y));
      expect(pixelOf(out, 45, 20 + y)).toEqual(pixelOf(src, 44, 20 + y)); // 複製
      expect(pixelOf(out, 46, 20 + y)).toEqual(pixelOf(src, 45, 20 + y));
      expect(pixelOf(out, 47, 20 + y)).toEqual(pixelOf(src, 46, 20 + y));
    }
  });

  it('Slim → Classic: 左腕の正面は、右端(外側)が複製される', () => {
    const src = fillDistinct(SLIM);
    const out = convertLayers(src, SLIM, CLASSIC);
    for (let y = 0; y < 12; y++) {
      expect(pixelOf(out, 38, 52 + y)).toEqual(pixelOf(src, 38, 52 + y));
      expect(pixelOf(out, 39, 52 + y)).toEqual(pixelOf(src, 38, 52 + y)); // 複製
    }
  });

  it('Slim → Classic → Slim は、元の絵にぴったり戻る (3層すべて、上着も)', () => {
    const slim = fillDistinct(SLIM);
    const back = convertLayers(convertLayers(slim, SLIM, CLASSIC), CLASSIC, SLIM);
    expect(back).toEqual(slim);
  });

  it('Classic → Slim → Classic は、外側の1列だけ失われ、残りは同じ (内側の3列は変わらない)', () => {
    const classic = fillDistinct(CLASSIC);
    const back = convertLayers(convertLayers(classic, CLASSIC, SLIM), SLIM, CLASSIC);
    expect(back).not.toEqual(classic); // 捨てた列は戻らない
    for (let y = 0; y < 12; y++) {
      // 右腕の正面: 外側(44)は失われ、45〜47 が残る (44は45の複製になる)
      for (const x of [45, 46, 47]) expect(pixelOf(back, x, 20 + y)).toEqual(pixelOf(classic, x, 20 + y));
      expect(pixelOf(back, 44, 20 + y)).toEqual(pixelOf(classic, 45, 20 + y));
    }
  });

  it('素体は、変換すると Slim の素体と同じ見た目になる (腕の色が同じ縞で、幅3)', () => {
    const classicStarter = createLayers(createStarterPixels(CLASSIC));
    const converted = convertLayers(classicStarter, CLASSIC, SLIM);
    expect(converted.base).toEqual(createStarterPixels(SLIM));
  });

  it('下地・手描き・消去マスクを、それぞれ同じ規則で動かす (消去マスクだけ・手描きだけの印も追従する)', () => {
    const src = createLayers();
    src.erased[px(47, 25)] = 1; // Classic 右腕の正面の内側の端
    src.paint.set([1, 2, 3, 255], px(44, 25) * 4); // 外側の端 (Slim では捨てられる)
    const out = convertLayers(src, CLASSIC, SLIM);
    expect(out.erased[px(46, 25)]).toBe(1); // 内側の端は Slim の正面の内側の端へ
    expect(out.erased[px(47, 25)]).toBe(0); // 元の場所は空
    expect([...out.paint.subarray(px(44, 25) * 4, px(44, 25) * 4 + 4)]).toEqual([0, 0, 0, 0]); // 外側の絵は消える
  });
});
