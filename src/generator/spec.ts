// SkinSpec: スキンの「設計図」。これと seed から、決まった絵ができる
// 将来、Quick Design の質問 (雰囲気・髪型・服…) への答えが、この項目に入る
import type { Oklch } from './color';
import { createRng, pick, chance, int, shuffle } from './prng';
import type { Rng } from './prng';
import { OUTFITS, HAIR_PALETTE, SKIN_TONES, TOP_COLORS, BOTTOM_COLORS, ACCESSORY_COLORS, EYE_COLORS, pickHair, jitter, gapL, innerFor, accentFor, shoesFor, pickAccessoryColor } from './palettes';
import type { Mood } from './palettes';

// 描き方のバージョン。絵の描き方を変えたら増やす (同じ設定でも、バージョンが違えば違う絵になるため、設定に記録しておく)
export const RENDERER_VERSION = 3;

export const MOODS = ['cute', 'cool', 'simple'] as const;
export const HAIR_STYLES = ['short', 'medium', 'long', 'ponytail', 'twintails', 'bun'] as const; // ponytail: ポニーテール / twintails: ツインテール / bun: お団子
export const EYE_STYLES = ['classic', 'lashes', 'sharp', 'kawaii', 'vertical', 'sideways'] as const;
// kawaii: 四角い大きな目 (2×2を顔の下寄りに。口なしが似合う) / vertical: 縦目 (1×3で、下ほど濃い) / sideways: 横目 (白と黒の2ピクセル)
// アクセサリー。頭の上のもの(帽子・カチューシャ・リボン)から、顔・首・手の順に並べる (描く順番もこの順)
export const ACCESSORIES = ['hat', 'headband', 'ribbon', 'glasses', 'earrings', 'scarf', 'gloves'] as const;
export const TOPS = ['tshirt', 'hoodie', 'jacket'] as const;
export const BOTTOMS = ['pants', 'shorts'] as const;

