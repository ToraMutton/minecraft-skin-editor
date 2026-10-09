import { describe, it, expect } from 'vitest';
import { randomSpec, parseSpec, normalizeAccessories, RENDERER_VERSION, MOODS, HAIR_STYLES, EYE_STYLES, TOPS, BOTTOMS, ACCESSORIES } from './spec';
import { OUTFITS, HAIR_COLORS, HAIR_PALETTE, EYE_COLORS, SKIN_TONES } from './palettes';

const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);

describe('randomSpec', () => {
  it('同じ seed なら、必ず同じ設定', () => {
    for (const seed of [0, 1, 12345, 0xffffffff]) expect(randomSpec(seed)).toEqual(randomSpec(seed));
  });

  it('seed が違えば、設定も(ほとんど)違う', () => {
    const json = new Set(SEEDS.map(s => JSON.stringify(randomSpec(s))));
    expect(json.size).toBe(SEEDS.length);
  });

  it('どの項目も、決まった選択肢の中にある。描き方のバージョンと seed が入っている', () => {
    for (const seed of SEEDS) {
      const spec = randomSpec(seed);
      expect(spec.rendererVersion).toBe(RENDERER_VERSION);
      expect(spec.seed).toBe(seed >>> 0);
      expect(MOODS).toContain(spec.mood); expect(HAIR_STYLES).toContain(spec.hair); expect(EYE_STYLES).toContain(spec.eyes);
      expect(TOPS).toContain(spec.top); expect(BOTTOMS).toContain(spec.bottom);
      for (const a of spec.accessories) expect(ACCESSORIES).toContain(a);
      expect(spec.accessories, `アクセサリーは重複せず、整った並び ${seed}`).toEqual(normalizeAccessories(spec.accessories));
    }
  });

  it('seed を小数・負の数にしても、決まった整数の seed になる', () => {
    expect(randomSpec(-1).seed).toBe(0xffffffff);
  });

  it('雰囲気ごとの選ばれやすさ: かわいい=ショートパンツ・長めの髪が多く、クール=ジャケット/パーカーが多い', () => {
    const specs = SEEDS.map(randomSpec);
    const share = (mood: string, f: (s: ReturnType<typeof randomSpec>) => boolean) => {
      const of = specs.filter(s => s.mood === mood);
      return of.filter(f).length / of.length;
    };
    expect(share('cute', s => s.bottom === 'shorts')).toBeGreaterThan(0.6);
    expect(share('cute', s => s.eyes === 'kawaii' || s.eyes === 'lashes')).toBeGreaterThan(0.6);
    expect(share('cute', s => s.eyes === 'kawaii')).toBeGreaterThan(0.4); // かわいい系は、ちびかわの目が一番多い
    expect(share('cool', s => s.top !== 'tshirt')).toBeGreaterThan(0.7);
    expect(share('cool', s => s.eyes === 'sharp')).toBeGreaterThan(0.6);
    expect(share('simple', s => s.top === 'tshirt')).toBeGreaterThan(0.6);
    // 3つの雰囲気が、どれもそれなりに出る
    for (const mood of MOODS) expect(specs.filter(s => s.mood === mood).length).toBeGreaterThan(80);
  });

  it('縞はTシャツだけ', () => {
    for (const seed of SEEDS) { const s = randomSpec(seed); if (s.stripes) expect(s.top).toBe('tshirt'); }
  });
});

describe('配色の読みやすさ (どの seed でも)', () => {
  const dl = (a: { l: number }, b: { l: number }) => Math.abs(a.l - b.l);

  it('髪は肌と、上着はズボンと、靴はズボンと、アクセントは上着と、明るさが離れている (輪郭・色の境目が読める)', () => {
    for (const seed of SEEDS) {
      const { palette: p } = randomSpec(seed);
      expect(dl(p.hair, p.skin), `髪と肌 ${seed}`).toBeGreaterThan(0.08);
      expect(dl(p.primary, p.secondary), `上着とズボン ${seed}`).toBeGreaterThan(0.08);
      expect(dl(p.shoes, p.secondary), `靴とズボン ${seed}`).toBeGreaterThan(0.08);
      expect(dl(p.accent, p.primary), `アクセントと上着 ${seed}`).toBeGreaterThan(0.08);
      expect(dl(p.inner, p.primary), `中のシャツと上着 ${seed}`).toBeGreaterThan(0.08);
    }
  });

  it('用意した配色のそれぞれも、同じ条件を (ゆらぎ前に) 満たしている', () => {
    for (const [mood, outfits] of Object.entries(OUTFITS)) {
      outfits.forEach((o, i) => {
        const name = `${mood}#${i}`;
        expect(dl(o.primary, o.secondary), `${name} 上着/ズボン`).toBeGreaterThanOrEqual(0.1);
        expect(dl(o.shoes, o.secondary), `${name} 靴/ズボン`).toBeGreaterThanOrEqual(0.1);
        expect(dl(o.accent, o.primary), `${name} アクセント/上着`).toBeGreaterThanOrEqual(0.1);
        expect(dl(o.inner, o.primary), `${name} シャツ/上着`).toBeGreaterThanOrEqual(0.1);
      });
    }
  });

  it('色は、真っ黒・真っ白に近づけない (明るさ 0.17〜0.97)', () => {
    const all = [...SKIN_TONES, ...Object.values(HAIR_COLORS).flat(), ...Object.values(EYE_COLORS).flat(), ...HAIR_PALETTE.map(h => h.color),
      ...Object.values(OUTFITS).flat().flatMap(o => [o.primary, o.inner, o.accent, o.secondary, o.shoes])];
    for (const c of all) { expect(c.l).toBeGreaterThanOrEqual(0.17); expect(c.l).toBeLessThanOrEqual(0.97); }
  });
});

