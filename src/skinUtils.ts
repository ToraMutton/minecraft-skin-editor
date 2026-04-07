import * as THREE from 'three';

// 使えるツール定義
export type Tool = 'pen' | 'eraser' | 'bucket' | 'picker';
export type BrushSize = 1 | 2 | 3;

// --- 定数 ---
export const MAX_HISTORY = 30;
export const MAX_RECENT_COLORS = 16;
export const AUTOSAVE_KEY = 'vextora-mc-skin-editor-canvas';
export const AUTOSAVE_DELAY = 1000;

// --- インターフェース ---
// Minecraftスキンの各パーツのUV座標定義
export interface UVFace {
  u: number; v: number; w: number; h: number;
}

// 1パーツにつき6面の定義
export interface PartUV {
  front: UVFace;
  back: UVFace;
  top: UVFace;
  bottom: UVFace;
  right: UVFace;
  left: UVFace;
}

// スキンのパーツ定義
// 領域1に描いたら領域2にX反転してコピー、領域2に描いたら領域1にX反転してコピーするマッピング
export interface FaceMapping {
  x1: number; y1: number; w: number; h: number; // 領域1
  x2: number; y2: number;                       // 領域2 (幅と高さは共通)
}


// UVマッピング定義
export const SKIN_UV: Record<string, PartUV> = {
  // 頭
  head: {
    right: { u: 0, v: 8, w: 8, h: 8 },
    front: { u: 8, v: 8, w: 8, h: 8 },
    left: { u: 16, v: 8, w: 8, h: 8 },
    back: { u: 24, v: 8, w: 8, h: 8 },
    top: { u: 8, v: 0, w: 8, h: 8 },
    bottom: { u: 16, v: 0, w: 8, h: 8 },
  },
  // 右足
  rightLeg: {
    right: { u: 0, v: 20, w: 4, h: 12 },
    front: { u: 4, v: 20, w: 4, h: 12 },
    left: { u: 8, v: 20, w: 4, h: 12 },
    back: { u: 12, v: 20, w: 4, h: 12 },
    top: { u: 4, v: 16, w: 4, h: 4 },
    bottom: { u: 8, v: 16, w: 4, h: 4 },
  },
  // 胴体
  body: {
    right: { u: 16, v: 20, w: 4, h: 12 },
    front: { u: 20, v: 20, w: 8, h: 12 },
    left: { u: 28, v: 20, w: 4, h: 12 },
    back: { u: 32, v: 20, w: 8, h: 12 },
    top: { u: 20, v: 16, w: 8, h: 4 },
    bottom: { u: 28, v: 16, w: 8, h: 4 },
  },
  // 右腕
  rightArm: {
    right: { u: 40, v: 20, w: 4, h: 12 },
    front: { u: 44, v: 20, w: 4, h: 12 },
    left: { u: 48, v: 20, w: 4, h: 12 },
    back: { u: 52, v: 20, w: 4, h: 12 },
    top: { u: 44, v: 16, w: 4, h: 4 },
    bottom: { u: 48, v: 16, w: 4, h: 4 },
  },
  // 左足
  leftLeg: {
    right: { u: 16, v: 52, w: 4, h: 12 },
    front: { u: 20, v: 52, w: 4, h: 12 },
    left: { u: 24, v: 52, w: 4, h: 12 },
    back: { u: 28, v: 52, w: 4, h: 12 },
    top: { u: 20, v: 48, w: 4, h: 4 },
    bottom: { u: 24, v: 48, w: 4, h: 4 },
  },
  // 左腕
  leftArm: {
    right: { u: 32, v: 52, w: 4, h: 12 },
    front: { u: 36, v: 52, w: 4, h: 12 },
    left: { u: 40, v: 52, w: 4, h: 12 },
    back: { u: 44, v: 52, w: 4, h: 12 },
    top: { u: 36, v: 48, w: 4, h: 4 },
    bottom: { u: 40, v: 48, w: 4, h: 4 },
  },
};

