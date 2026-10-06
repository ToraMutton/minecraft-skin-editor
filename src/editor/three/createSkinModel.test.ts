import { describe, it, expect } from 'vitest';
import { createPartGeometries } from './createSkinModel';
import { SKIN_UV } from '../skin/uv';

describe('パーツの形', () => {
  it('6パーツがそろっている', () => {
    expect(createPartGeometries().map(g => g.name))
      .toEqual(['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']);
  });

  // 箱の大きさ(幅・高さ・奥行き)と、展開図の面の大きさ(前面の幅・高さ、側面の幅)は一致するはず
  it('素の層の箱の大きさが、展開図の面の大きさと一致する', () => {
    for (const g of createPartGeometries()) {
      const uv = SKIN_UV[g.name];
      expect(g.base.parameters, g.name).toMatchObject({ width: uv.front.w, height: uv.front.h, depth: uv.right.w });
    }
  });

  it('上着の層の箱は、素の層より一回り大きい', () => {
    for (const g of createPartGeometries()) {
      expect(g.over.parameters.width, g.name).toBeGreaterThan(g.base.parameters.width);
      expect(g.over.parameters.height, g.name).toBeGreaterThan(g.base.parameters.height);
      expect(g.over.parameters.depth, g.name).toBeGreaterThan(g.base.parameters.depth);
    }
  });

  it('右腕・右足は画面で見て左(-x)、左腕・左足は右(+x)にある', () => {
    const at = Object.fromEntries(createPartGeometries().map(g => [g.name, g.position.x]));
    expect(at.rightArm).toBeLessThan(0);
    expect(at.rightLeg).toBeLessThan(0);
    expect(at.leftArm).toBeGreaterThan(0);
    expect(at.leftLeg).toBeGreaterThan(0);
  });
});
