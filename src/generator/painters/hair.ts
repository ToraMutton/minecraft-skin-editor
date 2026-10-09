// 髪
// ベース(素の層)と外側の層を、役割を分けて混ぜて作る (外側の層で全体を覆わない):
//   ・ベース: 髪の本体と、生え際の形。前髪は毎回違う形 (片流れ・中分け・カーテン・不揃い) で、一直線のぱっつんにしない
//   ・外側の層: 一部だけ。頭頂のふくらみ・長く垂れる前髪の束・顔まわりの髪・毛先と、髪型ごとの飛び出し (ポニーテール・ツインテール・お団子)
//   ・髪束 (幅2〜3列) ごとに、影の列を途切れさせ、ツヤの高さをずらす。根元は暗く、毛先は束ごとに長さを変える
//   ・ベースは落ち着いた色 (ツヤは控えめ)、外側の層にツヤの山を置く。外側の層の下のベースは、接触部分の影で暗くなる
// (調べた、マイクラスキンの髪の描き方の共通点: 前髪はベースと外側の両方に描く / 前髪の後ろのベースは暗く / おでこを1〜3ピクセル見せる /
//  外側の層は足したり削ったりして奥行きを出す / 立体的な部分は多すぎない / 頭頂は分け目と流れだけで、中心だけ明るくしない)
import { paint } from '../buffer';
import type { BandView, FaceView, Paint } from '../buffer';
import { chance, int, pick, shuffle } from '../prng';
import type { Rng } from '../prng';
import type { HairStyle } from '../spec';
import type { PaintContext } from './util';

// --- 髪型ごとの、ベースの長さ ---
// 側面 (右側面の列0〜7。列0が後ろ、列7が顔の側) の、上から何行が髪か
const SIDE: Record<HairStyle, number[]> = {
  short: [5, 5, 4, 4, 3, 3, 3, 2],
  medium: [8, 8, 7, 6, 6, 5, 4, 3],
  long: [8, 8, 8, 8, 8, 7, 6, 4],
  ponytail: [5, 5, 4, 4, 3, 3, 3, 2], // 後ろでまとめる: 耳が出る
  twintails: [6, 6, 5, 5, 4, 4, 3, 3],
  bun: [4, 4, 4, 3, 3, 3, 2, 2],
};
// 後ろ (列0〜7)
const BACK: Record<HairStyle, number[]> = {
  short: [5, 6, 6, 6, 6, 6, 6, 5],
  medium: [7, 8, 8, 8, 8, 8, 8, 7],
  long: [8, 8, 8, 8, 8, 8, 8, 8],
  ponytail: [4, 5, 5, 5, 5, 5, 5, 4],
  twintails: [6, 6, 6, 6, 6, 6, 6, 6],
  bun: [4, 4, 4, 4, 4, 4, 4, 4],
};

// 前髪の生え際 (正面の列0〜7の、上から何行が髪か。1〜3行: おでこが見える。目にかからない)
// どれも、場所によって長さが違う。全部同じ長さの「ぱっつん」は作らない
const BANGS = {
  sweep: [3, 3, 2, 2, 1, 1, 1, 2], // 片側に流れる
  parted: [3, 3, 2, 1, 1, 2, 3, 3], // 中分けのカーテン
  curtain: [3, 2, 1, 1, 1, 1, 2, 3], // 広いおでこを出して、両端にだけ垂れる
  jagged: [2, 3, 2, 1, 2, 3, 2, 2], // 不揃い
  asym: [2, 2, 3, 3, 2, 1, 1, 2], // 左右非対称
} as const;
type BangKind = keyof typeof BANGS;

interface Strand { start: number; width: number; tip: number; darkFrom: number; darkLen: number }

// 帯の32列を、幅2〜3の髪束に分ける。tip: 毛先の長さの差 / darkFrom, darkLen: 束の影の列を、どの高さからどれだけ続けるか (全長に通すと縞に見えるので、途切れさせる)
function makeStrands(rng: Rng, columns: number): Strand[] {
  const strands: Strand[] = [];
  for (let c = 0; c < columns;) {
    let width = int(rng, 2, 3);
    if (columns - c - width === 1) width += 1; // 最後に1列だけ余らせない
    width = Math.min(width, columns - c);
    strands.push({ start: c, width, tip: pick(rng, [-1, 0, 0, 1]), darkFrom: int(rng, 1, 3), darkLen: int(rng, 2, 4) });
    c += width;
  }
  return strands;
}
const lit = (s: Strand) => Math.floor((s.width - 1) / 2); // ツヤの列 (幅2なら左、幅3なら真ん中)
const mid = (s: Strand) => s.start + lit(s);

