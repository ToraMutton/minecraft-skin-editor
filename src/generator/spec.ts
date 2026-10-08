// SkinSpec: スキンの「設計図」。これと seed から、決まった絵ができる
// 将来、Quick Design の質問 (雰囲気・髪型・服…) への答えが、この項目に入る
import type { Oklch } from './color';
import { createRng, pick, chance, int } from './prng';
import type { Rng } from './prng';
import { OUTFITS, ALL_OUTFITS, HAIR_PALETTE, SKIN_TONES, EYE_COLORS, pickHair, jitter } from './palettes';
import type { Mood } from './palettes';

// 描き方のバージョン。絵の描き方を変えたら増やす (同じ設定でも、バージョンが違えば違う絵になるため、設定に記録しておく)
export const RENDERER_VERSION = 1;

export const MOODS = ['cute', 'cool', 'simple'] as const;
export const HAIR_STYLES = ['short', 'medium', 'long'] as const;
export const EYE_STYLES = ['classic', 'lashes', 'sharp'] as const;
export const TOPS = ['tshirt', 'hoodie', 'jacket'] as const;
export const BOTTOMS = ['pants', 'shorts'] as const;

export type { Mood };
export type HairStyle = (typeof HAIR_STYLES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type TopStyle = (typeof TOPS)[number];
export type BottomStyle = (typeof BOTTOMS)[number];

export interface SkinPalette {
  skin: Oklch; hair: Oklch; eye: Oklch;
  primary: Oklch; inner: Oklch; accent: Oklch; secondary: Oklch; shoes: Oklch;
}

export interface SkinSpec {
  rendererVersion: number;
  seed: number; // 形のゆらぎ(髪束の長さ・シワの位置など)を決める。同じ設定でも、seed が違えば少し違う絵になる
  mood: Mood;
  hair: HairStyle;
  eyes: EyeStyle;
  top: TopStyle;
  bottom: BottomStyle;
  stripes: boolean; // Tシャツの縞
  palette: SkinPalette;
}

const PALETTE_KEYS = ['skin', 'hair', 'eye', 'primary', 'inner', 'accent', 'secondary', 'shoes'] as const;

// --- 質問への答え ---
// どの項目も省略できる (省略 = おまかせ)。色は、palettes の並びの番号で答える
export interface SpecAnswers {
  mood?: Mood;
  hair?: HairStyle;
  hairColor?: number; // HAIR_PALETTE の番号
  skin?: number; // SKIN_TONES の番号
  eyes?: EyeStyle;
  top?: TopStyle;
  stripes?: boolean; // Tシャツのときだけ効く
  bottom?: BottomStyle;
  outfit?: number; // ALL_OUTFITS の番号
}

export const ANSWER_COUNT = 9; // 質問の数

export function countAnswered(answers: SpecAnswers): number {
  return Object.values(answers).filter(v => v !== undefined).length;
}

// 答えを、設定にする。答えのない項目は、seed から決める
//   ・項目ごとに乱数の流れを分けているので、1つの答えを変えても、他のおまかせの項目は変わらない
//     (髪型を変えたら服まで変わった、ということが起きない)。ただし「雰囲気」だけは、他の項目の選ばれやすさを決めるので、変えると影響する
//   ・雰囲気ごとに選ばれやすいものを変える = 簡単なルールエンジン
//   ・答えで指定した色はそのまま使い、おまかせで選んだ色だけ少しゆらす
export function specFromAnswers(answers: SpecAnswers, seed: number): SkinSpec {
  const s = seed >>> 0;
  const stream = (name: string): Rng => createRng(s, `spec:${name}`);
  const prefer = <T>(rng: Rng, likely: readonly NoInfer<T>[], all: readonly T[]): T => (chance(rng, 0.75) ? pick(rng, likely) : pick(rng, all));

  const mood: Mood = answers.mood ?? pick(stream('mood'), MOODS);
  const skin = SKIN_TONES[answers.skin ?? int(stream('skin'), 0, SKIN_TONES.length - 1)] ?? SKIN_TONES[0];

  const top: TopStyle = answers.top ?? (() => {
    const rng = stream('top');
    return mood === 'cute' ? prefer(rng, ['hoodie', 'tshirt'], TOPS) : mood === 'cool' ? prefer(rng, ['jacket', 'hoodie'], TOPS) : prefer(rng, ['tshirt'], TOPS);
  })();
  const hair: HairStyle = answers.hair ?? (() => {
    const rng = stream('hair');
    return mood === 'cute' ? prefer(rng, ['medium', 'long'], HAIR_STYLES) : mood === 'cool' ? prefer(rng, ['short', 'medium'], HAIR_STYLES) : pick(rng, HAIR_STYLES);
  })();
  const eyes: EyeStyle = answers.eyes ?? (() => {
    const rng = stream('eyes');
    return mood === 'cute' ? prefer(rng, ['lashes'], EYE_STYLES) : mood === 'cool' ? prefer(rng, ['sharp'], EYE_STYLES) : prefer(rng, ['classic'], EYE_STYLES);
  })();
  const bottom: BottomStyle = answers.bottom ?? (mood === 'cute' ? prefer(stream('bottom'), ['shorts'], BOTTOMS) : prefer(stream('bottom'), ['pants'], BOTTOMS));
  const stripes = top === 'tshirt' && (answers.stripes ?? chance(stream('stripes'), 0.5));

  // 服の配色: 指定があればそれ、無ければ雰囲気の配色から選んでゆらす
  const chosenOutfit = answers.outfit === undefined ? undefined : ALL_OUTFITS[answers.outfit]?.outfit;
  const outfit = chosenOutfit ?? pick(stream('outfit'), OUTFITS[mood]);
  const j = (name: string, color: Oklch, lightness?: number, hue?: number) => (chosenOutfit ? color : jitter(stream(`jitter:${name}`), color, lightness, hue));

  const chosenHair = answers.hairColor === undefined ? undefined : HAIR_PALETTE[answers.hairColor]?.color;

  return {
    rendererVersion: RENDERER_VERSION,
    seed: s,
    mood, hair, eyes, top, bottom, stripes,
    palette: {
      skin,
      hair: chosenHair ?? jitter(stream('jitter:hair'), pickHair(stream('hairColor'), mood, skin)),
      eye: jitter(stream('jitter:eye'), pick(stream('eyeColor'), EYE_COLORS[mood]), 0.02, 8),
      primary: j('primary', outfit.primary),
      inner: j('inner', outfit.inner, 0.01, 4),
      accent: j('accent', outfit.accent, 0.01, 4),
      secondary: j('secondary', outfit.secondary),
      shoes: j('shoes', outfit.shoes, 0.01, 4),
    },
  };
}

// 「全問おまかせ」: seed だけから設定を決める
export function randomSpec(seed: number): SkinSpec {
  return specFromAnswers({}, seed);
}

// 保存してあった答えを、使える形にする。壊れた項目は捨てる (全部壊れていれば、全部おまかせ)
export function parseAnswers(value: unknown): SpecAnswers {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const out: SpecAnswers = {};
  if (isOneOf(MOODS, v.mood)) out.mood = v.mood;
  if (isOneOf(HAIR_STYLES, v.hair)) out.hair = v.hair;
  if (isOneOf(EYE_STYLES, v.eyes)) out.eyes = v.eyes;
  if (isOneOf(TOPS, v.top)) out.top = v.top;
  if (isOneOf(BOTTOMS, v.bottom)) out.bottom = v.bottom;
  if (typeof v.stripes === 'boolean') out.stripes = v.stripes;
  const index = (x: unknown, length: number) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < length ? x : undefined);
  const [hairColor, skin, outfit] = [index(v.hairColor, HAIR_PALETTE.length), index(v.skin, SKIN_TONES.length), index(v.outfit, ALL_OUTFITS.length)];
  if (hairColor !== undefined) out.hairColor = hairColor;
  if (skin !== undefined) out.skin = skin;
  if (outfit !== undefined) out.outfit = outfit;
  return out;
}

