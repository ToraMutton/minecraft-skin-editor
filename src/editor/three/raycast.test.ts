import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { uvToTexel, pickTexel } from './raycast';
import { createPartGeometries } from './createSkinModel';

const RECT = { left: 0, top: 0, width: 800, height: 600 };

// アプリの初期状態と同じ位置・画角のカメラ (正面から見る)
function frontCamera() {
  const camera = new THREE.PerspectiveCamera(35, RECT.width / RECT.height, 0.1, 100);
  camera.position.set(0, 16, 60);
  camera.lookAt(0, 16, 0);
  camera.updateMatrixWorld();
  return camera;
}

// 3D空間の点が、画面上のどこに映るか
function toScreen(point: THREE.Vector3, camera: THREE.Camera): [number, number] {
  const p = point.clone().project(camera);
  return [RECT.left + ((p.x + 1) / 2) * RECT.width, RECT.top + ((1 - p.y) / 2) * RECT.height];
}

// アプリと同じ形・位置の頭 (素の層と上着の層)
function headMeshes() {
  const head = createPartGeometries().find(g => g.name === 'head')!;
  const base = new THREE.Mesh(head.base);
  const over = new THREE.Mesh(head.over);
  for (const mesh of [base, over]) {
    mesh.position.copy(head.position);
    mesh.updateMatrixWorld();
  }
  return { base, over };
}

describe('uvToTexel', () => {
  it('UVの左上(0,1)はピクセル(0,0)、右下に近い所は(63,63)', () => {
    expect(uvToTexel({ x: 0, y: 1 })).toEqual([0, 0]);
    expect(uvToTexel({ x: 0.999, y: 0.001 })).toEqual([63, 63]);
  });

  it('ちょうど端(1.0)でも64にならない', () => {
    expect(uvToTexel({ x: 1, y: 0 })).toEqual([63, 63]);
  });
});

describe('pickTexel', () => {
  // 頭は y=24〜32、正面は z=4 の面。正面のテクスチャは展開図の (8〜15, 8〜15)
  // 1ピクセル = 1単位。境界線の上をクリックすると誤差でどちらに転ぶか分からないので、ピクセルの中心を狙う
  it('頭の正面の、画面で見て左端寄り・高さの真ん中 → (8, 12)', () => {
    const camera = frontCamera();
    const { base } = headMeshes();
    const [x, y] = toScreen(new THREE.Vector3(-3.5, 27.5, 4), camera);
    expect(pickTexel(x, y, RECT, camera, [base])).toEqual([8, 12]);
  });

  it('頭の正面の、画面で見て右端寄り → (15, 12)', () => {
    const camera = frontCamera();
    const { base } = headMeshes();
    const [x, y] = toScreen(new THREE.Vector3(3.5, 27.5, 4), camera);
    expect(pickTexel(x, y, RECT, camera, [base])).toEqual([15, 12]);
  });

  it('上着の層を対象にすると、上着側のテクスチャ (40〜47, 8〜15) に当たる', () => {
    const camera = frontCamera();
    const { over } = headMeshes(); // 9×9×9 の箱(y=23.5〜32.5)なので、正面は z=4.5、1ピクセル = 1.125単位
    const [x, y] = toScreen(new THREE.Vector3(-4, 27.4, 4.5), camera);
    expect(pickTexel(x, y, RECT, camera, [over])).toEqual([40, 12]);
  });

  it('何もない所では null', () => {
    const camera = frontCamera();
    const { base } = headMeshes();
    expect(pickTexel(5, 5, RECT, camera, [base])).toBeNull();
  });
});