// 髪束の中の位置から、色の段階を決める
//   k: 束の中の列 (0=左)  y: 上からの行  depth: 束の長さ  hy: ツヤの高さ  peak: ツヤの強さ (ベースは1、外側の層は2)
function hairTone(strand: Strand, k: number, y: number, depth: number, hy: number, peak: number): number {
  const dark = strand.width - 1; // 影の列 (右端)
  let tone = 0;
  if (y === 0 && k !== lit(strand)) tone = -1; // 根元
  if (k === dark && y >= strand.darkFrom && y < strand.darkFrom + strand.darkLen) tone = -1; // 束の境目 (途切れる影)
  if (k === lit(strand)) { // ツヤ: 縦に3行の細長い形 (弱・強・弱)
    if (y === hy + 1) tone = peak;
    else if (y === hy || y === hy + 2) tone = Math.max(1, peak - 1);
  }
  if (y === depth - 1 && y >= 3 && k !== lit(strand)) tone = Math.min(tone, -1); // 毛先
  return tone;
}

export function paintHair({ buf, spec, rng }: PaintContext) {
  const style = spec.hair;
  const head = buf.band('head', 'base');
  const over = buf.band('head', 'over');
  const hair = (tone = 0): Paint => paint('hair', tone);

  // --- 列ごとのベースの長さ ---
  const kind = pick(rng, Object.keys(BANGS) as BangKind[]);
  const bangs = chance(rng, 0.5) ? [...BANGS[kind]] : [...BANGS[kind]].reverse(); // 左右どちら向きにもなる
  const depth: number[] = new Array(32).fill(0);
  for (let s = 0; s < 8; s++) {
    depth[s] = SIDE[style][s]; // 右側面
    depth[16 + (7 - s)] = SIDE[style][s]; // 左側面 (右側面を折り返す)
    depth[24 + s] = BACK[style][s]; // 後ろ
    depth[8 + s] = bangs[s]; // 前髪
  }
  const strands = makeStrands(rng, head.width);
  const strandOf = (c: number) => strands.find(s => c >= s.start && c < s.start + s.width)!;
  for (let c = 0; c < 32; c++) {
    if (c >= 8 && c < 16) continue; // 前髪は、決めた生え際のまま
    if (depth[c] >= 4) depth[c] = Math.max(3, Math.min(8, depth[c] + strandOf(c).tip));
  }

  // --- ベース (素の層): 髪の本体。ツヤは控えめ ---
  strands.forEach((strand, index) => {
    const hy = 1 + (index % 3);
    for (let k = 0; k < strand.width; k++) {
      const c = strand.start + k;
      for (let y = 0; y < depth[c]; y++) head.set(c, y, hair(hairTone(strand, k, y, depth[c], hy, 1)));
    }
  });
  const part = int(rng, 2, 5); // 分け目の位置
  paintCrown(buf.face('head', 'base', 'top'), part, hair);

  // --- 外側の層: 一部だけ ---
  // strand の列 k について、上から [from, to) 行を外側の層に描く。毛先 (to-1 行) は束の真ん中の列だけを残して尖らせる
  const strandOverlay = (strand: Strand, index: number, from: number, to: number, taper = true, smoothTop = false) => {
    const hy = 2 + (index % 3);
    const peak = index % 2 === 0 ? 2 : 1; // ツヤは、1本おきの束だけ強く (外側の層にツヤが散らばりすぎない)
    for (let k = 0; k < strand.width; k++) {
      const c = strand.start + k;
      const limit = c >= 8 && c < 16 ? 3 : 8; // 前髪の列は、どの束に含まれていても、目にかからない3行まで
      for (let y = Math.max(0, from); y < Math.min(to, limit); y++) {
        if (taper && y === to - 1 && to - from >= 2 && strand.width >= 2 && k !== lit(strand)) continue; // 尖った毛先と、束のあいだの切れ込み
        over.set(c, y, hair(smoothTop && y === 0 ? 0 : hairTone(strand, k, y, to, hy, peak))); // 頭頂のふちの1行目は一定の色 (束ごとに明暗を変えると、上端がギザギザに見える)
      }
    }
  };
  const minDepth = (s: Strand) => Math.min(...Array.from({ length: s.width }, (_, k) => depth[s.start + k]));
  const lockColumn = (c: number) => (c >= 5 && c <= 7) || (c >= 16 && c <= 18); // 顔に近い側面の列 (もみあげ)
  const LOCK_EXTENSION: Record<HairStyle, number> = { short: 1, medium: 2, long: 3, ponytail: 1, twintails: 1, bun: 1 };

  // ① 頭頂のふちのふくらみ: 髪束の上の1行は、ほぼ全周を覆って滑らかに (ときどき欠ける)。2行目は後ろ・横の束の半分だけ。前髪の列は、生え際の1行まで
  strands.forEach((strand, index) => {
    const front = mid(strand) >= 8 && mid(strand) < 16;
    if (chance(rng, 0.92)) strandOverlay(strand, index, 0, !front && chance(rng, 0.5) ? 2 : 1, false, true);
  });
  // ② 前髪: 2〜4本の束だけが、生え際より長く垂れる (3行まで)。ベースの前髪の下の部分と1行重ねる
  const frontStrands = strands.map((s, i) => ({ s, i })).filter(({ s }) => mid(s) >= 8 && mid(s) < 16);
  const bangCount = Math.min(frontStrands.length, int(rng, 2, 4));
  for (const { s, i } of shuffle(rng, frontStrands).slice(0, bangCount)) {
    const d0 = minDepth(s);
    const to = Math.min(3, d0 + (chance(rng, 0.6) ? 1 : 2));
    if (to > d0) strandOverlay(s, i, d0 - 1, to);
  }
  // ③ 顔まわりの髪 (もみあげ): 顔に近い側面の束が、ベースより長く垂れる
  strands.forEach((strand, index) => {
    if (!lockColumn(mid(strand))) return;
    const d0 = minDepth(strand);
    const to = Math.min(8, d0 + LOCK_EXTENSION[style] + int(rng, 0, 1));
    if (to > d0) strandOverlay(strand, index, d0 - 1, to);
  });
  // ④ 毛先: 長い束の先が、ベースの先より1〜2行はみ出す (束ごとに長さが違い、切れ込みができる)
  strands.forEach((strand, index) => {
    const m = mid(strand);
    if ((m >= 8 && m < 16) || lockColumn(m)) return;
    const d0 = minDepth(strand);
    if (d0 >= 5 && d0 < 8 && chance(rng, 0.65)) strandOverlay(strand, index, d0 - 2, Math.min(8, d0 + int(rng, 1, 2)));
  });
  // ⑤ 頭頂: 全体は覆わず、2〜4つの小さな毛束のかたまりだけ
  paintCrownClumps(buf.face('head', 'over', 'top'), rng, part, hair);

  // --- 髪型ごとの飛び出し ---
  const body = buf.band('body', 'over');
  const tie = (): Paint => paint('accessory', 0); // 髪ゴム (小物の色)
  if (style === 'long') paintLong(body, rng, hair);
  else if (style === 'medium') paintFlick(body, rng, hair);
  else if (style === 'ponytail') paintPonytail(over, body, rng, hair, tie);
  else if (style === 'twintails') paintTwintails(over, body, rng, hair, tie);
  else if (style === 'bun') paintBun(buf.face('head', 'over', 'top'), over, rng, hair, tie);
}

