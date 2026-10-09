import { describe, it, expect } from 'vitest';
import { specFromAnswers, randomSpec, parseAnswers, countAnswered, ANSWER_COUNT, MOODS, HAIR_STYLES, EYE_STYLES, BOTTOMS } from './spec';
import type { SkinSpec, SpecAnswers } from './spec';
import { ALL_OUTFITS, HAIR_PALETTE, SKIN_TONES, SKIN_NAMES, OUTFITS } from './palettes';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);

describe('specFromAnswers', () => {
  it('答えが無ければ、randomSpec と同じ (全問おまかせ)', () => {
    for (const seed of SEEDS.slice(0, 20)) expect(specFromAnswers({}, seed)).toEqual(randomSpec(seed));
  });

  it('答えた項目は、その通りになる (どの seed でも)', () => {
    const answers: SpecAnswers = { mood: 'cool', hair: 'long', eyes: 'lashes', top: 'hoodie', bottom: 'shorts', skin: 3, hairColor: 9, outfit: 7 };
    for (const seed of SEEDS) {
      const spec = specFromAnswers(answers, seed);
      expect(spec).toMatchObject({ mood: 'cool', hair: 'long', eyes: 'lashes', top: 'hoodie', bottom: 'shorts' });
      expect(spec.palette.skin).toEqual(SKIN_TONES[3]);
      expect(spec.palette.hair).toEqual(HAIR_PALETTE[9].color);
      const outfit = ALL_OUTFITS[7].outfit;
      expect(spec.palette).toMatchObject({ primary: outfit.primary, inner: outfit.inner, accent: outfit.accent, secondary: outfit.secondary, shoes: outfit.shoes }); // 指定した配色は、ゆらさない
    }
  });

  it('同じ答えと seed なら、必ず同じ設定。seed が違えば、おまかせの項目は変わる', () => {
    const a: SpecAnswers = { hair: 'short' };
    expect(specFromAnswers(a, 42)).toEqual(specFromAnswers(a, 42));
    const specs = SEEDS.map(s => JSON.stringify(specFromAnswers(a, s)));
    expect(new Set(specs).size).toBe(SEEDS.length);
  });

  it('1つの答えを変えても、他のおまかせの項目は変わらない (髪型を変えたら服まで変わる、ということが起きない)', () => {
    const rest = (spec: SkinSpec, ...omit: (keyof SkinSpec)[]) => Object.fromEntries(Object.entries(spec).filter(([k]) => !omit.includes(k as keyof SkinSpec)));
    for (const seed of SEEDS.slice(0, 60)) {
      const base = specFromAnswers({ mood: 'simple' }, seed); // 雰囲気を固定してから、他の1項目を変える
      for (const hair of HAIR_STYLES) expect(rest(specFromAnswers({ mood: 'simple', hair }, seed), 'hair'), `髪型 ${seed}`).toEqual(rest(base, 'hair'));
      for (const eyes of EYE_STYLES) expect(rest(specFromAnswers({ mood: 'simple', eyes }, seed), 'eyes'), `目 ${seed}`).toEqual(rest(base, 'eyes'));
      for (const bottom of BOTTOMS) expect(rest(specFromAnswers({ mood: 'simple', bottom }, seed), 'bottom'), `下 ${seed}`).toEqual(rest(base, 'bottom'));
    }
  });

  it('色の答えも、他の項目に影響しない。髪の色を変えても、肌・服・髪型は同じ', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const a = specFromAnswers({ mood: 'cute' }, seed), b = specFromAnswers({ mood: 'cute', hairColor: 4 }, seed);
      expect(b.palette.hair).toEqual(HAIR_PALETTE[4].color);
      expect({ ...b.palette, hair: 0 }).toEqual({ ...a.palette, hair: 0 });
      expect({ ...b, palette: 0 }).toEqual({ ...a, palette: 0 });
      const c = specFromAnswers({ mood: 'cute', skin: 4 }, seed);
      expect(c.palette.skin).toEqual(SKIN_TONES[4]);
      expect({ ...c.palette, skin: 0, hair: 0 }).toEqual({ ...a.palette, skin: 0, hair: 0 }); // 髪の色は、肌との明るさの差で選ぶので、肌を変えると変わりうる
    }
  });

  it('雰囲気を答えると、その雰囲気らしい服の配色・選ばれやすさになる。雰囲気を変えると他にも影響する', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const mood of MOODS) {
        const spec = specFromAnswers({ mood }, seed);
        expect(spec.mood).toBe(mood);
        // おまかせの服の配色は、その雰囲気の配色から選ばれる (ゆらぎの範囲で近い)
        const near = OUTFITS[mood].some(o => Math.abs(o.primary.l - spec.palette.primary.l) < 0.03 && Math.abs(o.secondary.l - spec.palette.secondary.l) < 0.03);
        expect(near, `${mood} ${seed}`).toBe(true);
      }
    }
  });

  it('縞はTシャツのときだけ。縞を答えても、Tシャツでなければ入らない。Tシャツで縞を「なし」と答えれば入らない', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      expect(specFromAnswers({ top: 'hoodie', stripes: true }, seed).stripes).toBe(false);
      expect(specFromAnswers({ top: 'tshirt', stripes: true }, seed).stripes).toBe(true);
      expect(specFromAnswers({ top: 'tshirt', stripes: false }, seed).stripes).toBe(false);
    }
  });

  it('範囲外の番号の答えは、おまかせとして扱う (例外にならない)', () => {
    for (const bad of [-1, 99, 1.5, NaN]) {
      const spec = specFromAnswers({ skin: bad, hairColor: bad, outfit: bad }, 7);
      expect(SKIN_TONES).toContainEqual(spec.palette.skin);
      expect(spec.palette.hair.l).toBeGreaterThan(0);
    }
  });
});

