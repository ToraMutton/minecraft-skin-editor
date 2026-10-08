// 髪
// 1本ずつではなく「髪束」(幅2〜3列)の集まりとして描く:
//   ・束の右端の列は影、真ん中(または左)の列にツヤ。ツヤの高さは束ごとに少しずつずらす
//   ・根元(一番上の行)は暗く、毛先は束ごとに長さを変える
//   ・前髪・横髪・後ろ髪は外側の層にも描き、厚みと毛先の隙間(透明)を出す
//   ・頭頂は、分け目と、光の当たる左側の流れだけを描く (中心だけ明るい「ピローシェーディング」にしない)
import { paint } from '../buffer';
import type { BandView, FaceView, Paint } from '../buffer';
import { chance, int, pick } from '../prng';
import type { Rng } from '../prng';
import type { HairStyle } from '../spec';
import type { PaintContext } from './util';

// 側面 (右側面の列0〜7。列0が後ろ、列7が顔の側) の、上から何行が髪か
const SIDE: Record<HairStyle, number[]> = {
  short: [5, 5, 4, 4, 3, 3, 3, 2],
  medium: [8, 8, 7, 6, 6, 5, 4, 3],
  long: [8, 8, 8, 8, 8, 7, 6, 4],
};
// 後ろ (列0〜7)
const BACK: Record<HairStyle, number[]> = {
  short: [5, 6, 6, 6, 6, 6, 6, 5],
  medium: [7, 8, 8, 8, 8, 8, 8, 7],
  long: [8, 8, 8, 8, 8, 8, 8, 8],
};

type Fringe = 'straight' | 'swept' | 'parted' | 'wispy';
// 前髪 (正面の列0〜7)。目(3行目)にかからないよう、最大3行
function fringeProfile(kind: Fringe, style: HairStyle, towardRight: boolean): number[] {
  const l = style === 'short' ? 2 : 3;
  let depth: number[];
  if (kind === 'swept') depth = style === 'short' ? [1, 2, 2, 2, 2, 3, 3, 3] : [2, 2, 2, 3, 3, 3, 3, 3]; // 片側に流れる
  else if (kind === 'parted') depth = style === 'short' ? [2, 2, 2, 1, 1, 2, 2, 2] : [3, 3, 3, 2, 2, 3, 3, 3]; // 中分けのカーテン
  else depth = [l + 1, l, l, l, l, l, l, l + 1]; // straight / wispy: 両端は顔の輪郭に沿って長め
  const clamped = depth.map(d => Math.min(3, d));
  return towardRight ? clamped : [...clamped].reverse();
}

// tip: 毛先の長さの差 / darkFrom, darkLen: 束の影の列を、どの高さからどれだけ続けるか (全長に通すと縞に見えるので、途切れさせる)
interface Strand { start: number; width: number; tip: number; darkFrom: number; darkLen: number }

// 帯の32列を、幅2〜3の髪束に分ける
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

// 髪束の中の位置から、色の段階を決める
//   k: 束の中の列 (0=左)  y: 上からの行  hy: ツヤの高さ
function hairTone(strand: Strand, k: number, y: number, depth: number, hy: number): number {
  const lit = Math.floor((strand.width - 1) / 2); // ツヤの列 (幅2なら左、幅3なら真ん中)
  const dark = strand.width - 1; // 影の列 (右端)
  let tone = 0;
  if (y === 0 && k !== lit) tone = -1; // 根元
  if (k === dark && y >= strand.darkFrom && y < strand.darkFrom + strand.darkLen) tone = -1; // 束の境目 (途切れる影)
  if (k === lit) { // ツヤ: 縦に3行の細長い形 (弱・強・弱)
    if (y === hy + 1) tone = 2;
    else if (y === hy || y === hy + 2) tone = 1;
  }
  if (y === depth - 1 && y >= 3 && k !== lit) tone = Math.min(tone, -1); // 毛先
  return tone;
}

