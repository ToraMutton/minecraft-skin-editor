import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { focusOn, HOME_DISTANCE } from './camera';
import { createPartGeometries } from './createSkinModel';
import { getLayout } from '../skin/layout';

const CLASSIC = getLayout('classic');

// アプリと同じ形・位置のパーツ (上着の層は子として付ける)
function partMeshes() {
  return Object.fromEntries(createPartGeometries(CLASSIC).map(g => {
    const mesh = new THREE.Mesh(g.base);
    mesh.position.copy(g.position);
    mesh.add(new THREE.Mesh(g.over));
    mesh.updateMatrixWorld();
    return [g.name, mesh];
  }));
}

describe('focusOn', () => {
  it('頭だけなら、頭の中心(上着込み)を注視点にして近づく', () => {
    const { head } = partMeshes();
    const { center, distance } = focusOn([head]);
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(28); // 頭は y=24〜32
    expect(center.z).toBeCloseTo(0);
    expect(distance).toBeCloseTo(9 * 1.8 + 15); // 上着の箱は9×9×9
  });

  it('全身を指定しても、全身表示の距離より遠くには引かない', () => {
    const { distance } = focusOn(Object.values(partMeshes()));
    expect(distance).toBe(HOME_DISTANCE);
  });

  it('右腕と右足なら、その2つの間を注視点にする', () => {
    const { rightArm, rightLeg } = partMeshes();
    const { center } = focusOn([rightArm, rightLeg]);
    expect(center.x).toBeLessThan(0); // 右側(-x)に寄る
  });
});