describe('parseAnswers / countAnswered', () => {
  it('作った答えは、JSONにして戻しても同じ', () => {
    const answers: SpecAnswers = { mood: 'cute', hair: 'medium', hairColor: 3, skin: 1, eyes: 'sharp', top: 'tshirt', stripes: false, bottom: 'pants', outfit: 5 };
    expect(parseAnswers(JSON.parse(JSON.stringify(answers)))).toEqual(answers);
  });

  it('壊れた項目だけを捨てて、使える項目は残す。全部壊れていれば、全部おまかせ', () => {
    expect(parseAnswers({ mood: 'scary', hair: 'long', skin: 99, eyes: 5, stripes: 'yes', evil: 1 })).toEqual({ hair: 'long' });
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers('x')).toEqual({});
    expect(parseAnswers([1, 2])).toEqual({});
    expect(parseAnswers({ skin: -1, hairColor: 1.5, outfit: 'a' })).toEqual({});
  });

  it('色の番号 0 も、有効な答えとして残る', () => {
    expect(parseAnswers({ skin: 0, hairColor: 0, outfit: 0 })).toEqual({ skin: 0, hairColor: 0, outfit: 0 });
  });

  it('答えた数を数える。質問は10個 (アクセサリーを含む)', () => {
    expect(countAnswered({})).toBe(0);
    expect(countAnswered({ mood: 'cool', skin: 0, stripes: false })).toBe(3);
    expect(ANSWER_COUNT).toBe(10);
    expect(countAnswered({ mood: 'cute', hair: 'long', hairColor: 0, skin: 0, eyes: 'classic', top: 'tshirt', stripes: true, bottom: 'pants', outfit: 0, accessories: [] })).toBe(ANSWER_COUNT); // 空(付けない)も、答えの1つ
  });

  it('色の名前が付いている (画面で説明するため)', () => {
    expect(SKIN_NAMES).toHaveLength(SKIN_TONES.length);
    expect(HAIR_PALETTE.every(h => h.name.length > 0)).toBe(true);
    expect(ALL_OUTFITS.every(o => o.outfit.name.length > 0)).toBe(true);
    expect(new Set(ALL_OUTFITS.map(o => o.outfit.name)).size).toBe(ALL_OUTFITS.length);
    // 画面では、髪の色・肌の色・服の配色を名前で選ぶので、名前が重ならないようにする (読み上げ・テストで区別できるように)
    const all = [...SKIN_NAMES, ...HAIR_PALETTE.map(h => h.name), ...ALL_OUTFITS.map(o => o.outfit.name)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('アクセサリーの答え', () => {
  it('指定した組み合わせがそのまま付く (重複は除き、並びは整う)。空なら何も付けない', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      expect(specFromAnswers({ accessories: ['gloves', 'glasses'] }, seed).accessories).toEqual(['glasses', 'gloves']);
      expect(specFromAnswers({ accessories: [] }, seed).accessories).toEqual([]);
      expect(specFromAnswers({ accessories: ['hat', 'ribbon', 'headband'] }, seed).accessories).toEqual(['hat']);
    }
  });

  it('アクセサリーの答えを変えても、他の項目は変わらない。他の項目を変えても、おまかせのアクセサリーは (雰囲気が同じなら) 変わらない', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const a = specFromAnswers({ mood: 'cool' }, seed), b = specFromAnswers({ mood: 'cool', accessories: ['scarf'] }, seed);
      expect({ ...b, accessories: 0 }).toEqual({ ...a, accessories: 0 });
      const c = specFromAnswers({ mood: 'cool', hair: 'short', eyes: 'sharp', top: 'hoodie' }, seed);
      expect(c.accessories).toEqual(a.accessories);
    }
  });

  it('parseAnswers: アクセサリーは、全部使える名前のときだけ残る (空の配列も残る)。整った並びになる', () => {
    expect(parseAnswers({ accessories: ['gloves', 'hat'] })).toEqual({ accessories: ['hat', 'gloves'] });
    expect(parseAnswers({ accessories: [] })).toEqual({ accessories: [] });
    expect(parseAnswers({ accessories: ['hat', 'crown'] })).toEqual({});
    expect(parseAnswers({ accessories: 'hat' })).toEqual({});
    expect(parseAnswers({ accessories: ['hat', 5] })).toEqual({});
  });
});