export function paintHair({ buf, spec, rng }: PaintContext) {
  const style = spec.hair;
  const head = buf.band('head', 'base');
  const over = buf.band('head', 'over');
  const hair = (tone = 0): Paint => paint('hair', tone);

  // --- 列ごとの髪の長さ (上から何行) ---
  const kind = pick(rng, ['straight', 'swept', 'parted', 'wispy'] as const);
  const towardRight = chance(rng, 0.5);
  const fringe = fringeProfile(kind, style, towardRight);
  const depth: number[] = new Array(32).fill(0);
  for (let s = 0; s < 8; s++) {
    depth[s] = SIDE[style][s]; // 右側面
    depth[16 + (7 - s)] = SIDE[style][s]; // 左側面 (右側面を折り返す)
    depth[24 + s] = BACK[style][s]; // 後ろ
    depth[8 + s] = fringe[s]; // 前髪
  }
  const strands = makeStrands(rng, head.width);
  const strandOf = (c: number) => strands.find(s => c >= s.start && c < s.start + s.width)!;
  for (let c = 0; c < 32; c++) {
    if (c >= 8 && c < 16) continue; // 前髪は毛先をそろえる
    if (depth[c] >= 4) depth[c] = Math.max(3, Math.min(8, depth[c] + strandOf(c).tip));
  }

  // --- 素の層 ---
  strands.forEach((strand, index) => {
    const hy = 1 + (index % 3); // ツヤの高さを、束ごとにずらす
    for (let k = 0; k < strand.width; k++) {
      const c = strand.start + k;
      for (let y = 0; y < depth[c]; y++) head.set(c, y, hair(hairTone(strand, k, y, depth[c], hy)));
    }
  });
  const part = int(rng, 2, 5); // 分け目の位置 (素の層と外側の層で同じ)
  paintCrown(buf.face('head', 'base', 'top'), part, hair);

  // --- 外側の層: 厚みと、毛先の隙間 ---
  strands.forEach((strand, index) => {
    const hy = 2 + (index % 3);
    for (let k = 0; k < strand.width; k++) {
      const c = strand.start + k;
      const isFringe = c >= 8 && c < 16;
      const d = isFringe ? depth[c] : Math.min(8, depth[c] + (chance(rng, 0.35) ? 1 : 0));
      for (let y = 0; y < d; y++) {
        const tip = y === d - 1 && y >= 2;
        if (tip && chance(rng, isFringe && kind === 'wispy' ? 0.55 : 0.25)) continue; // 毛先の隙間 (下の層が見える)
        over.set(c, y, hair(hairTone(strand, k, y, d, hy)));
      }
    }
  });
  paintCrown(buf.face('head', 'over', 'top'), part, hair);

  // --- 長い髪は、背中・肩にも垂らす ---
  if (style === 'long') paintLong(buf.band('body', 'over'), rng, hair);
  else if (style === 'medium') {
    const back = buf.band('body', 'over');
    for (let x = 1; x <= 6; x++) if (chance(rng, 0.7)) back.set(back.backStart + x, 0, hair(x % 2 === 0 ? 0 : -1)); // 襟足の毛先
  }
}

// 頭頂: 分け目 (前から後ろへの暗い線) と、光の当たる左側の流れ
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

// 背中に垂らす髪 (体の外側の層) と、肩の前に垂れる毛束
function paintLong(back: BandView, rng: Rng, hair: (tone?: number) => Paint) {
  // 2列ずつの束にして、毛先と、束の境目の短い影、ツヤの1点だけを描く (細かい点を散らさない)
  for (let x = 0; x < 8; x++) {
    const strand = Math.floor(x / 2);
    const depth = 3 + ((strand * 7 + int(rng, 0, 2)) % 3) + (x === 0 || x === 7 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      let tone = 0;
      if (y === depth - 1) tone = -1;
      else if (x % 2 === 1 && y >= 1 && y <= 2) tone = -1;
      else if (x % 2 === 0 && y === 1) tone = 1;
      back.set(back.backStart + x, y, hair(tone));
    }
  }
  const f = back.frontStart;
  for (const [x, length] of [[0, 5], [1, 3], [6, 3], [7, 5]] as const) {
    const depth = Math.max(2, length + int(rng, -1, 0));
    for (let y = 0; y < depth; y++) back.set(f + x, y, hair(y === depth - 1 ? -1 : 0));
  }
}
