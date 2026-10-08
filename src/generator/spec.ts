// SkinSpec: スキンの「設計図」。これと seed から、決まった絵ができる
// 将来、Quick Design の質問 (雰囲気・髪型・服…) への答えが、この項目に入る
import type { Oklch } from './color';
import { createRng, pick, chance } from './prng';
import type { Rng } from './prng';
import { OUTFITS, SKIN_TONES, EYE_COLORS, pickHair, jitter } from './palettes';
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

// 「全問おまかせ」に相当: seed だけから設定を決める
// 雰囲気(mood)ごとに選ばれやすいものを変える = 簡単なルールエンジン
export function randomSpec(seed: number): SkinSpec {
  const s = seed >>> 0;
  const rng: Rng = createRng(s, 'spec'); // 描くときの乱数とは別の流れ
  const prefer = <T>(likely: readonly NoInfer<T>[], all: readonly T[]): T => (chance(rng, 0.75) ? pick(rng, likely) : pick(rng, all));

  const mood = pick(rng, MOODS);
  const skin = pick(rng, SKIN_TONES);
  const outfit = pick(rng, OUTFITS[mood]);

  const top: TopStyle =
    mood === 'cute' ? prefer(['hoodie', 'tshirt'], TOPS) :
    mood === 'cool' ? prefer(['jacket', 'hoodie'], TOPS) :
    prefer(['tshirt'], TOPS);

  return {
    rendererVersion: RENDERER_VERSION,
    seed: s,
    mood,
    hair:
      mood === 'cute' ? prefer(['medium', 'long'], HAIR_STYLES) :
      mood === 'cool' ? prefer(['short', 'medium'], HAIR_STYLES) :
      pick(rng, HAIR_STYLES),
    eyes:
      mood === 'cute' ? prefer(['lashes'], EYE_STYLES) :
      mood === 'cool' ? prefer(['sharp'], EYE_STYLES) :
      prefer(['classic'], EYE_STYLES),
    top,
    bottom: mood === 'cute' ? prefer(['shorts'], BOTTOMS) : prefer(['pants'], BOTTOMS),
    stripes: top === 'tshirt' && chance(rng, 0.5),
    palette: {
      skin,
      hair: jitter(rng, pickHair(rng, mood, skin)),
      eye: jitter(rng, pick(rng, EYE_COLORS[mood]), 0.02, 8),
      primary: jitter(rng, outfit.primary),
      inner: jitter(rng, outfit.inner, 0.01, 4),
      accent: jitter(rng, outfit.accent, 0.01, 4),
      secondary: jitter(rng, outfit.secondary),
      shoes: jitter(rng, outfit.shoes, 0.01, 4),
    },
  };
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
