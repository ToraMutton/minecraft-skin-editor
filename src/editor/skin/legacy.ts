// 旧形式 (64×32) のスキンを、今の形式 (64×64) にする
// 旧形式には、左腕・左脚の場所と、上着の層が無かった。ゲームは右腕・右脚を左右反転して左にも使っていたので、同じようにコピーする
// 旧形式の腕は、すべて Classic (幅4)
import { SKIN_SIZE } from '../canvas/layers';
import type { Pixels } from '../canvas/layers';
import { FACE_MAPPINGS } from './mirror';
import { getLayout } from './layout';

export const LEGACY_HEIGHT = SKIN_SIZE / 2;

// 右腕・右脚(素の層)を左腕・左脚へ写す対応: ミラーの対応表のうち、元が上半分(y<32)で、先が下半分(y>=48)のもの
const COPIES = FACE_MAPPINGS.filter(m => m.y1 >= 16 && m.y1 < LEGACY_HEIGHT && m.y2 >= 48);

// 64×32 の画素 (RGBA) から、64×64 の画素を作る
export function legacyToSkin64(legacy: Uint8ClampedArray): Pixels {
  if (legacy.length !== SKIN_SIZE * LEGACY_HEIGHT * 4) throw new Error('64×32 の画素ではありません');
  const out: Pixels = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  out.set(legacy); // 上半分はそのまま

  for (const m of COPIES) {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const from = ((m.y1 + y) * SKIN_SIZE + m.x1 + x) * 4;
        const to = ((m.y2 + y) * SKIN_SIZE + m.x2 + (m.w - 1 - x)) * 4; // 左右反転
        out.set(legacy.subarray(from, from + 4), to);
      }
    }
  }

  // 透明な画素が1つも無い旧スキンは、帽子の層(頭の上着)が背景色で塗りつぶされている。そのまま使うと頭が箱に隠れるので、透明にする
  let hasTransparency = false;
  for (let p = 0; p < SKIN_SIZE * LEGACY_HEIGHT; p++) if (legacy[p * 4 + 3] !== 255) { hasTransparency = true; break; }
  if (!hasTransparency) {
    for (const f of Object.values(getLayout('classic').uvOver.head)) {
      for (let y = f.v; y < f.v + f.h; y++) out.fill(0, (y * SKIN_SIZE + f.u) * 4, (y * SKIN_SIZE + f.u + f.w) * 4);
    }
  }
  return out;
}
