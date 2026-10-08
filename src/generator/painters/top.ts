// 上着: Tシャツ / パーカー / ジャケット
// 襟・袖口・裾に厚みを出し、シワは布が引っ張られる向きに描く。ジャケットとフードは外側の層(上着の層)に描いて立体感を出す
import { paint } from '../buffer';
import type { BandView, Mat } from '../buffer';
import { chance, int, pick, shuffle } from '../prng';
import type { Rng } from '../prng';
import { nudgeBand } from './util';
import type { PaintContext } from './util';

// シワ: 正面の左から x 列目・上から y 行目 (0〜7, 0〜9)。腋から腰に向かって引っ張られる向きの短い線
const FOLDS: [number, number][][] = [
  [[1, 2], [1, 3], [2, 4]], // 左の腋から
  [[6, 3], [6, 4], [5, 5]], // 右の腋から
  [[3, 6], [4, 7]], // おなか
  [[1, 6], [2, 7], [2, 8]], // 左の腰
  [[6, 7], [5, 8]], // 右の腰
];

// 正面(または背面)の start から8列の範囲に、シワを2本描く。左右反転することもある
function drawFolds(band: BandView, start: number, rng: Rng, count: number, delta: number) {
  const chosen = shuffle(rng, FOLDS).slice(0, count);
  for (const fold of chosen) {
    const flip = chance(rng, 0.5);
    for (const [x, y] of fold) nudgeBand(band, start + (flip ? 7 - x : x), y, delta);
  }
}

export function paintTop({ buf, spec, rng }: PaintContext) {
  const long = spec.top !== 'tshirt'; // パーカー・ジャケットは長袖で、丈も長い
  const jacket = spec.top === 'jacket';
  const hoodie = spec.top === 'hoodie';
  const cloth: Mat = jacket ? 'inner' : 'top'; // ジャケットのときの素の層は、中に着ているシャツ
  const rows = long ? 11 : 10; // 胴のうち、上着が覆う行数 (残りはベルト・ズボン)
  const c0 = (tone = 0) => paint(cloth, tone);

  // --- 胴 ---
  const body = buf.band('body', 'base');
  const f = body.frontStart, b = body.backStart;
  for (let c = 0; c < body.width; c++) {
    for (let y = 0; y < rows; y++) body.set(c, y, c0());
    // 裾: Tシャツ・ジャケットは1行だけ少し暗く、パーカーは編み目(リブ)のように1列おきに
    body.set(c, rows - 1, c0(hoodie ? (c % 2 === 0 ? -1 : 0) : -1));
  }
  buf.face('body', 'base', 'top').fill(c0());

  // 縞 (Tシャツ): 胴を1周する横線。腕には入れない
  if (spec.stripes && spec.top === 'tshirt') {
    for (const y of [2, 5, 8]) for (let c = 0; c < body.width; c++) body.set(c, y, paint('accent'));
  }

  // 襟ぐり: 首の肌が見え、そのまわりに襟のふち。背面にも襟
  body.set(f + 3, 0, paint('skin')); body.set(f + 4, 0, paint('skin'));
  for (const [x, y] of [[2, 0], [5, 0], [3, 1], [4, 1]]) body.set(f + x, y, c0(-1));
  for (let x = 2; x <= 5; x++) body.set(b + x, 0, c0(-1));

  // --- 腕 ---
  for (const name of ['rightArm', 'leftArm'] as const) {
    const arm = buf.band(name, 'base');
    const sleeve = spec.top === 'tshirt' ? 4 : 10; // 袖の行数 (残りは素肌)
    for (let c = 0; c < arm.width; c++) {
      for (let y = 0; y < sleeve; y++) arm.set(c, y, c0());
      // 袖口: パーカーはリブ、ジャケットは中のシャツの袖口が見える。Tシャツは、下の腕に落ちる影(接触部分の影)が縁になる
      arm.set(c, sleeve - 1, c0(hoodie ? (c % 2 === 0 ? -1 : 0) : spec.top === 'jacket' ? -1 : 0));
    }
    buf.face(name, 'base', 'top').fill(c0());
    if (long) { // 肘のシワ (左右で位置を変える)
      const x = name === 'rightArm' ? 1 : arm.frontWidth - 2;
      nudgeBand(arm, arm.frontStart + x, 5, -1);
      nudgeBand(arm, arm.backStart + (name === 'rightArm' ? 1 : 0), 4, -1);
    }
  }

  // --- シワ (胴の前・後ろ) ---
  if (!jacket) {
    drawFolds(body, f, rng, 2, -1);
    drawFolds(body, b, rng, 1, -1);
  }

  if (hoodie) paintHoodie(buf, body, rng);
  if (jacket) paintJacket(buf, rng);
}

