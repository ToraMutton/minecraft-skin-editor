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
    { primary: o(0.8, 0.09, 5), inner: o(0.95, 0.015, 20), accent: o(0.96, 0.02, 70), secondary: o(0.52, 0.07, 255), shoes: o(0.93, 0.012, 60) },
    { primary: o(0.84, 0.08, 170), inner: o(0.95, 0.02, 95), accent: o(0.66, 0.12, 350), secondary: o(0.58, 0.06, 235), shoes: o(0.93, 0.012, 95) },
    { primary: o(0.78, 0.09, 300), inner: o(0.95, 0.02, 300), accent: o(0.93, 0.05, 90), secondary: o(0.48, 0.07, 270), shoes: o(0.92, 0.012, 300) },
    { primary: o(0.82, 0.07, 235), inner: o(0.95, 0.015, 85), accent: o(0.95, 0.03, 85), secondary: o(0.5, 0.06, 35), shoes: o(0.93, 0.01, 85) },
    { primary: o(0.84, 0.08, 45), inner: o(0.96, 0.015, 95), accent: o(0.68, 0.1, 350), secondary: o(0.5, 0.08, 340), shoes: o(0.93, 0.012, 50) },
  ],
  // クール: 暗い服 + ネオンのアクセント
  cool: [
    { primary: o(0.36, 0.035, 260), inner: o(0.72, 0.13, 195), accent: o(0.76, 0.13, 195), secondary: o(0.23, 0.02, 280), shoes: o(0.88, 0.012, 250) },
    { primary: o(0.38, 0.025, 300), inner: o(0.66, 0.2, 350), accent: o(0.68, 0.2, 350), secondary: o(0.25, 0.03, 280), shoes: o(0.88, 0.015, 300) },
    { primary: o(0.38, 0.07, 255), inner: o(0.9, 0.02, 90), accent: o(0.74, 0.14, 55), secondary: o(0.25, 0.04, 260), shoes: o(0.88, 0.02, 80) },
    { primary: o(0.38, 0.06, 160), inner: o(0.85, 0.15, 125), accent: o(0.84, 0.17, 125), secondary: o(0.25, 0.03, 220), shoes: o(0.9, 0.02, 160) },
    { primary: o(0.44, 0.012, 260), inner: o(0.6, 0.2, 25), accent: o(0.6, 0.2, 25), secondary: o(0.24, 0.015, 260), shoes: o(0.88, 0.01, 20) },
  ],
  // シンプル: 普段着らしい、はっきりした主役の色
  simple: [
    { primary: o(0.58, 0.15, 28), inner: o(0.96, 0.01, 90), accent: o(0.92, 0.03, 85), secondary: o(0.42, 0.09, 255), shoes: o(0.93, 0.01, 90) },
    { primary: o(0.55, 0.11, 150), inner: o(0.95, 0.02, 100), accent: o(0.9, 0.04, 100), secondary: o(0.7, 0.05, 85), shoes: o(0.33, 0.05, 55) },
    { primary: o(0.84, 0.14, 95), inner: o(0.97, 0.01, 90), accent: o(0.97, 0.01, 90), secondary: o(0.35, 0.07, 260), shoes: o(0.55, 0.06, 50) },
    { primary: o(0.55, 0.12, 250), inner: o(0.95, 0.01, 250), accent: o(0.95, 0.01, 250), secondary: o(0.4, 0.01, 260), shoes: o(0.95, 0.005, 90) },
    { primary: o(0.7, 0.15, 55), inner: o(0.95, 0.03, 90), accent: o(0.95, 0.03, 90), secondary: o(0.38, 0.06, 55), shoes: o(0.9, 0.02, 85) },
    { primary: o(0.55, 0.09, 200), inner: o(0.95, 0.02, 95), accent: o(0.95, 0.03, 95), secondary: o(0.8, 0.05, 85), shoes: o(0.4, 0.05, 55) },
  ],
};

export const SKIN_TONES: Oklch[] = [o(0.91, 0.045, 65), o(0.84, 0.06, 62), o(0.74, 0.08, 60), o(0.62, 0.09, 55), o(0.48, 0.07, 50)];

// 髪の色。自然な色と、ファンタジーな色
const NATURAL_HAIR: Oklch[] = [o(0.26, 0.02, 275), o(0.34, 0.05, 50), o(0.48, 0.08, 58), o(0.45, 0.1, 40), o(0.82, 0.1, 92), o(0.58, 0.14, 45), o(0.82, 0.01, 260)];
const FANTASY_HAIR: Oklch[] = [o(0.78, 0.11, 350), o(0.74, 0.1, 300), o(0.82, 0.09, 165), o(0.78, 0.09, 235), o(0.5, 0.17, 20), o(0.93, 0.01, 90), o(0.55, 0.1, 195)];
const COOL_HAIR: Oklch[] = [o(0.26, 0.02, 275), o(0.82, 0.01, 260), o(0.3, 0.07, 260), o(0.55, 0.1, 195), o(0.5, 0.2, 350)];

export const HAIR_COLORS: Record<Mood, Oklch[]> = {
  cute: [...FANTASY_HAIR, ...NATURAL_HAIR.slice(1, 5)],
  cool: COOL_HAIR,
  simple: NATURAL_HAIR,
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
