import * as THREE from 'three';

// 全身を映すときの注視点とカメラの距離
export const HOME_TARGET = new THREE.Vector3(0, 16, 0);
export const HOME_DISTANCE = 60;

// 指定したパーツ(子のメッシュも含む)がちょうど収まる、注視点とカメラの距離
export function focusOn(objects: THREE.Object3D[]): { center: THREE.Vector3; distance: number } {
  const box = new THREE.Box3();
  objects.forEach(object => box.expandByObject(object));

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  // 一番長い辺に合わせて距離を決める。全身より遠くには引かない
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = Math.min(maxDim * 1.8 + 15, HOME_DISTANCE);
  return { center, distance };
}