// パーカー: 紐・ポケット(素の層)と、フード(外側の層)
function paintHoodie(buf: PaintContext['buf'], body: BandView, rng: Rng) {
  const f = body.frontStart, b = body.backStart;
  const cloth = (tone = 0) => paint('top', tone);

  // 紐: 襟ぐりから垂れる2本。先(金具)は少し明るく
  for (const x of [2, 5]) {
    body.set(f + x, 2, paint('accent')); body.set(f + x, 3, paint('accent'));
    body.set(f + x, 4, paint('accent', 1));
  }
  // カンガルーポケット: 上の縁は影になり、両端が縫い目
  for (let x = 1; x <= 6; x++) body.set(f + x, 6, cloth(-1));
  for (const x of [1, 6]) for (let y = 7; y <= 8; y++) body.set(f + x, y, cloth(-1));

  // フード (外側の層): 背中に垂れ、首のまわりにもかかる
  const over = buf.band('body', 'over');
  for (let y = 0; y <= 2; y++) {
    for (let x = 1; x <= 6; x++) over.set(b + x, y, cloth((x === 1 || x === 6) && y > 0 ? -1 : 0));
  }
  for (let x = 2; x <= 5; x++) over.set(b + x, 3, cloth(-1)); // フードの底 (細くなる)
  for (const x of [1, 2, 5, 6]) over.set(f + x, 0, cloth()); // 首の前にかかる部分
  for (const x of [1, 6]) over.set(f + x, 1, cloth(-1));
  for (let y = 0; y <= 1; y++) for (const x of [0, 1]) { over.set(x, y, cloth()); over.set(over.leftStart + over.rightWidth - 1 - x, y, cloth()); } // 両肩
  if (chance(rng, 0.5)) over.set(b + int(rng, 2, 5), 3, cloth(0)); // フードの底が少しずれる
}

// ジャケット: 外側の層に描く。前が開いていて、中のシャツ(素の層)が見える。襟を立て、袖は袖口から中のシャツが覗く
function paintJacket(buf: PaintContext['buf'], rng: Rng) {
  const cloth = (tone = 0) => paint('top', tone);
  const over = buf.band('body', 'over');
  const f = over.frontStart, b = over.backStart;
  const open = (c: number) => c === f + 3 || c === f + 4; // 前の開き

  for (let c = 0; c < over.width; c++) {
    if (open(c)) continue;
    for (let y = 0; y <= 10; y++) over.set(c, y, cloth(y === 10 ? -1 : 0)); // 裾は少し暗く
  }
  // 前の縁: ほんのり明るい (折り返しの厚み)
  for (let y = 2; y <= 10; y++) { over.set(f + 2, y, cloth(1)); over.set(f + 5, y, cloth(1)); }
  // 立てた襟 (前と後ろ)
  for (let y = 0; y <= 2; y++) { over.set(f + 2, y, cloth(1)); over.set(f + 5, y, cloth(1)); }
  for (const x of [1, 6]) over.set(f + x, 0, cloth(1));
  for (let x = 1; x <= 6; x++) over.set(b + x, 0, cloth(1));
  // ポケットの口 と ファスナーの引き手
  over.set(f + 1, 7, cloth(-1)); over.set(f + 6, 7, cloth(-1));
  over.set(f + 2, 3, paint('accent', 1));
  buf.face('body', 'over', 'top').fill(cloth());

  // 背中のシワ
  const shift = pick(rng, [0, 1]);
  nudgeBand(over, b + 2 + shift, 4, -1); nudgeBand(over, b + 3 + shift, 5, -1);

  // 袖 (外側の層)。素の層は中のシャツで、袖口の1行だけがジャケットの下から見える
  for (const name of ['rightArm', 'leftArm'] as const) {
    const arm = buf.band(name, 'over');
    for (let c = 0; c < arm.width; c++) for (let y = 0; y <= 8; y++) arm.set(c, y, cloth(y === 8 ? -1 : 0));
    buf.face(name, 'over', 'top').fill(cloth());
  }
}
