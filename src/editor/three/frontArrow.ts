import * as THREE from 'three';

// 足元に置く「正面」を示す矢印 (+z 方向 = キャラクターの顔が向いている方向を指す)
// 何も描いていないスキンだと前後の区別がつかないので、その目印にする
export function createFrontArrow(): THREE.Mesh {
  // ドット絵風の階段状の矢印。1マス = 1単位 (テクスチャの1ピクセルと同じ大きさ)
  // ここでは xy 平面に描き、+y が矢印の向き
  const outline: [number, number][] = [
    [-1.5, 0], [1.5, 0], [1.5, 3], // 軸
    [3.5, 3], [3.5, 4], [2.5, 4], [2.5, 5], [1.5, 5], [1.5, 6], [0.5, 6], [0.5, 7], // 矢じりの右半分
    [-0.5, 7], [-0.5, 6], [-1.5, 6], [-1.5, 5], [-2.5, 5], [-2.5, 4], [-3.5, 4], [-3.5, 3], // 左半分
    [-1.5, 3],
  ];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));

  const material = new THREE.MeshBasicMaterial({
    color: 0x52a535, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  arrow.name = 'frontArrow';

  // x軸まわりに90度倒して地面(xz平面)に寝かせる → 矢印の向き(+y)が +z になる
  arrow.rotation.x = Math.PI / 2;
  // 足の裏(y=0)のすぐ上、つま先(z=2.25)より少し前から伸ばす
  arrow.position.set(0, 0.05, 3);
  return arrow;
}
