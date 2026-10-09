// 顔 (頭の正面の 8×8)
// 目は4種類: ふつう / ぱっちり(まつ毛) / つり目 / ちびかわ(2×2を顔の下寄りに)
// 目は白目と黒目だけでなく、まつ毛・ハイライト・眉で表情を出す。光は左上から当たるので、ハイライトは両目とも同じ側に置く
import { paint } from '../buffer';
import type { PaintContext } from './util';

// 左目(画面の左)は x=1,2、右目は x=5,6。outer が顔の外側、inner が鼻の側
const EYES = [{ outer: 1, inner: 2 }, { outer: 6, inner: 5 }];

export function paintFace({ buf, spec }: PaintContext) {
  const f = buf.face('head', 'base', 'front');
  const iris = (tone = 0) => paint('eye', tone, true);
  const white = paint('white', 0, true);
  const lash = paint('dark', 0, true);
  const lip = (tone: number) => paint('blush', tone, true);

  if (spec.eyes === 'classic') {
    // 素朴な目: 白目と黒目、その上に眉
    for (const { outer, inner } of EYES) {
      f.set(outer, 4, white); f.set(inner, 4, iris());
      f.set(outer, 3, paint('hair', 0)); f.set(inner, 3, paint('hair', -1)); // 眉は、内側(鼻の側)ほど濃い
    }
    f.set(4, 5, paint('skin', -1)); // 鼻の影 (光は左から)
    f.set(3, 6, lip(-2)); f.set(4, 6, lip(-2));
  } else if (spec.eyes === 'kawaii') {
    // ちびかわいい目: 2×2の大きな目を、顔の下寄り(5〜6行目)に置く。おでこが広くなって、幼く見える
    //   2×2の中: 左上にハイライト(白)、上の段は上まぶたの影で少し暗く、下の段は明るく澄ませる。光は左上からなので、ハイライトは両目とも左上
    for (const left of [1, 5]) {
      f.set(left, 5, paint('white', 0, true)); f.set(left + 1, 5, iris(-1));
      f.set(left, 6, iris()); f.set(left + 1, 6, iris(1));
    }
    f.set(1, 4, lash); f.set(6, 4, lash); // 外側のまつ毛 (目尻)
    f.set(0, 6, paint('blush', 0, true)); f.set(7, 6, paint('blush', 0, true)); // ほっぺ
    f.set(3, 7, lip(-1)); f.set(4, 7, lip(-1)); // 小さな口 (あごの行)
  } else if (spec.eyes === 'lashes') {
    // 大きな目 (かわいい系): まつ毛 + 2×2の黒目 + ハイライト + ほっぺ
    for (const { outer, inner } of EYES) {
      f.set(outer, 3, lash); // まつ毛は外側だけ (内側まで入れると、つながって眼鏡のように見える)
      f.set(outer, 4, iris(1)); f.set(inner, 4, iris());
      f.set(outer, 5, iris(-1)); f.set(inner, 5, iris(-1));
    }
    f.set(1, 4, white); f.set(5, 4, white); // ハイライトは両目とも左上
    f.set(0, 3, lash); f.set(7, 3, lash); // まつ毛のはね
    f.set(0, 5, paint('blush', 0, true)); f.set(7, 5, paint('blush', 0, true));
    f.set(3, 6, lip(-1)); f.set(4, 6, lip(-1));
  } else {
    // 細いつり目 (クール系): 外側が高く、内側が低い
    for (const { outer, inner } of EYES) {
      f.set(outer, 3, lash);
      f.set(outer, 4, iris(-1)); f.set(inner, 4, iris());
    }
    f.set(2, 3, paint('hair', -1)); f.set(5, 3, paint('hair', -1)); // 眉の内側
    f.set(3, 6, lip(-2)); f.set(4, 6, lip(-2));
  }
}
