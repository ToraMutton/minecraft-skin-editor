// アクセサリー: 帽子 / カチューシャ / リボン / メガネ / イヤリング / マフラー / 手袋
// どれも外側の層(上着の層)に描いて、髪・服・顔の上に重ねる。顔の部品(目)は隠さない
import { paint } from '../buffer';
import type { Mat, Paint } from '../buffer';
import { chance } from '../prng';
import type { Oklch } from '../color';
import type { EyeStyle, SkinSpec } from '../spec';
import type { PaintContext } from './util';

// 小物の素材を、重なる相手と明るさが離れたものから選ぶ (リボンが髪に溶けない、手袋が肌に溶けない)
// accent (アクセントの色) を優先して、離れていなければ 主役の色 → 白 → 濃い色 の順に探す
export function pickMat(spec: SkinSpec, against: Oklch, order: readonly Mat[] = ['accent', 'top', 'white', 'dark']): Mat {
  const lightness: Partial<Record<Mat, number>> = { accent: spec.palette.accent.l, top: spec.palette.primary.l, white: 0.95, dark: 0.3 };
  const gap = (m: Mat) => Math.abs((lightness[m] ?? 0.5) - against.l);
  return order.find(m => gap(m) >= 0.18) ?? [...order].sort((a, b) => gap(b) - gap(a))[0];
}

// 目の高さ (顔の何行目か)。メガネの枠の位置と、口を隠さないために使う
const EYE_ROWS: Record<EyeStyle, { top: number; bottom: number; mouth: number }> = {
  classic: { top: 3, bottom: 5, mouth: 6 },
  lashes: { top: 3, bottom: 6, mouth: 6 },
  sharp: { top: 3, bottom: 5, mouth: 6 },
  kawaii: { top: 4, bottom: 7, mouth: 7 }, // 目は5〜6行目。枠の下の辺は、口(3・4列目)より外側に収まる
};

