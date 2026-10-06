// スキン画像を3つの層で持つ
//   base   : 下地 (読み込んだスキン。将来は自動生成した結果)
//   paint  : 手描き (alpha = 0 の場所は「何も描いていない」)
//   erased : 消去マスク (1 の場所は、下地も手描きも無視して透明にする)
// 画面に表示・書き出しするのは、3つを重ねた composite() の結果

export const SKIN_SIZE = 64;
export const PIXEL_COUNT = SKIN_SIZE * SKIN_SIZE;

// RGBAの配列 (1ピクセル4バイト)。<ArrayBuffer> は「スレッド間共有メモリではない普通の配列」という意味で、
// ImageData などブラウザのAPIに渡すにはこの指定が要る
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface SkinLayers {
  base: Pixels; // RGBA × 64 × 64
  paint: Pixels; // RGBA × 64 × 64
  erased: Uint8Array; // 1ピクセル1バイト × 64 × 64
}

export type RGBA = { r: number; g: number; b: number; a: number };

// 空の層 (下地を渡せば、それを下地にする)
export function createLayers(base?: Uint8ClampedArray): SkinLayers {
  if (base && base.length !== PIXEL_COUNT * 4) {
    throw new Error(`下地の大きさが64×64ではありません (${base.length} バイト)`);
  }
  return {
    base: base ? new Uint8ClampedArray(base) : new Uint8ClampedArray(PIXEL_COUNT * 4),
    paint: new Uint8ClampedArray(PIXEL_COUNT * 4),
    erased: new Uint8Array(PIXEL_COUNT),
  };
}

// 中身ごと複製する (Undo用のスナップショットなどに使う)
export function cloneLayers(layers: SkinLayers): SkinLayers {
  return {
    base: new Uint8ClampedArray(layers.base),
    paint: new Uint8ClampedArray(layers.paint),
    erased: new Uint8Array(layers.erased),
  };
}

export function isInside(x: number, y: number): boolean {
  return x >= 0 && x < SKIN_SIZE && y >= 0 && y < SKIN_SIZE;
}

// 1ピクセルの見た目 (3つの層を重ねた結果)
export function compositePixel(layers: SkinLayers, x: number, y: number): RGBA {
  const p = y * SKIN_SIZE + x;
  const i = p * 4;
  if (layers.erased[p]) return { r: 0, g: 0, b: 0, a: 0 };
  const src = layers.paint[i + 3] > 0 ? layers.paint : layers.base;
  return { r: src[i], g: src[i + 1], b: src[i + 2], a: src[i + 3] };
}

// 全体の見た目。out を渡すとそこに書き込む (毎回配列を作らずに済む)
export function composite(layers: SkinLayers, out: Pixels = new Uint8ClampedArray(PIXEL_COUNT * 4)): Pixels {
  for (let p = 0; p < PIXEL_COUNT; p++) {
    const i = p * 4;
    if (layers.erased[p]) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      continue;
    }
    const src = layers.paint[i + 3] > 0 ? layers.paint : layers.base;
    out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
  }
  return out;
}
