import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFrontArrow } from './frontArrow';

// 矢印の頂点を、3D空間での位置にして取り出す
function worldVertices() {
  const arrow = createFrontArrow();
  arrow.updateMatrixWorld();
  const pos = arrow.geometry.attributes.position;
  return Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(arrow.matrixWorld));
}

describe('正面の矢印', () => {
  it('地面(足の裏の高さ)に寝ている', () => {
    for (const v of worldVertices()) expect(v.y).toBeCloseTo(0.05);
  });

  it('つま先より前にあり、先端は +z (顔が向いている方向) の中央', () => {
    const vertices = worldVertices();
    for (const v of vertices) expect(v.z).toBeGreaterThan(2.25); // 上着込みのつま先は z=2.25
    const tip = vertices.reduce((a, b) => (b.z > a.z ? b : a));
    expect(Math.abs(tip.x)).toBeLessThanOrEqual(0.5);
    expect(tip.z).toBeCloseTo(10); // 3 + 矢印の長さ7
  });
});
