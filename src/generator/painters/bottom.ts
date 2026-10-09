// ズボン・靴・腰
import { paint } from '../buffer';
import type { Mat } from '../buffer';
import { chance } from '../prng';
import { nudgeBand } from './util';
import type { PaintContext } from './util';

export function paintBottom({ buf, spec, rng }: PaintContext) {
  const pants = (tone = 0) => paint('bottom', tone);
  const shoes = (tone = 0) => paint('shoes', tone);
  const long = spec.bottom === 'pants';
  const lace: Mat = spec.palette.shoes.l > 0.6 ? 'accent' : 'white'; // 明るい靴にはアクセントの靴紐、暗い靴には白い靴紐
  const socks = !long && chance(rng, 0.5);
  const pockets = long && chance(rng, 0.6); // ヒップポケット (外側の層で盛り上げる)
  const cargo = long && chance(rng, 0.3); // 脇のカーゴポケット

  for (const name of ['rightLeg', 'leftLeg'] as const) {
    const band = buf.band(name, 'base');
    const hemRow = long ? 8 : 4;
    for (let c = 0; c < band.width; c++) {
      for (let y = 0; y < 12; y++) {
        if (y >= 9) band.set(c, y, shoes(y === 11 ? -2 : 0)); // 靴: 一番下の1行は底(暗い)
        else if (y <= hemRow) band.set(c, y, pants(y === hemRow ? -1 : 0)); // 裾の1行は少し暗い
        else if (socks && y >= 7) band.set(c, y, paint('white', y === 7 ? -1 : 0)); // ソックス (ショートパンツのとき)
        // ショートパンツなら、膝から下は素肌のまま
      }
    }
    buf.face(name, 'base', 'top').fill(pants());
    buf.face(name, 'base', 'bottom').fill(shoes(-2));

    // 靴の細部 (正面): 靴紐、つま先のツヤ。かかと(背面)は少し暗く
    const f = band.frontStart;
    band.set(f + 1, 9, paint(lace, 0, true)); band.set(f + 2, 9, paint(lace, 0, true));
    for (let x = 1; x <= 2; x++) nudgeBand(band, f + x, 10, 1);
    for (let x = 0; x < band.backWidth; x++) nudgeBand(band, band.backStart + x, 10, -1);

    // 膝のシワ (長ズボン): 左右で位置を少し変える
    if (long) {
      band.set(f + (name === 'rightLeg' ? 1 : 2), 5, pants(-1));
      band.set(f + (name === 'rightLeg' ? 2 : 1), 6, pants(-1));
      for (let x = 1; x <= 2; x++) band.set(band.backStart + x, 5, pants(-1));
    }

    // --- 外側の層: ズボン・靴の厚み ---
    const over = buf.band(name, 'over');
    for (let c = 0; c < over.width; c++) {
      if (long) over.set(c, hemRow, pants(-1)); // 長ズボンの裾の折り返し
      else if (chance(rng, 0.7)) over.set(c, hemRow, pants(c % 2 === 0 ? -1 : 0)); // ショートパンツの裾 (ところどころ欠けて、ほつれ感)
      over.set(c, 9, shoes(1)); // 靴の履き口 (足首のふち)
      over.set(c, 11, shoes(-2)); // 靴底の厚み
    }
    if (pockets) { // ヒップポケット: 外側の腰に、縁が盛り上がった小さな四角
      const x0 = name === 'rightLeg' ? 0 : 2; // 正面の外側 (右足は左端、左足は右端)
      for (let x = 0; x < 2; x++) { over.set(f + x0 + x, 1, pants(0)); over.set(f + x0 + x, 3, pants(-1)); } // 上の縁は周りと同じ色 (影の線だけを足して、まだらにしない)
      over.set(f + (name === 'rightLeg' ? 0 : 3), 2, pants(0)); over.set(f + (name === 'rightLeg' ? 1 : 2), 2, pants(-1));
    }
    if (cargo) { // カーゴポケット: 外側の側面に、ふたと縫い目
      const side = name === 'rightLeg' ? 1 : band.leftStart + 1; // 右足は右側面(外側)、左足は左側面(外側)
      for (let x = 0; x < 2; x++) { over.set(side + x, 4, pants(0)); over.set(side + x, 6, pants(-1)); }
      over.set(side, 5, pants(0)); over.set(side + 1, 5, pants(-1));
    }
  }

  // 腰: 一番下の行はズボン、その上の行は腰の縁 (ベルト)
  const body = buf.band('body', 'base');
  for (let c = 0; c < body.width; c++) {
    body.set(c, 11, pants());
    body.set(c, 10, pants(-1));
  }
  if (long) {
    body.set(body.frontStart + 3, 10, paint('accent', 1)); // バックル
    body.set(body.frontStart + 4, 10, paint('accent', 0));
  }
  // ベルト (外側の層): 腰を一周する厚みとバックル。上着が長いとき(パーカー・ジャケット)は、上着の裾が重なるので、開いた所からだけ見える
  const belt = buf.band('body', 'over');
  for (let c = 0; c < belt.width; c++) belt.set(c, 10, pants(-1));
  if (long) { belt.set(belt.frontStart + 3, 10, paint('accent', 1)); belt.set(belt.frontStart + 4, 10, paint('accent', 0)); }
  buf.face('body', 'base', 'bottom').fill(pants());
}
