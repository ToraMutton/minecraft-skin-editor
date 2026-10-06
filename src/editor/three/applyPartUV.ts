import * as THREE from 'three';
import type { UVFace, PartUV } from '../skin/uv';

// UVFaceからThree.jsのUV座標を設定する
// Three.jsのUV座標系: 左下が(0,0)、右上が(1,1)
// Minecraftのテクスチャ座標系: 左上が(0,0)、右上が(64,64)
export function setFaceUV(
  geometry: THREE.BoxGeometry, // どの箱に貼るか
  faceIndex: number, // 箱の何番目の面か
  face: UVFace, // どの画像部分を貼るか
  flipH: boolean = false, // 左右反転するか(デフォルト: false)
) {
  const uv = geometry.attributes.uv;
  const texW = 64, texH = 64; // スキン画像の幅と高さ

  // テクスチャ上のピクセル座標 → 0〜1の比率に変換
  // 横方向(X/U)の計算
  let u0 = face.u / texW;
  let u1 = (face.u + face.w) / texW;
  // 縦方向(Y/V)の計算
  const v0 = 1 - face.v / texH; // Y軸反転
  const v1 = 1 - (face.v + face.h) / texH;

  // 反転処理
  if (flipH) { [u0, u1] = [u1, u0]; }

  // BoxGeometryの面の順番: +x, -x, +y, -y, +z, -z
  // 各面に4頂点（左上、右上、左下、右下）
  const i = faceIndex * 4;
  uv.setXY(i + 0, u0, v0);
  uv.setXY(i + 1, u1, v0);
  uv.setXY(i + 2, u0, v1);
  uv.setXY(i + 3, u1, v1);
}

// パーツ用のBoxGeometryにUVを設定する
export function applyPartUV(geometry: THREE.BoxGeometry, partUV: PartUV) {
  // Three.js BoxGeometryの面順序: right(+x), left(-x), top(+y), bottom(-y), front(+z), back(-z)
  setFaceUV(geometry, 0, partUV.right);
  setFaceUV(geometry, 1, partUV.left);
  setFaceUV(geometry, 2, partUV.top);
  setFaceUV(geometry, 3, partUV.bottom);
  setFaceUV(geometry, 4, partUV.front);
  setFaceUV(geometry, 5, partUV.back, true); // 背面は左右反転
  geometry.attributes.uv.needsUpdate = true;
}
