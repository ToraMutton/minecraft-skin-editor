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
  const cuffOverlay = long && chance(rng, 0.6); // ズボンの裾を外側の層で少し厚く

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

    if (cuffOverlay) {
      const over = buf.band(name, 'over');
      for (let c = 0; c < over.width; c++) over.set(c, 8, pants());
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
  buf.face('body', 'base', 'bottom').fill(pants());
}
