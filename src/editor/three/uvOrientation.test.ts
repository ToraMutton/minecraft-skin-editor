import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickTexel } from './raycast';
import { createPartGeometries } from './createSkinModel';
import type { PartName } from './createSkinModel';
import { getLayout } from '../skin/layout';

const CLASSIC = getLayout('classic');

// 3Dモデルの各面に、展開図のどこがどの向きで貼られているかを確かめる
// 正解はMinecraft本体と同じ対応 (skinview3d の setUVs と同じ)。
// キャラクターは +z を向いていて、右腕は -x 側にある

const RECT = { left: 0, top: 0, width: 800, height: 600 };

// パーツの表面の点 point を、その面の外側 (normal の方向) から見てクリックしたときのピクセル
function texelAt(partName: PartName, point: [number, number, number], normal: [number, number, number], layout = CLASSIC) {
  const part = createPartGeometries(layout).find(g => g.name === partName)!;
  const mesh = new THREE.Mesh(part.base);
  mesh.position.copy(part.position);
  mesh.updateMatrixWorld();

  const target = new THREE.Vector3(...point);
  const camera = new THREE.PerspectiveCamera(35, RECT.width / RECT.height, 0.1, 200);
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...normal), 60);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  const p = target.clone().project(camera);
  const x = ((p.x + 1) / 2) * RECT.width;
  const y = ((1 - p.y) / 2) * RECT.height;
  return pickTexel(x, y, RECT, camera, [mesh]);
}

// 頭は x=-4〜4, y=24〜32, z=-4〜4 の箱。各点はピクセルの中心を狙う
describe('頭の各面の向き', () => {
  it('正面: 右側(-x)の端が展開図の x=8、左側(+x)の端が x=15', () => {
    expect(texelAt('head', [-3.5, 27.5, 4], [0, 0, 1])).toEqual([8, 12]);
    expect(texelAt('head', [3.5, 27.5, 4], [0, 0, 1])).toEqual([15, 12]);
  });

  it('キャラの右側面(-x)には展開図の 0〜7 列。後ろ寄りが 0、前寄りが 7', () => {
    expect(texelAt('head', [-4, 27.5, -3.5], [-1, 0, 0])).toEqual([0, 12]);
    expect(texelAt('head', [-4, 27.5, 3.5], [-1, 0, 0])).toEqual([7, 12]);
  });

  it('キャラの左側面(+x)には展開図の 16〜23 列。前寄りが 16、後ろ寄りが 23', () => {
    expect(texelAt('head', [4, 27.5, 3.5], [1, 0, 0])).toEqual([16, 12]);
    expect(texelAt('head', [4, 27.5, -3.5], [1, 0, 0])).toEqual([23, 12]);
  });

  it('背面: 左側(+x)の端が展開図の x=24、右側(-x)の端が x=31', () => {
    expect(texelAt('head', [3.5, 27.5, -4], [0, 0, -1])).toEqual([24, 12]);
    expect(texelAt('head', [-3.5, 27.5, -4], [0, 0, -1])).toEqual([31, 12]);
  });

  it('上面: 右後ろの角が (8, 0)、左前の角が (15, 7)', () => {
    expect(texelAt('head', [-3.5, 32, -3.5], [0, 1, 0])).toEqual([8, 0]);
    expect(texelAt('head', [3.5, 32, 3.5], [0, 1, 0])).toEqual([15, 7]);
  });

  it('底面: 右前の角が (16, 7)、左後ろの角が (23, 0)', () => {
    expect(texelAt('head', [-3.5, 24, 3.5], [0, -1, 0])).toEqual([16, 7]);
    expect(texelAt('head', [3.5, 24, -3.5], [0, -1, 0])).toEqual([23, 0]);
  });
});

// 右腕は x=-8〜-4, y=12〜24, z=-2〜2 の箱
describe('右腕の向き', () => {
  it('外側(-x)には展開図の 40〜43 列 (右腕の「右」の面)', () => {
    expect(texelAt('rightArm', [-8, 18.5, -1.5], [-1, 0, 0])).toEqual([40, 25]);
    expect(texelAt('rightArm', [-8, 18.5, 1.5], [-1, 0, 0])).toEqual([43, 25]);
  });

  it('内側(+x, 胴体側)には展開図の 48〜51 列 (右腕の「左」の面)', () => {
    expect(texelAt('rightArm', [-4, 18.5, 1.5], [1, 0, 0])).toEqual([48, 25]);
  });
});

// Slim の右腕は幅3: x=-7〜-4 の箱 (肩は胴体に接したまま、外側に1px狭い)
describe('Slim の右腕の向き', () => {
  const SLIM = getLayout('slim');
  const at = (point: [number, number, number], normal: [number, number, number]) => texelAt('rightArm', point, normal, SLIM);

  it('正面: 外側(-x)の端が展開図の x=44、内側(+x)の端が x=46 (幅3)', () => {
    expect(at([-6.5, 18.5, 2], [0, 0, 1])).toEqual([44, 25]);
    expect(at([-4.5, 18.5, 2], [0, 0, 1])).toEqual([46, 25]);
  });

  it('背面: 内側(+x)の端が x=51、外側(-x)の端が x=53 (幅3)', () => {
    expect(at([-4.5, 18.5, -2], [0, 0, -1])).toEqual([51, 25]);
    expect(at([-6.5, 18.5, -2], [0, 0, -1])).toEqual([53, 25]);
  });

  it('外側(-x)は 40〜43 列、内側(+x, 胴体側)は 47〜50 列 (側面は幅4のまま)', () => {
    expect(at([-7, 18.5, -1.5], [-1, 0, 0])).toEqual([40, 25]);
    expect(at([-7, 18.5, 1.5], [-1, 0, 0])).toEqual([43, 25]);
    expect(at([-4, 18.5, -1.5], [1, 0, 0])).toEqual([50, 25]);
    expect(at([-4, 18.5, 1.5], [1, 0, 0])).toEqual([47, 25]);
  });

  it('上面: 外側後ろの角が (44, 16)、内側前の角が (46, 19)', () => {
    expect(at([-6.5, 24, -1.5], [0, 1, 0])).toEqual([44, 16]);
    expect(at([-4.5, 24, 1.5], [0, 1, 0])).toEqual([46, 19]);
  });
});
