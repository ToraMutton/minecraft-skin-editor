// 厳選した配色
// 乱数で色相を選ぶと、くすんだ色の組み合わせになりやすい (試作で分かった弱点)。そこで、
// 「主役の色は1〜2系統、アクセントは少量」になるよう人が組んだ配色を雰囲気ごとに用意し、seed で選ぶ。
// 真っ黒・真っ白は使わず、濃紺やオフホワイトを使う
import type { Oklch } from './color';
import type { Rng } from './prng';
import { pick, between } from './prng';

export type Mood = 'cute' | 'cool' | 'simple';

// 服まわりの配色
export interface Outfit {
  name: string; // 画面に出す名前
  primary: Oklch; // 上着の主役の色
  inner: Oklch; // 上着の中に着るシャツ
  accent: Oklch; // アクセント (縞・紐・靴紐・バックルなど。主役と明るさが離れた色)
  secondary: Oklch; // ズボン
  shoes: Oklch;
}

const o = (l: number, c: number, h: number): Oklch => ({ l, c, h });

export const OUTFITS: Record<Mood, Outfit[]> = {
  // かわいい: パステルの主役 + 明るい差し色
  cute: [
    { name: 'ストロベリー', primary: o(0.8, 0.09, 5), inner: o(0.95, 0.015, 20), accent: o(0.96, 0.02, 70), secondary: o(0.52, 0.07, 255), shoes: o(0.93, 0.012, 60) },
    { name: 'ミントグリーン', primary: o(0.84, 0.08, 170), inner: o(0.95, 0.02, 95), accent: o(0.66, 0.12, 350), secondary: o(0.58, 0.06, 235), shoes: o(0.93, 0.012, 95) },
    { name: 'ラベンダーミルク', primary: o(0.78, 0.09, 300), inner: o(0.95, 0.02, 300), accent: o(0.93, 0.05, 90), secondary: o(0.48, 0.07, 270), shoes: o(0.92, 0.012, 300) },
    { name: 'ソーダ', primary: o(0.82, 0.07, 235), inner: o(0.95, 0.015, 85), accent: o(0.95, 0.03, 85), secondary: o(0.5, 0.06, 35), shoes: o(0.93, 0.01, 85) },
    { name: 'ピーチ', primary: o(0.84, 0.08, 45), inner: o(0.96, 0.015, 95), accent: o(0.68, 0.1, 350), secondary: o(0.5, 0.08, 340), shoes: o(0.93, 0.012, 50) },
  ],
  // クール: 暗い服 + ネオンのアクセント
  cool: [
    { name: 'サイバー', primary: o(0.36, 0.035, 260), inner: o(0.72, 0.13, 195), accent: o(0.76, 0.13, 195), secondary: o(0.23, 0.02, 280), shoes: o(0.88, 0.012, 250) },
    { name: 'ネオンピンク', primary: o(0.38, 0.025, 300), inner: o(0.66, 0.2, 350), accent: o(0.68, 0.2, 350), secondary: o(0.25, 0.03, 280), shoes: o(0.88, 0.015, 300) },
    { name: 'ネイビー×オレンジ', primary: o(0.38, 0.07, 255), inner: o(0.9, 0.02, 90), accent: o(0.74, 0.14, 55), secondary: o(0.25, 0.04, 260), shoes: o(0.88, 0.02, 80) },
    { name: 'フォレスト', primary: o(0.38, 0.06, 160), inner: o(0.85, 0.15, 125), accent: o(0.84, 0.17, 125), secondary: o(0.25, 0.03, 220), shoes: o(0.9, 0.02, 160) },
    { name: 'ガンメタ×レッド', primary: o(0.44, 0.012, 260), inner: o(0.6, 0.2, 25), accent: o(0.6, 0.2, 25), secondary: o(0.24, 0.015, 260), shoes: o(0.88, 0.01, 20) },
  ],
  // シンプル: 普段着らしい、はっきりした主役の色
  simple: [
    { name: 'レッド×デニム', primary: o(0.58, 0.15, 28), inner: o(0.96, 0.01, 90), accent: o(0.92, 0.03, 85), secondary: o(0.42, 0.09, 255), shoes: o(0.93, 0.01, 90) },
    { name: 'カーキ', primary: o(0.55, 0.11, 150), inner: o(0.95, 0.02, 100), accent: o(0.9, 0.04, 100), secondary: o(0.7, 0.05, 85), shoes: o(0.33, 0.05, 55) },
    { name: 'イエロー×ネイビー', primary: o(0.84, 0.14, 95), inner: o(0.97, 0.01, 90), accent: o(0.97, 0.01, 90), secondary: o(0.35, 0.07, 260), shoes: o(0.55, 0.06, 50) },
    { name: 'ブルー', primary: o(0.55, 0.12, 250), inner: o(0.95, 0.01, 250), accent: o(0.95, 0.01, 250), secondary: o(0.4, 0.01, 260), shoes: o(0.95, 0.005, 90) },
    { name: 'オレンジ×ブラウン', primary: o(0.7, 0.15, 55), inner: o(0.95, 0.03, 90), accent: o(0.95, 0.03, 90), secondary: o(0.38, 0.06, 55), shoes: o(0.9, 0.02, 85) },
    { name: 'ティール×ベージュ', primary: o(0.55, 0.09, 200), inner: o(0.95, 0.02, 95), accent: o(0.95, 0.03, 95), secondary: o(0.8, 0.05, 85), shoes: o(0.4, 0.05, 55) },
  ],
};