export type { Mood };
export type HairStyle = (typeof HAIR_STYLES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type TopStyle = (typeof TOPS)[number];
export type BottomStyle = (typeof BOTTOMS)[number];
export type Accessory = (typeof ACCESSORIES)[number];

// 帽子をかぶっているときは、カチューシャとリボンは付けられない (頭の上で重なるため)。並び順も整える
export function normalizeAccessories(list: readonly Accessory[]): Accessory[] {
  const set = new Set(list);
  if (set.has('hat')) { set.delete('headband'); set.delete('ribbon'); }
  return ACCESSORIES.filter(a => set.has(a));
}

export interface SkinPalette {
  skin: Oklch; hair: Oklch; eye: Oklch;
  primary: Oklch; inner: Oklch; accent: Oklch; secondary: Oklch; shoes: Oklch;
  accessory: Oklch; // アクセサリーの色
}

export interface SkinSpec {
  rendererVersion: number;
  seed: number; // 形のゆらぎ(髪束の長さ・シワの位置など)を決める。同じ設定でも、seed が違えば少し違う絵になる
  mood: Mood;
  hair: HairStyle;
  eyes: EyeStyle;
  mouth: boolean; // 口を描くか (大きな目だけの顔は、口なしが多い)
  top: TopStyle;
  bottom: BottomStyle;
  stripes: boolean; // Tシャツの縞
  accessories: Accessory[]; // 付けるアクセサリー (無ければ空)
  palette: SkinPalette;
}

const PALETTE_KEYS = ['skin', 'hair', 'eye', 'primary', 'inner', 'accent', 'secondary', 'shoes', 'accessory'] as const;

// --- 質問への答え ---
// どの項目も省略できる (省略 = おまかせ)。色は、palettes の並びの番号で答える
export interface SpecAnswers {
  mood?: Mood;
  hair?: HairStyle;
  hairColor?: number; // HAIR_PALETTE の番号
  skin?: number; // SKIN_TONES の番号
  eyes?: EyeStyle;
  mouth?: boolean; // 省略 = おまかせ / true = 口あり / false = 口なし
  top?: TopStyle;
  topColor?: number; // TOP_COLORS の番号
  stripes?: boolean; // Tシャツのときだけ効く
  bottom?: BottomStyle;
  bottomColor?: number; // BOTTOM_COLORS の番号
  accessories?: Accessory[]; // 省略 = おまかせ / 空 = 付けない / 並び = その組み合わせ
  accessoryColor?: number; // ACCESSORY_COLORS の番号
}

export const ANSWER_COUNT = 13; // 質問の数

export function countAnswered(answers: SpecAnswers): number {
  return Object.values(answers).filter(v => v !== undefined).length;
}

// 答えを、設定にする。答えのない項目は、seed から決める
//   ・項目ごとに乱数の流れを分けているので、1つの答えを変えても、他のおまかせの項目は変わらない
//     (髪型を変えたら服まで変わった、ということが起きない)。ただし「雰囲気」だけは、他の項目の選ばれやすさを決めるので、変えると影響する
//   ・雰囲気ごとに選ばれやすいものを変える = 簡単なルールエンジン
//   ・答えで指定した色はそのまま使い、おまかせで選んだ色だけ少しゆらす
//   ・上着の色・ズボンの色・小物の色は、別々に選べる。選んだ色と、組み合わせる色 (中のシャツ・アクセント・靴) が近くなりすぎたら、読める色に直す
const LOW_EYES: readonly EyeStyle[] = ['kawaii', 'vertical', 'sideways']; // 目だけで表情を作る(下寄りの)目は、口なしが似合う

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
    return mood === 'cute' ? prefer(rng, ['twintails', 'bun', 'medium', 'long', 'ponytail'], HAIR_STYLES)
      : mood === 'cool' ? prefer(rng, ['short', 'medium', 'ponytail'], HAIR_STYLES) : pick(rng, HAIR_STYLES);
  })();
  const eyes: EyeStyle = answers.eyes ?? (() => {
    const rng = stream('eyes');
    return mood === 'cute' ? prefer(rng, ['kawaii', 'kawaii', 'vertical', 'lashes'], EYE_STYLES)
      : mood === 'cool' ? prefer(rng, ['sharp', 'sharp', 'classic'], EYE_STYLES) : prefer(rng, ['classic', 'classic', 'sideways'], EYE_STYLES);
  })();
  const mouth = answers.mouth ?? chance(stream('mouth'), LOW_EYES.includes(eyes) ? 0.3 : 0.9);
  const bottom: BottomStyle = answers.bottom ?? (mood === 'cute' ? prefer(stream('bottom'), ['shorts'], BOTTOMS) : prefer(stream('bottom'), ['pants'], BOTTOMS));
  const stripes = top === 'tshirt' && (answers.stripes ?? chance(stream('stripes'), 0.5));
  const accessories = normalizeAccessories(answers.accessories ?? randomAccessories(mood, stream('accessories')));

  // 服の色: おまかせなら、雰囲気の配色から選んでゆらす。上着・ズボンの色を選んだら、それに差し替える
  const curated = pick(stream('outfit'), OUTFITS[mood]);
  const chosenTop = answers.topColor === undefined ? undefined : TOP_COLORS[answers.topColor]?.color;
  const chosenBottom = answers.bottomColor === undefined ? undefined : BOTTOM_COLORS[answers.bottomColor]?.color;
  const primary = chosenTop ?? jitter(stream('jitter:primary'), curated.primary);
  const secondary = chosenBottom ?? jitter(stream('jitter:secondary'), curated.secondary);
  const readable = (color: Oklch, against: Oklch, fix: (a: Oklch) => Oklch) => (gapL(color, against) >= 0.1 ? color : fix(against));
  const inner = readable(jitter(stream('jitter:inner'), curated.inner, 0.01, 4), primary, innerFor);
  const accent = readable(jitter(stream('jitter:accent'), curated.accent, 0.01, 4), primary, accentFor);
  const shoes = readable(jitter(stream('jitter:shoes'), curated.shoes, 0.01, 4), secondary, shoesFor);

  const chosenHair = answers.hairColor === undefined ? undefined : HAIR_PALETTE[answers.hairColor]?.color;
  const hairColor = chosenHair ?? jitter(stream('jitter:hair'), pickHair(stream('hairColor'), mood, skin));
  // 小物の色: 選べる。おまかせなら、肌・髪・上着のどれとも明るさが離れた色から選ぶ (リボンが髪に、手袋が肌に溶けない)
  const chosenAccessory = answers.accessoryColor === undefined ? undefined : ACCESSORY_COLORS[answers.accessoryColor]?.color;
  const accessory = chosenAccessory ?? pickAccessoryColor(stream('accessoryColor'), [skin, hairColor, primary]);

  return {
    rendererVersion: RENDERER_VERSION,
    seed: s,
    mood, hair, eyes, mouth, top, bottom, stripes, accessories,
    palette: {
      skin, hair: hairColor, eye: jitter(stream('jitter:eye'), pick(stream('eyeColor'), EYE_COLORS[mood]), 0.02, 8),
      primary, inner, accent, secondary, shoes, accessory,
    },
  };
}