// --- 読み込んだ設定の検証 (保存したデータや、将来の入力が壊れていても、画面が止まらないように) ---

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseColor(value: unknown): Oklch | null {
  if (typeof value !== 'object' || value === null) return null;
  const { l, c, h } = value as Record<string, unknown>;
  if (!isNumber(l) || !isNumber(c) || !isNumber(h)) return null;
  if (l < 0 || l > 1 || c < 0 || c > 0.4) return null;
  return { l, c, h: ((h % 360) + 360) % 360 };
}

// 設定として使えるか確かめて、使える形で返す。使えなければ null (描き方のバージョンが違うものも null)
export function parseSpec(value: unknown): SkinSpec | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.rendererVersion !== RENDERER_VERSION) return null;
  if (!isNumber(v.seed) || !Number.isInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff) return null;
  if (!isOneOf(MOODS, v.mood) || !isOneOf(HAIR_STYLES, v.hair) || !isOneOf(EYE_STYLES, v.eyes) || !isOneOf(TOPS, v.top) || !isOneOf(BOTTOMS, v.bottom)) return null;
  if (typeof v.stripes !== 'boolean') return null;
  if (typeof v.palette !== 'object' || v.palette === null) return null;
  const raw = v.palette as Record<string, unknown>;
  const palette: Partial<SkinPalette> = {};
  for (const key of PALETTE_KEYS) {
    const color = parseColor(raw[key]);
    if (!color) return null;
    palette[key] = color;
  }
  return {
    rendererVersion: RENDERER_VERSION, seed: v.seed, mood: v.mood, hair: v.hair, eyes: v.eyes, top: v.top, bottom: v.bottom,
    stripes: v.stripes, palette: palette as SkinPalette,
  };
}