// 頭頂 (ベース): 分け目 (前から後ろへの暗い線) と、光の当たる左側の流れ
// 頭頂の面は、上が後ろ、下(y=7)が前
function paintCrown(top: FaceView, part: number, hair: (tone?: number) => Paint) {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let tone = 0;
      if (x === part && y >= 4) tone = -2; // 分け目
      else if (x === part && y >= 2) tone = -1;
      else if ((x === 1 || x === 2) && y >= 1 && y <= 5) tone = 1; // 左(光の側)の流れ
      if (y === 7 && x !== part) tone = Math.min(tone, -1); // 前髪の生え際
      top.set(x, y, hair(tone));
    }
  }
}

// 頭頂 (外側の層): 小さなかたまりだけ。分け目の列は避ける
function paintCrownClumps(top: FaceView, rng: Rng, part: number, hair: (tone?: number) => Paint) {
  const clumps = int(rng, 1, 2);
  for (let n = 0; n < clumps; n++) {
    const w = 3, h = 3, x0 = int(rng, 0, 8 - w), y0 = int(rng, 1, 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x0 + x === part) continue;
        top.set(x0 + x, y0 + y, hair(y === 0 && x === 0 ? 1 : x === w - 1 || y === h - 1 ? -1 : 0));
      }
    }
  }
}