export const SKIN_TONES: Oklch[] = [o(0.91, 0.045, 65), o(0.84, 0.06, 62), o(0.74, 0.08, 60), o(0.62, 0.09, 55), o(0.48, 0.07, 50)];
export const SKIN_NAMES = ['ごく明るい', '明るい', 'ふつう', 'こんがり', '濃い'];

// 上着・ズボン・小物の色 (名前付き)。画面では、それぞれ別々に選べる。選択肢の番号は、この並びの番号
export const TOP_COLORS: { name: string; color: Oklch }[] = [
  { name: 'オフホワイト', color: o(0.95, 0.012, 90) }, { name: 'クリーム', color: o(0.93, 0.04, 90) }, { name: 'ピンク', color: o(0.8, 0.09, 5) },
  { name: 'コーラル', color: o(0.7, 0.14, 30) }, { name: 'レッド', color: o(0.58, 0.15, 28) }, { name: 'オレンジ', color: o(0.7, 0.15, 55) },
  { name: 'イエロー', color: o(0.84, 0.14, 95) }, { name: 'ミント', color: o(0.84, 0.08, 170) }, { name: 'グリーン', color: o(0.55, 0.11, 150) },
  { name: 'カーキ', color: o(0.6, 0.06, 100) }, { name: 'スカイ', color: o(0.82, 0.07, 235) }, { name: 'ブルー', color: o(0.55, 0.12, 250) },
  { name: 'ネイビー', color: o(0.36, 0.07, 255) }, { name: 'ラベンダー', color: o(0.78, 0.09, 300) }, { name: 'パープル', color: o(0.5, 0.13, 305) },
  { name: 'グレー', color: o(0.6, 0.01, 260) }, { name: 'チャコール', color: o(0.36, 0.02, 270) }, { name: 'ブラック', color: o(0.25, 0.02, 275) },
];
export const BOTTOM_COLORS: { name: string; color: Oklch }[] = [
  { name: 'デニム', color: o(0.45, 0.09, 255) }, { name: 'ネイビー', color: o(0.3, 0.06, 258) }, { name: 'ブラック', color: o(0.24, 0.015, 270) },
  { name: 'チャコール', color: o(0.34, 0.015, 270) }, { name: 'グレー', color: o(0.58, 0.01, 260) }, { name: 'ベージュ', color: o(0.8, 0.05, 85) },
  { name: 'ブラウン', color: o(0.4, 0.06, 55) }, { name: 'カーキ', color: o(0.62, 0.06, 95) }, { name: 'オリーブ', color: o(0.45, 0.07, 125) },
  { name: 'ホワイト', color: o(0.93, 0.01, 90) }, { name: 'ワイン', color: o(0.38, 0.1, 15) }, { name: 'プラム', color: o(0.42, 0.09, 335) },
  { name: 'ピンク', color: o(0.8, 0.09, 5) }, { name: 'スカイ', color: o(0.78, 0.07, 235) },
];
export const ACCESSORY_COLORS: { name: string; color: Oklch }[] = [
  { name: 'ホワイト', color: o(0.95, 0.01, 90) }, { name: 'ブラック', color: o(0.26, 0.03, 285) }, { name: 'ピンク', color: o(0.78, 0.11, 350) },
  { name: 'レッド', color: o(0.55, 0.17, 25) }, { name: 'ゴールド', color: o(0.8, 0.13, 90) }, { name: 'ミント', color: o(0.82, 0.09, 165) },
  { name: 'スカイ', color: o(0.78, 0.09, 235) }, { name: 'ブルー', color: o(0.5, 0.15, 260) }, { name: 'パープル', color: o(0.52, 0.15, 305) },
  { name: 'ネオンシアン', color: o(0.8, 0.13, 195) }, { name: 'ネオンピンク', color: o(0.66, 0.2, 350) }, { name: 'オレンジ', color: o(0.7, 0.15, 55) },
  { name: 'ブラウン', color: o(0.38, 0.06, 55) },
];