// オーバーレイ用UVマッピング定義
export const SKIN_UV_OVER: Record<string, PartUV> = {
  head: {
    right: { u: 32, v: 8, w: 8, h: 8 },
    front: { u: 40, v: 8, w: 8, h: 8 },
    left: { u: 48, v: 8, w: 8, h: 8 },
    back: { u: 56, v: 8, w: 8, h: 8 },
    top: { u: 40, v: 0, w: 8, h: 8 },
    bottom: { u: 48, v: 0, w: 8, h: 8 },
  },
  rightLeg: {
    right: { u: 0, v: 36, w: 4, h: 12 },
    front: { u: 4, v: 36, w: 4, h: 12 },
    left: { u: 8, v: 36, w: 4, h: 12 },
    back: { u: 12, v: 36, w: 4, h: 12 },
    top: { u: 4, v: 32, w: 4, h: 4 },
    bottom: { u: 8, v: 32, w: 4, h: 4 },
  },
  body: {
    right: { u: 16, v: 36, w: 4, h: 12 },
    front: { u: 20, v: 36, w: 8, h: 12 },
    left: { u: 28, v: 36, w: 4, h: 12 },
    back: { u: 32, v: 36, w: 8, h: 12 },
    top: { u: 20, v: 32, w: 8, h: 4 },
    bottom: { u: 28, v: 32, w: 8, h: 4 },
  },
  rightArm: {
    right: { u: 40, v: 36, w: 4, h: 12 },
    front: { u: 44, v: 36, w: 4, h: 12 },
    left: { u: 48, v: 36, w: 4, h: 12 },
    back: { u: 52, v: 36, w: 4, h: 12 },
    top: { u: 44, v: 32, w: 4, h: 4 },
    bottom: { u: 48, v: 32, w: 4, h: 4 },
  },
  leftLeg: {
    right: { u: 0, v: 52, w: 4, h: 12 },
    front: { u: 4, v: 52, w: 4, h: 12 },
    left: { u: 8, v: 52, w: 4, h: 12 },
    back: { u: 12, v: 52, w: 4, h: 12 },
    top: { u: 4, v: 48, w: 4, h: 4 },
    bottom: { u: 8, v: 48, w: 4, h: 4 },
  },
  leftArm: {
    right: { u: 48, v: 52, w: 4, h: 12 },
    front: { u: 52, v: 52, w: 4, h: 12 },
    left: { u: 56, v: 52, w: 4, h: 12 },
    back: { u: 60, v: 52, w: 4, h: 12 },
    top: { u: 52, v: 48, w: 4, h: 4 },
    bottom: { u: 56, v: 48, w: 4, h: 4 },
  },
};