// 毛先が襟足から肩にはねる (ミディアム): 束の2列ごとに、短く尖った毛先を出す
function paintFlick(back: BandView, rng: Rng, hair: (tone?: number) => Paint) {
  for (let x = 1; x <= 6; x += 2) {
    if (chance(rng, 0.3)) continue;
    const depth = int(rng, 1, 3);
    for (let y = 0; y < depth; y++) {
      back.set(back.backStart + x, y, hair(y === depth - 1 ? -1 : 0));
      if (y < depth - 1) back.set(back.backStart + x + 1, y, hair(x % 4 === 1 ? 0 : -1));
    }
  }
}

// 背中に垂らす髪 (体の外側の層) と、肩の前に垂れる毛束
// 2列ずつの束で、長さを束ごとに変え、毛先は真ん中だけを尖らせる。細かい点は散らさない
function paintLong(back: BandView, rng: Rng, hair: (tone?: number) => Paint) {
  for (let strand = 0; strand < 4; strand++) {
    if (strand > 0 && strand < 3 && chance(rng, 0.2)) continue; // 真ん中の束は、ときどき欠けて、ベースの髪が見える
    const depth = 3 + int(rng, 0, 4) + (strand === 0 || strand === 3 ? 1 : 0); // 3〜8行
    for (let k = 0; k < 2; k++) {
      const x = strand * 2 + k;
      for (let y = 0; y < depth; y++) {
        const tip = y === depth - 1;
        if (tip && k === 1) continue; // 毛先は左の列だけ (尖らせる)
        let tone = 0;
        if (tip) tone = -1;
        else if (k === 1 && y >= 1 && y <= 3) tone = -1; // 束の境目 (途切れる影)
        else if (k === 0 && y === 1) tone = 2; // ツヤ
        back.set(back.backStart + x, y, hair(tone));
      }
    }
  }
  shoulderLocks(back, rng, hair);
}

// 肩の前に垂れる毛束: 外側ほど長く、毛先は尖る
function shoulderLocks(body: BandView, rng: Rng, hair: (tone?: number) => Paint, sides: ('left' | 'right')[] = ['left', 'right']) {
  const f = body.frontStart;
  const spec: [number, number][] = [];
  if (sides.includes('right')) spec.push([0, 5], [1, 3]); // 画面の左 (キャラの右)
  if (sides.includes('left')) spec.push([6, 3], [7, 5]);
  for (const [x, length] of spec) {
    const depth = Math.max(2, length + int(rng, -1, 0));
    for (let y = 0; y < depth; y++) {
      if (y === depth - 1 && (x === 1 || x === 6)) continue; // 内側の毛束は、先を少し短く
      body.set(f + x, y, hair(y === depth - 1 ? -1 : (y === 1 ? 2 : 0)));
    }
  }
}