// おまかせのアクセサリー: 雰囲気ごとに、似合うものから 0〜2個
const ACCESSORY_POOL: Record<Mood, { none: number; items: readonly Accessory[] }> = {
  cute: { none: 0.3, items: ['ribbon', 'headband', 'earrings', 'gloves', 'hat'] },
  cool: { none: 0.35, items: ['glasses', 'scarf', 'hat', 'earrings', 'gloves'] },
  simple: { none: 0.6, items: ['glasses', 'hat', 'scarf'] },
};
function randomAccessories(mood: Mood, rng: Rng): Accessory[] {
  const { none, items } = ACCESSORY_POOL[mood];
  if (chance(rng, none)) return [];
  return shuffle(rng, items).slice(0, chance(rng, 0.25) ? 2 : 1);
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
  if (Array.isArray(v.accessories) && v.accessories.every(a => isOneOf(ACCESSORIES, a))) out.accessories = normalizeAccessories(v.accessories as Accessory[]);
  if (isOneOf(BOTTOMS, v.bottom)) out.bottom = v.bottom;
  if (typeof v.stripes === 'boolean') out.stripes = v.stripes;
  if (typeof v.mouth === 'boolean') out.mouth = v.mouth;
  const index = (x: unknown, length: number) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < length ? x : undefined);
  const colors = { hairColor: index(v.hairColor, HAIR_PALETTE.length), skin: index(v.skin, SKIN_TONES.length), topColor: index(v.topColor, TOP_COLORS.length), bottomColor: index(v.bottomColor, BOTTOM_COLORS.length), accessoryColor: index(v.accessoryColor, ACCESSORY_COLORS.length) };
  for (const [key, value] of Object.entries(colors)) if (value !== undefined) out[key as keyof typeof colors] = value;
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
  if (typeof v.stripes !== 'boolean' || typeof v.mouth !== 'boolean') return null;
  if (!Array.isArray(v.accessories) || !v.accessories.every(a => isOneOf(ACCESSORIES, a))) return null;
  if (typeof v.palette !== 'object' || v.palette === null) return null;
  const raw = v.palette as Record<string, unknown>;
  const palette: Partial<SkinPalette> = {};
  for (const key of PALETTE_KEYS) {
    const color = parseColor(raw[key]);
    if (!color) return null;
    palette[key] = color;
  }
  return {
    rendererVersion: RENDERER_VERSION, seed: v.seed, mood: v.mood, hair: v.hair, eyes: v.eyes, mouth: v.mouth, top: v.top, bottom: v.bottom,
    stripes: v.stripes, accessories: normalizeAccessories(v.accessories as Accessory[]), palette: palette as SkinPalette,
  };
}