// 腕と足、頭と胴体（全パーツ・全レイヤー）の正確なミラー対応表
export const FACE_MAPPINGS: FaceMapping[] = [
  // === 頭 (Head) ===
  // 素肌 (Base)
  { x1: 0, y1: 8, w: 8, h: 8, x2: 16, y2: 8 }, // Right側面 <-> Left側面
  { x1: 8, y1: 8, w: 4, h: 8, x2: 12, y2: 8 }, // Front (左半分と右半分)
  { x1: 24, y1: 8, w: 4, h: 8, x2: 28, y2: 8 }, // Back (左半分と右半分)
  { x1: 8, y1: 0, w: 4, h: 8, x2: 12, y2: 0 }, // Top
  { x1: 16, y1: 0, w: 4, h: 8, x2: 20, y2: 0 }, // Bottom
  // 上着 (Over)
  { x1: 32, y1: 8, w: 8, h: 8, x2: 48, y2: 8 }, // Right側面 <-> Left側面
  { x1: 40, y1: 8, w: 4, h: 8, x2: 44, y2: 8 }, // Front
  { x1: 56, y1: 8, w: 4, h: 8, x2: 60, y2: 8 }, // Back
  { x1: 40, y1: 0, w: 4, h: 8, x2: 44, y2: 0 }, // Top
  { x1: 48, y1: 0, w: 4, h: 8, x2: 52, y2: 0 }, // Bottom

  // === 胴体 (Body) ===
  // 素肌 (Base)
  { x1: 16, y1: 20, w: 4, h: 12, x2: 28, y2: 20 }, // Right側面 <-> Left側面
  { x1: 20, y1: 20, w: 4, h: 12, x2: 24, y2: 20 }, // Front (左半分と右半分)
  { x1: 32, y1: 20, w: 4, h: 12, x2: 36, y2: 20 }, // Back (左半分と右半分)
  { x1: 20, y1: 16, w: 4, h: 4, x2: 24, y2: 16 }, // Top
  { x1: 28, y1: 16, w: 4, h: 4, x2: 32, y2: 16 }, // Bottom
  // 上着 (Over)
  { x1: 16, y1: 36, w: 4, h: 12, x2: 28, y2: 36 }, // Right側面 <-> Left側面
  { x1: 20, y1: 36, w: 4, h: 12, x2: 24, y2: 36 }, // Front
  { x1: 32, y1: 36, w: 4, h: 12, x2: 36, y2: 36 }, // Back
  { x1: 20, y1: 32, w: 4, h: 4, x2: 24, y2: 32 }, // Top
  { x1: 28, y1: 32, w: 4, h: 4, x2: 32, y2: 32 }, // Bottom

  // === 右足・左足 ===
  // 素肌 (Base)
  { x1: 4, y1: 16, w: 4, h: 4, x2: 20, y2: 48 }, // Top
  { x1: 8, y1: 16, w: 4, h: 4, x2: 24, y2: 48 }, // Bottom
  { x1: 0, y1: 20, w: 4, h: 12, x2: 24, y2: 52 }, // Right(外側) <-> Left(外側)
  { x1: 4, y1: 20, w: 4, h: 12, x2: 20, y2: 52 }, // Front
  { x1: 8, y1: 20, w: 4, h: 12, x2: 16, y2: 52 }, // Left(内側) <-> Right(内側)
  { x1: 12, y1: 20, w: 4, h: 12, x2: 28, y2: 52 }, // Back
  // 上着 (Over)
  { x1: 4, y1: 32, w: 4, h: 4, x2: 4, y2: 48 }, // Top
  { x1: 8, y1: 32, w: 4, h: 4, x2: 8, y2: 48 }, // Bottom
  { x1: 0, y1: 36, w: 4, h: 12, x2: 8, y2: 52 }, // Right <-> Left
  { x1: 4, y1: 36, w: 4, h: 12, x2: 4, y2: 52 }, // Front
  { x1: 8, y1: 36, w: 4, h: 12, x2: 0, y2: 52 }, // Left <-> Right
  { x1: 12, y1: 36, w: 4, h: 12, x2: 12, y2: 52 }, // Back

  // === 右腕・左腕 ===
  // 素肌 (Base)
  { x1: 44, y1: 16, w: 4, h: 4, x2: 36, y2: 48 }, // Top
  { x1: 48, y1: 16, w: 4, h: 4, x2: 40, y2: 48 }, // Bottom
  { x1: 40, y1: 20, w: 4, h: 12, x2: 40, y2: 52 }, // Right(外側) <-> Left(外側)
  { x1: 44, y1: 20, w: 4, h: 12, x2: 36, y2: 52 }, // Front
  { x1: 48, y1: 20, w: 4, h: 12, x2: 32, y2: 52 }, // Left(内側) <-> Right(内側)
  { x1: 52, y1: 20, w: 4, h: 12, x2: 44, y2: 52 }, // Back
  // 上着 (Over)
  { x1: 44, y1: 32, w: 4, h: 4, x2: 52, y2: 48 }, // Top
  { x1: 48, y1: 32, w: 4, h: 4, x2: 56, y2: 48 }, // Bottom
  { x1: 40, y1: 36, w: 4, h: 12, x2: 56, y2: 52 }, // Right <-> Left
  { x1: 44, y1: 36, w: 4, h: 12, x2: 52, y2: 52 }, // Front
  { x1: 48, y1: 36, w: 4, h: 12, x2: 48, y2: 52 }, // Left <-> Right
  { x1: 52, y1: 36, w: 4, h: 12, x2: 60, y2: 52 }, // Back
];


// --- ユーティリティ関数 ---

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

// 色コードを数値に変換する関数
export function hexToRgba(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  // 変換失敗(mがnull)なら黒を返す
  if (!m) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
    a: 255
  };
}

// 数値を色コードに変換する関数
export function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// 512x512の高解像度キャンバスに、ピクセル単位の網目を描画してテクスチャ化する関数
export function createGridTexture(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    // 64x64のマイクラテクスチャに合わせ、8ピクセルごとに線を引く(512/64 = 8)
    for (let i = 0; i <= 64; i++) {
      const pos = i * 8;
      // 線が細すぎて消えないように2px幅で描画
      ctx.fillRect(pos, 0, 1, 512); // 縦線
      ctx.fillRect(0, pos, 512, 1); // 横線
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter; // ズームアウトした時に線が消えないようにLinear
  return tex;
}

// 描いたピクセルのミラー先座標を返す関数
export function getMirrorCoord(x: number, y: number): [number, number] | null {
  for (const map of FACE_MAPPINGS) {
    // 領域1にヒットした場合 -> 領域2へX反転コピー
    if (x >= map.x1 && x < map.x1 + map.w && y >= map.y1 && y < map.y1 + map.h) {
      const relX = x - map.x1;
      const relY = y - map.y1;
      return [map.x2 + (map.w - 1 - relX), map.y2 + relY];
    }
    // 領域2にヒットした場合 -> 領域1へX反転コピー
    if (x >= map.x2 && x < map.x2 + map.w && y >= map.y2 && y < map.y2 + map.h) {
      const relX = x - map.x2;
      const relY = y - map.y2;
      return [map.x1 + (map.w - 1 - relX), map.y1 + relY];
    }
  }
  return null;
}