export function paintAccessories({ buf, spec, rng }: PaintContext) {
  const head = buf.band('head', 'over');
  const body = buf.band('body', 'over');
  const f = head.frontStart; // 顔の左端の列 (8)

  for (const accessory of spec.accessories) {
    if (accessory === 'hat') {
      // キャップ: 頭の上3行を一周して覆う。ひさし(正面の3行目)は暗く、正面に小さなマーク
      const cap = (tone = 0): Paint => paint('top', tone);
      for (let c = 0; c < head.width; c++) for (let y = 0; y < 3; y++) head.set(c, y, cap(y === 2 ? (c >= f && c < f + 8 ? -2 : -1) : 0));
      const top = buf.face('head', 'over', 'top');
      top.fill(cap());
      for (let y = 0; y < 8; y++) top.set(3, y, cap(-1)); // 中央の縫い目
      head.set(f + 3, 1, paint('accent', 0, true)); head.set(f + 4, 1, paint('accent', 0, true));
    } else if (accessory === 'headband') {
      // カチューシャ: 頭の上を横切って、両耳の前に降りる弧
      const mat = pickMat(spec, spec.palette.hair);
      const band = (tone = 0): Paint => paint(mat, tone);
      const top = buf.face('head', 'over', 'top');
      for (let x = 0; x < 8; x++) top.set(x, 3, band(x === 3 || x === 4 ? 1 : 0));
      for (let y = 0; y <= 4; y++) { head.set(5, y, band(y === 0 ? 1 : 0)); head.set(head.leftStart + 2, y, band(y === 0 ? 1 : 0)); } // 右・左の側面 (耳の前)
      for (let x = 0; x < 8; x++) head.set(f + x, 0, band(x === 3 || x === 4 ? 1 : 0)); // 正面からも見えるように、生え際の1行
    } else if (accessory === 'ribbon') {
      // リボン: 正面の上に、左右どちらかに寄せた 5×3 の蝶結び (輪の内側は明るく、結び目は暗く)
      const mat = pickMat(spec, spec.palette.hair);
      const ox = f + (chance(rng, 0.5) ? 0 : 3);
      const part = (x: number, y: number, tone: number) => head.set(ox + x, y, paint(mat, tone));
      for (const y of [0, 2]) for (const x of [0, 1, 3, 4]) part(x, y, 0);
      for (const x of [0, 4]) part(x, 1, 0);
      for (const x of [1, 3]) part(x, 1, 1);
      part(2, 1, -1); // 結び目
    } else if (accessory === 'glasses') {
      // メガネ: 小さな丸いレンズの枠 (4列 × 目の高さ)。角を丸めて、目の部分は透明のままにし、素の層の目が見える
      //   左右のレンズが隣り合う内側の縦の枠が、鼻の部分になる。こめかみのつるは側面へ
      const { top, bottom, mouth } = EYE_ROWS[spec.eyes];
      const mat: Mat = pickMat(spec, spec.palette.skin, ['dark', 'accent']); // 顔に溶けない、濃い色の枠を優先
      const frame = (tone = 0): Paint => paint(mat, tone);
      const boxes: [number, number][] = [[0, 3], [4, 7]]; // 左右のレンズの枠 (列の範囲)
      for (const [x0, x1] of boxes) {
        for (let x = x0 + 1; x < x1; x++) { head.set(f + x, top, frame(1)); if (!(y => y === mouth && (x === 3 || x === 4))(bottom)) head.set(f + x, bottom, frame()); } // 上と下の辺 (角は省く)
        for (let y = top + 1; y < bottom; y++) { head.set(f + x0, y, frame()); head.set(f + x1, y, frame()); } // 左右の辺
      }
      for (let c = 0; c < 3; c++) { head.set(head.rightWidth - 1 - c, top + 1, frame()); head.set(head.leftStart + c, top + 1, frame()); } // つる
    } else if (accessory === 'earrings') {
      // イヤリング: 耳の位置 (側面の中ほど、5〜6行目) に、光る玉と、垂れる飾り
      const mat = pickMat(spec, spec.palette.skin);
      const both = chance(rng, 0.8);
      const drop = (c: number) => { head.set(c, 5, paint(mat, 1, true)); head.set(c, 6, paint(mat, 0)); };
      drop(3);
      if (both) drop(head.leftStart + 4);
    } else if (accessory === 'scarf') {
      // マフラー: 首に巻いて、前に垂らす。毛糸の編み目のように、1列おきに明るさを変える
      const mat = pickMat(spec, spec.palette.primary);
      const knit = (c: number, tone = 0): Paint => paint(mat, (c % 2 === 0 ? 0 : -1) + tone);
      for (let c = 0; c < body.width; c++) for (let y = 0; y < 2; y++) body.set(c, y, knit(c, y === 1 ? -1 : 0));
      const bf = body.frontStart;
      for (let y = 2; y <= 5; y++) for (const x of [5, 6]) { if (y === 5 && x === 6) continue; body.set(bf + x, y, knit(x, y === 5 ? -1 : 0)); } // 垂れる端 (先はふさ)
      buf.face('body', 'over', 'top').fill(paint(mat, 0));
    } else if (accessory === 'gloves') {
      // 手袋: 手首から先 (9〜11行目)。色は素の層に塗り(外側の層で厚くすると、大きな箱のミトンになる)、手首の縁だけを外側の層で薄く重ねる
      const mat = pickMat(spec, spec.palette.skin);
      for (const name of ['rightArm', 'leftArm'] as const) {
        const arm = buf.band(name, 'base');
        const cuff = buf.band(name, 'over');
        for (let c = 0; c < arm.width; c++) {
          for (let y = 9; y < 12; y++) arm.set(c, y, paint(mat, y === 11 ? -1 : 0));
          cuff.set(c, 9, paint(mat, 1)); // 手首の縁 (少し厚く、明るく)
        }
        buf.face(name, 'base', 'bottom').fill(paint(mat, -1));
      }
    }
  }
}
