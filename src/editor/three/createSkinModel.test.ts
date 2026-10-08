import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPartGeometries, applyLayout } from './createSkinModel';
import type { SkinPart } from './createSkinModel';
import { SKIN_UV } from '../skin/uv';
import { getLayout } from '../skin/layout';

const CLASSIC = getLayout('classic');

describe('パーツの形', () => {
  it('6パーツがそろっている', () => {
    expect(createPartGeometries(CLASSIC).map(g => g.name))
      .toEqual(['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']);
  });

  // 箱の大きさ(幅・高さ・奥行き)と、展開図の面の大きさ(前面の幅・高さ、側面の幅)は一致するはず
  it('素の層の箱の大きさが、展開図の面の大きさと一致する', () => {
    for (const g of createPartGeometries(CLASSIC)) {
      const uv = SKIN_UV[g.name];
      expect(g.base.parameters, g.name).toMatchObject({ width: uv.front.w, height: uv.front.h, depth: uv.right.w });
    }
  });

  it('上着の層の箱は、素の層より一回り大きい', () => {
    for (const g of createPartGeometries(CLASSIC)) {
      expect(g.over.parameters.width, g.name).toBeGreaterThan(g.base.parameters.width);
      expect(g.over.parameters.height, g.name).toBeGreaterThan(g.base.parameters.height);
      expect(g.over.parameters.depth, g.name).toBeGreaterThan(g.base.parameters.depth);
    }
  });

  it('右腕・右足は画面で見て左(-x)、左腕・左足は右(+x)にある', () => {
    const at = Object.fromEntries(createPartGeometries(CLASSIC).map(g => [g.name, g.position.x]));
    expect(at.rightArm).toBeLessThan(0);
    expect(at.rightLeg).toBeLessThan(0);
    expect(at.leftArm).toBeGreaterThan(0);
    expect(at.leftLeg).toBeGreaterThan(0);
  });
});

describe.each(['classic', 'slim'] as const)('腕の形 (%s)', model => {
  const layout = getLayout(model);
  const armWidth = model === 'slim' ? 3 : 4;
  const geometries = () => Object.fromEntries(createPartGeometries(layout).map(g => [g.name, g]));

  it(`腕の幅は ${armWidth}、上着は 0.5 だけ太い。足はどちらのモデルでも幅4`, () => {
    const g = geometries();
    for (const arm of ['rightArm', 'leftArm']) {
      expect(g[arm].base.parameters.width, arm).toBe(armWidth);
      expect(g[arm].over.parameters.width, arm).toBe(armWidth + 0.5);
    }
    expect(g.rightLeg.base.parameters.width).toBe(4);
    expect(g.leftLeg.base.parameters.width).toBe(4);
  });

  it('腕は胴体(幅8)の横にぴったり付く (すき間も、めり込みもない)', () => {
    const g = geometries();
    const right = g.rightArm.position.x + armWidth / 2; // 右腕の、胴体側の端
    const left = g.leftArm.position.x - armWidth / 2;
    expect(right).toBe(-4);
    expect(left).toBe(4);
  });

  it('腕の上端(肩)は、胴体の上端と同じ高さ', () => {
    const g = geometries();
    const bodyTop = g.body.position.y + 6;
    expect(g.rightArm.position.y).toBe(bodyTop);
    expect(g.leftArm.position.y).toBe(bodyTop);
  });
});

describe('applyLayout (作品のモデルが変わったとき)', () => {
  // 3D表示を作らずに、パーツのメッシュだけで確かめる (グリッド・ホバーも同じジオメトリを共有している)
  const makeParts = (layout: ReturnType<typeof getLayout>): SkinPart[] =>
    createPartGeometries(layout).map(g => {
      const mesh = new THREE.Mesh(g.base); mesh.position.copy(g.position);
      const overlay = new THREE.Mesh(g.over);
      return {
        name: g.name, mesh, overlay,
        baseGrid: new THREE.Mesh(g.base), overlayGrid: new THREE.Mesh(g.over),
        baseHover: new THREE.Mesh(g.base), overlayHover: new THREE.Mesh(g.over),
      };
    });
  const widthOf = (mesh: THREE.Mesh) => (mesh.geometry as THREE.BoxGeometry).parameters.width;
  const arm = (parts: SkinPart[]) => parts.find(p => p.name === 'rightArm')!;

  it('Classic → Slim で、腕の素の層・上着・グリッド・ホバーのすべてが細くなり、位置も変わる', () => {
    const parts = makeParts(getLayout('classic'));
    applyLayout(parts, getLayout('slim'));
    const a = arm(parts);
    for (const mesh of [a.mesh, a.baseGrid, a.baseHover]) expect(widthOf(mesh)).toBe(3);
    for (const mesh of [a.overlay, a.overlayGrid, a.overlayHover]) expect(widthOf(mesh)).toBe(3.5);
    expect(a.mesh.position.x).toBe(-5.5);
  });

  it('Slim → Classic に戻すと、元の太さと位置に戻る', () => {
    const parts = makeParts(getLayout('slim'));
    applyLayout(parts, getLayout('classic'));
    expect(widthOf(arm(parts).mesh)).toBe(4);
    expect(arm(parts).mesh.position.x).toBe(-6);
  });

  it('古いジオメトリは破棄される (GPUのメモリを使い続けない)', () => {
    const parts = makeParts(getLayout('classic'));
    const old = arm(parts).mesh.geometry;
    let disposed = false;
    old.addEventListener('dispose', () => { disposed = true; });
    applyLayout(parts, getLayout('slim'));
    expect(disposed).toBe(true);
  });
});
