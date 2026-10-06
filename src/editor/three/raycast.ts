import * as THREE from 'three';

// 画面上の長方形 (getBoundingClientRect() の結果と同じ形)
export interface ScreenRect {
  left: number; top: number; width: number; height: number;
}

// UV座標(0〜1) → テクスチャ(64×64)上のピクセル座標
// Three.jsのUVは左下が(0,0)、テクスチャのピクセルは左上が(0,0)なので、縦を反転する
export function uvToTexel(uv: { x: number; y: number }): [number, number] {
  // ちょうど端(1.0)に当たったときに64にならないよう、63で止める
  const x = Math.min(63, Math.floor(uv.x * 64));
  const y = Math.min(63, Math.floor((1 - uv.y) * 64));
  return [x, y];
}

// 画面上の位置(clientX, clientY)にあるモデルの、テクスチャ上のピクセル座標を求める
// 何にも当たらなければ null
export function pickTexel(
  clientX: number,
  clientY: number,
  rect: ScreenRect,
  camera: THREE.Camera,
  targets: THREE.Object3D[],
): [number, number] | null {
  // 画面上の位置 → -1〜1 の座標 (中央が0、上が+1)
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit?.uv) return null;
  return uvToTexel(hit.uv);
}
