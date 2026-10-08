// Classic ⇄ Slim の変換: 腕の絵を、もう一方のモデルの展開図に移す
// 腕の幅が違う (4px ⇔ 3px) ので、正面・背面・上面・底面は1列ぶん増減する。側面(奥行き)は同じ4pxのまま、場所だけが変わる
//   Classic → Slim: 腕の「外側」(胴体から遠いほう)の1列を捨てる。胴体と接する側(肩の継ぎ目)の絵は残る
//   Slim → Classic: 外側の1列を複製して足す。そのため Slim → Classic → Slim は元の絵にぴったり戻る
// 3つの層(下地・手描き・消去マスク)と上着の層に、同じ規則を使う
import { SKIN_SIZE, cloneLayers } from '../canvas/layers';
import type { SkinLayers } from '../canvas/layers';
import type { UVFace, PartUV } from './uv';
import type { SkinLayout } from './layout';

const ARMS = ['rightArm', 'leftArm'] as const;
type ArmName = typeof ARMS[number];
type FaceName = keyof PartUV;

// 面の中の「外側」の列が、左端(0)か右端(幅-1)か
// 正面・上面・底面は、展開図の左から右が キャラの右(-x)から左(+x) の向き。背面はその逆。
// 右腕の外側は -x、左腕の外側は +x なので、右腕の正面は左端、左腕の正面は右端が外側になる
function outerIsLeft(arm: ArmName, face: FaceName): boolean {
  const alongX = face !== 'back'; // 展開図の左→右が +x に向かう面か
  return (arm === 'rightArm') === alongX;
}

// 変換後の列 dstCol が、変換前のどの列から来るか
function sourceColumn(dstCol: number, srcWidth: number, dstWidth: number, outerLeft: boolean): number {
  if (srcWidth === dstWidth) return dstCol;
  if (dstWidth < srcWidth) return outerLeft ? dstCol + 1 : dstCol; // 外側の列を飛ばす
  // 増やすとき: 外側の列を2回使う
  return outerLeft ? Math.max(dstCol - 1, 0) : Math.min(dstCol, srcWidth - 1);
}

// layers (from のモデルの絵) を to のモデルの絵にした、新しい層を返す。元の layers は変えない
// 腕以外(頭・胴・脚)は1バイトも変わらない。変換前の腕の場所は、いったん空にしてから書き直す
export function convertLayers(layers: SkinLayers, from: SkinLayout, to: SkinLayout): SkinLayers {
  const out = cloneLayers(layers);
  if (from.model === to.model) return out;

  const clear = (face: UVFace) => {
    for (let y = face.v; y < face.v + face.h; y++) {
      for (let x = face.u; x < face.u + face.w; x++) {
        const p = y * SKIN_SIZE + x;
        out.base.fill(0, p * 4, p * 4 + 4);
        out.paint.fill(0, p * 4, p * 4 + 4);
        out.erased[p] = 0;
      }
    }
  };
  const copy = (sx: number, sy: number, dx: number, dy: number) => {
    const s = sy * SKIN_SIZE + sx, d = dy * SKIN_SIZE + dx;
    out.base.set(layers.base.subarray(s * 4, s * 4 + 4), d * 4);
    out.paint.set(layers.paint.subarray(s * 4, s * 4 + 4), d * 4);
    out.erased[d] = layers.erased[s];
  };

  const tables: [Record<string, PartUV>, Record<string, PartUV>][] = [[from.uv, to.uv], [from.uvOver, to.uvOver]];
  // 先に変換前の腕を全部空にする (変換後の面と重なる場所があるため、書きながら消すと書いた絵まで消える)
  for (const [src] of tables) for (const arm of ARMS) for (const face of Object.values(src[arm])) clear(face);
  for (const [src, dst] of tables) {
    for (const arm of ARMS) {
      for (const name of Object.keys(src[arm]) as FaceName[]) {
        const a = src[arm][name], b = dst[arm][name];
        const outerLeft = outerIsLeft(arm, name);
        for (let y = 0; y < b.h; y++) {
          for (let x = 0; x < b.w; x++) copy(a.u + sourceColumn(x, a.w, b.w, outerLeft), a.v + y, b.u + x, b.v + y);
        }
      }
    }
  }
  return out;
}
