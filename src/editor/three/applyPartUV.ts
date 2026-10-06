import * as THREE from 'three';
import type { UVFace, PartUV } from '../skin/uv';

// UVFaceからThree.jsのUV座標を設定する
// Three.jsのUV座標系: 左下が(0,0)、右上が(1,1)
// Minecraftのテクスチャ座標系: 左上が(0,0)、右上が(64,64)
export function setFaceUV(
  geometry: THREE.BoxGeometry, // どの箱に貼るか
  faceIndex: number, // 箱の何番目の面か
  face: UVFace, // どの画像部分を貼るか
  flipV: boolean = false, // 上下反転するか(デフォルト: false)
) {
  const uv = geometry.attributes.uv;
  const texW = 64, texH = 64; // スキン画像の幅と高さ

  // テクスチャ上のピクセル座標 → 0〜1の比率に変換
  // 横方向(X/U)の計算
  const u0 = face.u / texW;
  const u1 = (face.u + face.w) / texW;
  // 縦方向(Y/V)の計算
  let v0 = 1 - face.v / texH; // Y軸反転
  let v1 = 1 - (face.v + face.h) / texH;

  // 反転処理
  if (flipV) { [v0, v1] = [v1, v0]; }

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
  // Three.js BoxGeometryの面順序: +x, -x, +y(上), -y(下), +z(前), -z(後)
  // キャラクターは +z を向いていて、右腕は -x 側にある。
  // なので +x(キャラの左側)には「左」の面、-x(キャラの右側)には「右」の面を貼る (Minecraft本体と同じ対応)
  setFaceUV(geometry, 0, partUV.left);
  setFaceUV(geometry, 1, partUV.right);
  setFaceUV(geometry, 2, partUV.top);
  setFaceUV(geometry, 3, partUV.bottom, true); // 底面は下から見上げた向きなので上下反転
  setFaceUV(geometry, 4, partUV.front);
  setFaceUV(geometry, 5, partUV.back);
  geometry.attributes.uv.needsUpdate = true;
}
