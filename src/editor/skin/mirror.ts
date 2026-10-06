// スキンのパーツ定義
// 領域1に描いたら領域2にX反転してコピー、領域2に描いたら領域1にX反転してコピーするマッピング
export interface FaceMapping {
  x1: number; y1: number; w: number; h: number; // 領域1
  x2: number; y2: number;                       // 領域2 (幅と高さは共通)
}

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