// ポニーテール: 後頭部の高い位置を髪ゴムで結び、そこから尾が垂れる (頭の後ろ → 背中)
function paintPonytail(over: BandView, body: BandView, rng: Rng, hair: (tone?: number) => Paint, tie: () => Paint) {
  const b = over.backStart;
  const knot = int(rng, 1, 2); // 結び目の高さ (1〜2行目)
  // 結び目の上: 髪が束ねられて集まる
  for (let y = 0; y < knot; y++) for (let x = 2; x <= 5; x++) over.set(b + x, y, hair(x === 2 || x === 5 ? -1 : (y === 0 ? 1 : 0)));
  for (const x of [3, 4]) over.set(b + x, knot, tie()); // 髪ゴム
  // 尾: 幅2。途中で少し揺れる。頭の後ろから、背中 (体の外側の層) へ
  let left = 3;
  const length = 7 - knot + int(rng, 2, 5); // 結び目の下から数えた長さ
  for (let i = 0; i < length; i++) {
    const row = knot + 1 + i; // 頭の帯の行 (8以上は体)
    if (i === 3 && chance(rng, 0.5)) left += chance(rng, 0.5) ? 1 : -1; // 揺れ
    const tip = i === length - 1, tail = (i % 3 === 1) ? -1 : 0;
    const set = (x: number, y: number, tone: number) => (y < 8 ? over.set(b + x, y, hair(tone)) : body.set(body.backStart + x, y - 8, hair(tone)));
    set(left, row, tip ? -1 : (i === 1 ? 2 : 0)); // 左の列 (ツヤ)
    if (!tip) set(left + 1, row, tail); // 右の列は影のめりはり。先端は左の列だけ (尖る)
  }
}

// ツインテール: 頭の両側の高い位置を結び、尾が肩へ垂れる (側面 → 肩の前の毛束)
function paintTwintails(over: BandView, body: BandView, rng: Rng, hair: (tone?: number) => Paint, tie: () => Paint) {
  for (const face of [0, over.leftStart]) { // 右側面 / 左側面 (どちらも、列3〜5が耳のあたり)
    for (let x = 2; x <= 5; x++) over.set(face + x, 0, hair(x === 3 ? 1 : 0)); // 結び目の上に、髪が集まる
    for (let x = 3; x <= 4; x++) over.set(face + x, 1, hair(x === 4 ? -1 : 0));
    over.set(face + 3, 2, tie()); over.set(face + 4, 2, tie()); // 髪ゴム
    const length = int(rng, 4, 5); // 尾の長さ (側面の3行目から)
    for (let i = 0; i < length; i++) {
      const y = 3 + i;
      const widthHere = i <= 1 ? 3 : i <= 3 ? 2 : 1; // 先へ行くほど細くなる
      for (let k = 0; k < widthHere; k++) over.set(face + 3 + k - (widthHere === 3 ? 1 : 0), y, hair(k === widthHere - 1 ? -1 : (k === 0 && i === 1 ? 2 : 0)));
    }
  }
  shoulderLocks(body, rng, hair); // 肩の前に垂れる尾の先
}

// お団子: 頭の後ろ上に、まとめた髪のかたまり (頭頂の外側の層に、ふくらみ)。髪ゴムが根元を締める
function paintBun(top: FaceView, over: BandView, rng: Rng, hair: (tone?: number) => Paint, tie: () => Paint) {
  const x0 = int(rng, 2, 3); // 左右に少し寄せることもある
  // 頭頂: 4×4 のかたまり。光は左上 (左上が明るく、右下が暗い)。中心だけ明るくはしない
  for (let y = 1; y <= 4; y++) {
    for (let x = x0; x < x0 + 4; x++) {
      const edge = x === x0 + 3 || y === 4;
      top.set(x, y, hair(edge ? -1 : (x === x0 && y === 1 ? 2 : (x === x0 || y === 1 ? 1 : 0))));
    }
  }
  top.set(x0 + 1, 2, hair(2)); // ツヤ (団子の渦の目印)
  // 後ろ・横から見たふくらみ: 後頭部の上の2行
  const b = over.backStart;
  for (let x = x0; x < x0 + 4; x++) { over.set(b + x, 0, hair(x === x0 ? 1 : 0)); over.set(b + x, 1, hair(x >= x0 + 2 ? -1 : 0)); }
  for (const x of [x0 + 1, x0 + 2]) over.set(b + x, 2, tie()); // 髪ゴム
  for (const x of [0, 1]) { over.set(x, 0, hair(x === 0 ? -1 : 0)); over.set(over.leftStart + 7 - x, 0, hair(x === 0 ? -1 : 0)); } // 側面の上の後ろ寄りにも少し
}
