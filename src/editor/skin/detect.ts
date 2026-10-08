// 読み込んだスキンが Classic か Slim かを、画像の中身から推測する
// PNGにはモデルの情報が入っていないので、Slim の腕が「使わない場所」を手がかりにする (skinview3d の inferModelType と同じ考え方)
//   Slim の腕は幅3なので、Classic の腕の展開図のうち、Slim では使わない場所が4か所ある
//   素の層には透明な画素を置けない決まりなので、そこが透明なら Slim と分かる
// ただしこのエディタは、素の層が透明な Classic も作れる。そこで「一部だけ透明」は Classic、
// 「全部透明」でも腕に絵が無ければ判断できない (null) として、呼び出し側が選択中のモデルに従えるようにする
import type { Pixels } from '../canvas/layers';
import type { SkinModel, SkinLayout } from './layout';
import { getLayout } from './layout';
import { faceAt } from './faces';

const CLASSIC = getLayout('classic');
const SLIM = getLayout('slim');
const ARMS = ['rightArm', 'leftArm'] as const;

// 素の層の腕のピクセルのうち、(Classic では使うが Slim では使わない場所, Slim で使う場所)
function armAreas(): { unused: number[]; used: number[] } {
  const unused: number[] = [], used: number[] = [];
  const collect = (layout: SkinLayout, into: number[], keep: (x: number, y: number) => boolean) => {
    for (const arm of ARMS) {
      for (const f of Object.values(layout.uv[arm])) {
        for (let y = f.v; y < f.v + f.h; y++) for (let x = f.u; x < f.u + f.w; x++) if (keep(x, y)) into.push(y * 64 + x);
      }
    }
  };
  collect(CLASSIC, unused, (x, y) => faceAt(SLIM, x, y) === null);
  collect(SLIM, used, () => true);
  return { unused, used };
}
const { unused: UNUSED_BY_SLIM, used: SLIM_ARM } = armAreas();

// 判定に使う場所 (テスト用に公開): Slim の腕が使わない画素の (x, y)
export const SLIM_UNUSED_PIXELS: [number, number][] = UNUSED_BY_SLIM.map(p => [p % 64, Math.floor(p / 64)]);

const rgbaAt = (pixels: ArrayLike<number>, p: number) => [pixels[p * 4], pixels[p * 4 + 1], pixels[p * 4 + 2], pixels[p * 4 + 3]];

// 64×64 のスキン画素から、モデルを推測する。判断できなければ null
export function detectModel(pixels: Pixels): SkinModel | null {
  const alpha = (p: number) => pixels[p * 4 + 3];

  // 使わない場所が1つでも「透明でも不透明でもない」(半透明) 、または一部だけ透明 → Classic の面として使われている
  const transparent = UNUSED_BY_SLIM.filter(p => alpha(p) === 0).length;
  if (transparent === UNUSED_BY_SLIM.length) {
    // 全部透明: Slim。ただし腕に絵が無ければ、空っぽの Classic かもしれないので判断しない
    return SLIM_ARM.some(p => alpha(p) > 0) ? 'slim' : null;
  }
  if (transparent > 0 || UNUSED_BY_SLIM.some(p => alpha(p) !== 255)) return 'classic';

  // 全部不透明: 昔のツールは、使わない場所を黒か白で塗りつぶしていた
  const first = rgbaAt(pixels, UNUSED_BY_SLIM[0]);
  const isFill = (c: number[]) => c[3] === 255 && ((c[0] === 0 && c[1] === 0 && c[2] === 0) || (c[0] === 255 && c[1] === 255 && c[2] === 255));
  const uniform = isFill(first) && UNUSED_BY_SLIM.every(p => rgbaAt(pixels, p).every((v, i) => v === first[i]));
  if (!uniform) return 'classic';
  // 腕がすべて同じ色(黒い腕・白い腕の Classic)だと、塗りつぶしと区別できない → 判断しない
  const sameAsFill = SLIM_ARM.every(p => rgbaAt(pixels, p).every((v, i) => v === first[i]));
  return sameAsFill ? null : 'slim';
}