describe('parseSpec', () => {
  const valid = () => JSON.parse(JSON.stringify(randomSpec(42)));

  it('作った設定は、JSONにして戻しても、そのまま使える', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const spec = randomSpec(seed);
      expect(parseSpec(JSON.parse(JSON.stringify(spec)))).toEqual(spec);
    }
  });

  it('壊れた設定は、null を返す (例外を投げない)', () => {
    const cases: [string, (s: ReturnType<typeof valid>) => unknown][] = [
      ['null', () => null],
      ['文字列', () => 'spec'],
      ['バージョン違い', s => ({ ...s, rendererVersion: RENDERER_VERSION + 1 })],
      ['seedが小数', s => ({ ...s, seed: 1.5 })],
      ['seedが負', s => ({ ...s, seed: -1 })],
      ['seedが大きすぎる', s => ({ ...s, seed: 2 ** 32 })],
      ['seedがNaN', s => ({ ...s, seed: NaN })],
      ['知らない雰囲気', s => ({ ...s, mood: 'scary' })],
      ['知らない髪型', s => ({ ...s, hair: 'afro' })],
      ['stripesが真偽値でない', s => ({ ...s, stripes: 'yes' })],
      ['アクセサリーが配列でない', s => ({ ...s, accessories: 'hat' })],
      ['知らないアクセサリー', s => ({ ...s, accessories: ['hat', 'crown'] })],
      ['アクセサリーが無い', s => ({ ...s, accessories: undefined })],
      ['paletteが無い', s => ({ ...s, palette: undefined })],
      ['色が足りない', s => ({ ...s, palette: { ...s.palette, shoes: undefined } })],
      ['明るさが範囲外', s => ({ ...s, palette: { ...s.palette, skin: { l: 1.5, c: 0.1, h: 0 } } })],
      ['鮮やかさが範囲外', s => ({ ...s, palette: { ...s.palette, skin: { l: 0.5, c: 0.9, h: 0 } } })],
      ['色が数でない', s => ({ ...s, palette: { ...s.palette, hair: { l: '0.5', c: 0.1, h: 0 } } })],
    ];
    for (const [name, make] of cases) expect(parseSpec(make(valid())), name).toBeNull();
  });

  it('色相が範囲外でも、0〜360に直して受け付ける', () => {
    const s = valid();
    s.palette.hair.h = -30;
    expect(parseSpec(s)!.palette.hair.h).toBe(330);
    s.palette.hair.h = 725;
    expect(parseSpec(s)!.palette.hair.h).toBe(5);
  });

  it('余計な項目は捨てる', () => {
    const parsed = parseSpec({ ...valid(), evil: 'x', palette: { ...valid().palette, extra: 1 } })!;
    expect(Object.keys(parsed).sort()).toEqual(['accessories', 'bottom', 'eyes', 'hair', 'mood', 'palette', 'rendererVersion', 'seed', 'stripes', 'top']);
    expect(Object.keys(parsed.palette).sort()).toEqual(['accent', 'eye', 'hair', 'inner', 'primary', 'secondary', 'shoes', 'skin']);
  });
});

describe('アクセサリー', () => {
  const SEEDS2 = Array.from({ length: 600 }, (_, i) => i * 104729 + 7);

  it('normalizeAccessories: 重複を除き、決まった並びにする。帽子があるとカチューシャとリボンは外れる', () => {
    expect(normalizeAccessories(['gloves', 'hat', 'hat', 'glasses'])).toEqual(['hat', 'glasses', 'gloves']);
    expect(normalizeAccessories(['ribbon', 'hat', 'headband', 'earrings'])).toEqual(['hat', 'earrings']);
    expect(normalizeAccessories(['ribbon', 'headband'])).toEqual(['headband', 'ribbon']);
    expect(normalizeAccessories([])).toEqual([]);
  });

  it('おまかせでは 0〜2個。雰囲気ごとに、似合うものから選ばれる', () => {
    const specs = SEEDS2.map(randomSpec);
    for (const s of specs) expect(s.accessories.length).toBeLessThanOrEqual(2);
    const count = (mood: string, f: (a: string[]) => boolean) => specs.filter(s => s.mood === mood && f(s.accessories)).length / specs.filter(s => s.mood === mood).length;
    expect(count('cute', a => a.length > 0)).toBeGreaterThan(0.55); // かわいい系は付けることが多い
    expect(count('simple', a => a.length === 0)).toBeGreaterThan(0.45); // シンプルは、付けないことが多い
    expect(count('cute', a => a.includes('scarf'))).toBe(0); // かわいい系のおまかせにマフラーは出ない
    expect(count('simple', a => a.includes('ribbon') || a.includes('headband') || a.includes('earrings') || a.includes('gloves'))).toBe(0);
    expect(count('cool', a => a.includes('glasses'))).toBeGreaterThan(0.1);
    for (const a of ACCESSORIES) expect(specs.some(s => s.accessories.includes(a)), a).toBe(true); // どの小物も出る
  });
});