// 色を選び直したとき、組み合わせる色が近くなりすぎたら、読める色に直す (明るさが離れた色に)
export const gapL = (a: Oklch, b: Oklch) => Math.abs(a.l - b.l);
// 上着の中に着るシャツ: 上着が明るければ濃い色、暗ければオフホワイト
export const innerFor = (primary: Oklch): Oklch => (primary.l > 0.65 ? o(0.35, 0.05, primary.h) : o(0.95, 0.015, primary.h));
// アクセント (縞・紐・靴紐など): 上着が明るければ濃い補色寄り、暗ければ明るいクリーム寄り
export const accentFor = (primary: Oklch): Oklch => (primary.l > 0.65 ? o(0.42, 0.1, (primary.h + 150) % 360) : o(0.93, 0.03, (primary.h + 60) % 360));
// 靴: ズボンが明るければ濃い茶、暗ければオフホワイト
export const shoesFor = (secondary: Oklch): Oklch => (secondary.l > 0.6 ? o(0.35, 0.05, 55) : o(0.92, 0.012, 90));

// 小物の色を、肌・髪・上着と明るさが離れたものから選ぶ。全部に対して離れた色が無ければ、一番離れた色
export function pickAccessoryColor(rng: Rng, against: Oklch[]): Oklch {
  const minGap = (c: Oklch) => Math.min(...against.map(a => gapL(a, c)));
  const good = ACCESSORY_COLORS.filter(a => minGap(a.color) >= 0.15);
  return good.length > 0 ? pick(rng, good).color : [...ACCESSORY_COLORS].sort((a, b) => minGap(b.color) - minGap(a.color))[0].color;
}

// 髪の色 (名前付き)。自然な色・ファンタジーな色・クールな色
export const HAIR_PALETTE: { name: string; color: Oklch }[] = [
  { name: 'ブラック', color: o(0.26, 0.02, 275) },
  { name: 'ダークブラウン', color: o(0.34, 0.05, 50) },
  { name: 'ブラウン', color: o(0.48, 0.08, 58) },
  { name: 'チェスナット', color: o(0.45, 0.1, 40) },
  { name: 'ブロンド', color: o(0.82, 0.1, 92) },
  { name: 'ジンジャー', color: o(0.58, 0.14, 45) },
  { name: 'シルバー', color: o(0.82, 0.01, 260) },
  { name: 'ピンク', color: o(0.78, 0.11, 350) },
  { name: 'ラベンダー', color: o(0.74, 0.1, 300) },
  { name: 'ミント', color: o(0.82, 0.09, 165) },
  { name: 'スカイ', color: o(0.78, 0.09, 235) },
  { name: 'ワインレッド', color: o(0.5, 0.17, 20) },
  { name: 'ホワイト', color: o(0.93, 0.01, 90) },
  { name: 'ティール', color: o(0.55, 0.1, 195) },
  { name: 'ネイビー', color: o(0.3, 0.07, 260) },
  { name: 'マゼンタ', color: o(0.5, 0.2, 350) },
];
const hairColors = (names: string[]) => names.map(n => HAIR_PALETTE.find(h => h.name === n)!.color);

// 雰囲気ごとに、選ばれやすい髪の色 (「おまかせ」のとき)
export const HAIR_COLORS: Record<Mood, Oklch[]> = {
  cute: hairColors(['ピンク', 'ラベンダー', 'ミント', 'スカイ', 'ワインレッド', 'ホワイト', 'ティール', 'ダークブラウン', 'ブラウン', 'チェスナット', 'ブロンド']),
  cool: hairColors(['ブラック', 'シルバー', 'ネイビー', 'ティール', 'マゼンタ']),
  simple: hairColors(['ブラック', 'ダークブラウン', 'ブラウン', 'チェスナット', 'ブロンド', 'ジンジャー', 'シルバー']),
};

export const EYE_COLORS: Record<Mood, Oklch[]> = {
  cute: [o(0.6, 0.13, 330), o(0.55, 0.12, 250), o(0.55, 0.11, 150), o(0.5, 0.13, 300), o(0.65, 0.12, 75)],
  cool: [o(0.62, 0.15, 195), o(0.6, 0.17, 25), o(0.62, 0.15, 300), o(0.7, 0.14, 145)],
  simple: [o(0.4, 0.07, 50), o(0.55, 0.11, 250), o(0.5, 0.1, 150), o(0.65, 0.12, 75)],
};

// 色を少しだけゆらす (同じ配色でも、seed ごとに少し違う色にする)
export function jitter(rng: Rng, color: Oklch, lightness = 0.015, hue = 5): Oklch {
  return { l: color.l + between(rng, -lightness, lightness), c: color.c, h: (color.h + between(rng, -hue, hue) + 360) % 360 };
}

// 髪は、肌と明るさが離れた色から選ぶ (輪郭が読めるように)。当てはまる色が無ければ、一番暗い色
export function pickHair(rng: Rng, mood: Mood, skin: Oklch): Oklch {
  const candidates = HAIR_COLORS[mood].filter(c => Math.abs(c.l - skin.l) >= 0.1);
  return candidates.length > 0 ? pick(rng, candidates) : [...HAIR_COLORS[mood]].sort((a, b) => a.l - b.l)[0];
}
