// 顔 (頭の正面の 8×8)
// 目は6種類: ふつう / ぱっちり(まつ毛) / つり目 / 四角い大きな目(kawaii) / 縦目 / 横目
// 四角い大きな目・縦目・横目は、64px向けの定番の描き方 (minecraft-mcworld.com の目の解説) を参考にしている:
//   ・目は顔の下寄り (5〜6行目)。おでこが広く、幼くかわいく見える
//   ・色の段階で形を作る (縦目は、下ほど濃く、上ほど明るい)
//   ・口は無いことが多い。目だけで表情を作る (鼻は描かない)
import { paint } from '../buffer';
import type { PaintContext } from './util';

export function paintFace({ buf, spec }: PaintContext) {
  const f = buf.face('head', 'base', 'front');
  const iris = (tone = 0) => paint('eye', tone, true);
  const white = (tone = 0) => paint('white', tone, true);
  const dark = (tone = 0) => paint('dark', tone, true);
  const lip = (tone: number) => paint('blush', tone, true);

  // 左目(画面の左)は x=1,2、右目は x=6,5。outer が顔の外側、inner が鼻の側
  const EYES = [{ outer: 1, inner: 2 }, { outer: 6, inner: 5 }];
  let mouthRow = 6; // 口の行 (口を描くとき)。目が下寄りなら、あごの行

  if (spec.eyes === 'classic') {
    // 素朴な目: 白目と黒目、その上に眉 (眉は内側ほど濃い)
    for (const { outer, inner } of EYES) {
      f.set(outer, 4, white()); f.set(inner, 4, iris());
      f.set(outer, 3, paint('hair', 0)); f.set(inner, 3, paint('hair', -1));
    }
  } else if (spec.eyes === 'lashes') {
    // 大きな目: まつ毛 + 2×2の黒目 + ハイライト + ほっぺ。光は左上からなので、ハイライトは両目とも左上
    for (const { outer, inner } of EYES) {
      f.set(outer, 3, dark()); // まつ毛は外側だけ (内側まで入れると、つながって眼鏡のように見える)
      f.set(outer, 4, iris(1)); f.set(inner, 4, iris());
      f.set(outer, 5, iris(-1)); f.set(inner, 5, iris(-1));
    }
    f.set(1, 4, white()); f.set(5, 4, white());
    f.set(0, 3, dark()); f.set(7, 3, dark()); // まつ毛のはね
    f.set(0, 5, paint('blush', 0, true)); f.set(7, 5, paint('blush', 0, true));
  } else if (spec.eyes === 'sharp') {
    // 細いつり目: 外側が高く、内側が低い
    for (const { outer, inner } of EYES) {
      f.set(outer, 3, dark());
      f.set(outer, 4, iris(-1)); f.set(inner, 4, iris());
    }
    f.set(2, 3, paint('hair', -1)); f.set(5, 3, paint('hair', -1)); // 眉の内側
  } else if (spec.eyes === 'kawaii') {
    // 四角い大きな目: 2×2。外側は上が灰色・下が白、内側は上が明るい目の色・下が目の色。上に黒いまつ毛の帯、目尻に黒い縁
    for (const { outer, inner } of EYES) {
      f.set(outer, 4, dark(-1)); f.set(inner, 4, dark(-1)); // まつ毛の帯
      f.set(outer, 5, white(-1)); f.set(inner, 5, iris(2)); // 灰色 / 明るい目の色
      f.set(outer, 6, white()); f.set(inner, 6, iris()); // 白 / 目の色
    }
    f.set(0, 5, dark(-2)); f.set(7, 5, dark(-2)); // 目尻の縁
    mouthRow = 7;
  } else if (spec.eyes === 'vertical') {
    // 縦目: 1×3。下ほど濃く、上ほど明るい (やわらかい印象)
    for (const x of [1, 6]) { f.set(x, 4, iris(2)); f.set(x, 5, iris()); f.set(x, 6, iris(-2)); }
    mouthRow = 7;
  } else {
    // 横目: 白と目の色の2ピクセル。小さいので、口の場所を残せる
    for (const { outer, inner } of EYES) { f.set(outer, 6, white()); f.set(inner, 6, iris(-1)); }
    mouthRow = 7;
  }

  // 口 (任意): 小さな2ピクセル
  if (spec.mouth) { f.set(3, mouthRow, lip(-1)); f.set(4, mouthRow, lip(-1)); }
}
