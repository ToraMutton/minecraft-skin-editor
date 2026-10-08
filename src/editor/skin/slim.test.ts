import { describe, it, expect } from 'vitest';
import { SKIN_UV, SKIN_UV_OVER, boxUV, armsUV } from './uv';
import { CLASSIC_ARM_MAPPINGS, armMappings, getMirrorCoord } from './mirror';
import { faceAt } from './faces';
import { getLayout } from './layout';

const CLASSIC = getLayout('classic');
const SLIM = getLayout('slim');

describe('箱の展開図の生成 (boxUV / armsUV)', () => {
  it('Classic の腕 (幅4) を生成すると、手書きの表とまったく同じになる', () => {
    expect(armsUV(4).base).toEqual({ rightArm: SKIN_UV.rightArm, leftArm: SKIN_UV.leftArm });
    expect(armsUV(4).over).toEqual({ rightArm: SKIN_UV_OVER.rightArm, leftArm: SKIN_UV_OVER.leftArm });
  });

  it('頭・胴・脚も、同じ規則で生成した展開図と一致する (規則そのものが正しい)', () => {
    expect(boxUV(0, 0, 8, 8, 8)).toEqual(SKIN_UV.head);
    expect(boxUV(16, 16, 8, 12, 4)).toEqual(SKIN_UV.body);
    expect(boxUV(0, 16, 4, 12, 4)).toEqual(SKIN_UV.rightLeg);
    expect(boxUV(16, 48, 4, 12, 4)).toEqual(SKIN_UV.leftLeg);
  });
});

// 正解の値は skinview3d の setSkinUVs (slim の腕: 幅3) と同じ。生成関数を使わず、数字を直接書いておく
describe('Slim の展開図 (skinview3d と照合した値)', () => {
  it('右腕 (素の層)', () => {
    expect(SLIM.uv.rightArm).toEqual({
      right: { u: 40, v: 20, w: 4, h: 12 }, front: { u: 44, v: 20, w: 3, h: 12 },
      left: { u: 47, v: 20, w: 4, h: 12 }, back: { u: 51, v: 20, w: 3, h: 12 },
      top: { u: 44, v: 16, w: 3, h: 4 }, bottom: { u: 47, v: 16, w: 3, h: 4 },
    });
  });

  it('左腕 (素の層)', () => {
    expect(SLIM.uv.leftArm).toEqual({
      right: { u: 32, v: 52, w: 4, h: 12 }, front: { u: 36, v: 52, w: 3, h: 12 },
      left: { u: 39, v: 52, w: 4, h: 12 }, back: { u: 43, v: 52, w: 3, h: 12 },
      top: { u: 36, v: 48, w: 3, h: 4 }, bottom: { u: 39, v: 48, w: 3, h: 4 },
    });
  });

  it('右腕・左腕 (上着の層)', () => {
    expect(SLIM.uvOver.rightArm.front).toEqual({ u: 44, v: 36, w: 3, h: 12 });
    expect(SLIM.uvOver.rightArm.back).toEqual({ u: 51, v: 36, w: 3, h: 12 });
    expect(SLIM.uvOver.rightArm.top).toEqual({ u: 44, v: 32, w: 3, h: 4 });
    expect(SLIM.uvOver.leftArm.front).toEqual({ u: 52, v: 52, w: 3, h: 12 });
    expect(SLIM.uvOver.leftArm.back).toEqual({ u: 59, v: 52, w: 3, h: 12 });
    expect(SLIM.uvOver.leftArm.top).toEqual({ u: 52, v: 48, w: 3, h: 4 });
  });

  it('腕以外 (頭・胴・脚) は Classic と同じ', () => {
    for (const part of ['head', 'body', 'rightLeg', 'leftLeg']) {
      expect(SLIM.uv[part], part).toEqual(CLASSIC.uv[part]);
      expect(SLIM.uvOver[part], part).toEqual(CLASSIC.uvOver[part]);
    }
  });

  it('Slim の腕では、Classic の腕の「余りの1列」は面の外になる', () => {
    // 右腕の背面は Classic では x=52..55、Slim では x=51..53。x=55 は Classic だけ、x=51 は Slim だけの面
    expect(faceAt(CLASSIC, 55, 20)).not.toBeNull();
    expect(faceAt(SLIM, 55, 20)).toBeNull();
    expect(faceAt(SLIM, 51, 20)).toMatchObject({ u: 51, w: 3 });
    expect(faceAt(CLASSIC, 51, 20)).toMatchObject({ u: 48, w: 4 }); // Classic では、左側面の一部
  });

  it('面の数は Classic と同じ (72面)', () => {
    expect(SLIM.faceRects).toHaveLength(72);
  });
});

describe('ミラー対応表の生成 (armMappings)', () => {
  it('Classic の腕 (幅4) を生成すると、手書きの対応表とまったく同じになる', () => {
    expect(armMappings(4)).toEqual(CLASSIC_ARM_MAPPINGS);
  });

  it('Slim の腕: 正面は幅3同士、側面は幅4同士で結ばれる', () => {
    const arms = armMappings(3);
    expect(arms).toContainEqual({ x1: 44, y1: 20, w: 3, h: 12, x2: 36, y2: 52 }); // 正面 ↔ 正面
    expect(arms).toContainEqual({ x1: 40, y1: 20, w: 4, h: 12, x2: 39, y2: 52 }); // 右腕の外側 ↔ 左腕の外側
    expect(arms).toContainEqual({ x1: 47, y1: 20, w: 4, h: 12, x2: 32, y2: 52 }); // 右腕の内側 ↔ 左腕の内側
    expect(arms).toHaveLength(12);
  });

  it('Slim: 右腕の正面の左端のピクセルは、左腕の正面の右端に写る (左右反転)', () => {
    expect(getMirrorCoord(SLIM, 44, 20)).toEqual([38, 52]);
    expect(getMirrorCoord(SLIM, 46, 31)).toEqual([36, 63]);
  });

  it('Slim: 頭・胴・脚のミラーは Classic と同じ', () => {
    for (const [x, y] of [[10, 10], [22, 25], [6, 22], [18, 54]] as const) {
      expect(getMirrorCoord(SLIM, x, y), `(${x},${y})`).toEqual(getMirrorCoord(CLASSIC, x, y));
    }
  });
});
