// 陰影: 塗った「素材と段階」に、光と接触部分の影を加えて、最終的なRGBAにする
//
// 方針 (良いスキンの描き方):
//   ・光は決まった方向 (左上・前) から当てる。面ごとの明るさを決めるだけで、面の中を中心だけ明るくはしない (ピローシェーディングにしない)
//   ・ノイズの陰影は使わない。暗くなるのは、理由のある場所 (接触部分の影・奥まった面) だけ
//   ・色は素材ごとの5段階のランプから選ぶので、色数が増えすぎない
import type { Pixels } from '../editor/canvas/layers';
import { PaintBuffer } from './buffer';
import type { FaceName, Mat, Paint, Part } from './buffer';
import { RAMP_BASE, RAMP_SIZE } from './color';
import type { Rgb } from './color';

// 面ごとの明るさ (段階の差)。光は左上・前から。上面は明るく、下面は暗く、後ろと左は少し暗い
export const FACE_LIGHT: Record<FaceName, number> = { top: 1, right: 0, front: 0, left: -1, back: -1, bottom: -2 };

// 影を落とすもの / 影を受けるもの (すぐ上のピクセルが前者で、自分が後者のとき、自分が暗くなる)
const CASTERS = new Set<Mat>(['hair', 'top', 'inner', 'bottom']);
const RECEIVERS = new Set<Mat>(['skin', 'inner', 'bottom', 'shoes', 'white']);

// 手足の「内側の面」(体や反対の足に向き合う面)。右腕・右足の内側は「左」の面、左腕・左足は「右」の面
const INNER_FACE: Partial<Record<Part, FaceName>> = { rightArm: 'left', leftArm: 'right', rightLeg: 'left', leftLeg: 'right' };

// ピクセル i の、光と影による段階の差
export function shadeOffset(buf: PaintBuffer, i: number): number {
  const p = buf.pixels[i], cell = buf.cells[i];
  if (!p || !cell || p.flat) return 0;
  const { face, layer, part, x, y, w } = cell;
  let offset = FACE_LIGHT[face];

  // 光: 正面の右端は、丸みで少し暗くなる
  if (face === 'front' && w >= 3 && x === w - 1) offset -= 1;

  // 影1: 髪・服のすぐ下 (前髪の下のおでこ、袖口の下の腕、服の裾の下のズボン、ズボンの裾の下の靴)
  if (layer === 'base' && y > 0 && face !== 'top' && face !== 'bottom' && RECEIVERS.has(p.mat)) {
    const casts = (q: Paint | null) => q !== null && q.mat !== p.mat && CASTERS.has(q.mat);
    const twinAbove = buf.twin[i - 64];
    const count = (casts(buf.pixels[i - 64]) ? 1 : 0) + (twinAbove >= 0 && casts(buf.pixels[twinAbove]) ? 1 : 0); // 外側の層の前髪の下は、さらに暗い
    offset -= count;
  }

  // 影2: 外側の層との重なり。外側の層が載っている素の層、外側の層の縁に接する素の層は暗い (奥行き)
  if (layer === 'base') {
    const covered = (j: number) => buf.twin[j] >= 0 && buf.pixels[buf.twin[j]] !== null;
    if (covered(i)) offset -= 1;
    else if (x > 0 && covered(i - 1)) offset -= 1;
    else if (x < w - 1 && covered(i + 1)) offset -= 1;
  }

  // 影3: 奥まった面。腋(腕の内側と胴の脇)・股(足の内側)は暗く、上のほうはさらに暗い
  if (face === INNER_FACE[part]) offset -= y < 2 ? 2 : 1;
  if (part === 'body' && (face === 'right' || face === 'left') && y < 3) offset -= 1;

  // 影4: あごの下の首
  if (part === 'body' && face === 'front' && y === 0 && p.mat === 'skin') offset -= 1;

  return offset;
}

// 素材ごとのランプ (暗い → 明るい の5色) を使って、バッファから 64×64 のRGBAを作る
// 何も塗っていないピクセル (展開図の面の外、外側の層の空き) は透明のまま
export function shadeBuffer(buf: PaintBuffer, ramps: Record<Mat, Rgb[]>): Pixels {
  const out: Pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const p = buf.pixels[i];
    if (!p || !buf.cells[i]) continue;
    const step = Math.max(0, Math.min(RAMP_SIZE - 1, RAMP_BASE + p.tone + shadeOffset(buf, i)));
    const [r, g, b] = ramps[p.mat][step];
    out.set([r, g, b, 255], i * 4);
  }
  return out;
}
