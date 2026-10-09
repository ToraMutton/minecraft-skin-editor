import { describe, it, expect } from 'vitest';
import { randomSpec, specFromAnswers, parseSpec, normalizeAccessories, RENDERER_VERSION, MOODS, HAIR_STYLES, EYE_STYLES, TOPS, BOTTOMS, ACCESSORIES } from './spec';
import { OUTFITS, HAIR_COLORS, HAIR_PALETTE, EYE_COLORS, SKIN_TONES, TOP_COLORS, BOTTOM_COLORS, ACCESSORY_COLORS } from './palettes';

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
    expect(share('cute', s => ['kawaii', 'vertical', 'lashes'].includes(s.eyes))).toBeGreaterThan(0.6);
    expect(share('cute', s => s.eyes === 'kawaii')).toBeGreaterThan(0.3); // かわいい系は、四角い大きな目が一番多い
    expect(share('cute', s => ['twintails', 'bun', 'ponytail'].includes(s.hair))).toBeGreaterThan(0.3); // かわいい系は、結んだ髪型も多い
    expect(share('cool', s => s.top !== 'tshirt')).toBeGreaterThan(0.7);
    expect(share('cool', s => s.eyes === 'sharp')).toBeGreaterThan(0.45);
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
      // 小物の色は、肌・髪・上着のどれとも、はっきり離れている (リボンが髪に、手袋が肌に溶けない)
      for (const [name, c] of [['肌', p.skin], ['髪', p.hair], ['上着', p.primary]] as const) expect(dl(p.accessory, c), `小物と${name} ${seed}`).toBeGreaterThan(0.08);
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
      ...Object.values(OUTFITS).flat().flatMap(o => [o.primary, o.inner, o.accent, o.secondary, o.shoes]),
      ...TOP_COLORS.map(c => c.color), ...BOTTOM_COLORS.map(c => c.color), ...ACCESSORY_COLORS.map(c => c.color)];
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
      ['口が真偽値でない', s => ({ ...s, mouth: 'yes' })],
      ['小物の色が無い', s => ({ ...s, palette: { ...s.palette, accessory: undefined } })],
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
    expect(Object.keys(parsed).sort()).toEqual(['accessories', 'bottom', 'eyes', 'hair', 'mood', 'mouth', 'palette', 'rendererVersion', 'seed', 'stripes', 'top']);
    expect(Object.keys(parsed.palette).sort()).toEqual(['accent', 'accessory', 'eye', 'hair', 'inner', 'primary', 'secondary', 'shoes', 'skin']);
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

describe('口と目の組み合わせ・色', () => {
  const SEEDS3 = Array.from({ length: 800 }, (_, i) => i * 6007 + 11);
  it('目だけで表情を作る目 (大きな目・縦目・横目) は口なしが多く、他の目は口ありが多い', () => {
    const specs = SEEDS3.map(randomSpec);
    const low = specs.filter(s => ['kawaii', 'vertical', 'sideways'].includes(s.eyes)), other = specs.filter(s => !['kawaii', 'vertical', 'sideways'].includes(s.eyes));
    expect(low.filter(s => !s.mouth).length / low.length).toBeGreaterThan(0.55);
    expect(other.filter(s => s.mouth).length / other.length).toBeGreaterThan(0.75);
  });

  it('上着の色・ズボンの色を選ぶと、そのとおりになる。選ばなかった色 (中のシャツ・アクセント・靴) は、読める明るさの差が保たれる', () => {
    for (let i = 0; i < TOP_COLORS.length; i++) {
      for (const seed of SEEDS3.slice(0, 20)) {
        const spec = specFromAnswers({ topColor: i, bottomColor: i % BOTTOM_COLORS.length }, seed);
        expect(spec.palette.primary).toEqual(TOP_COLORS[i].color);
        expect(spec.palette.secondary).toEqual(BOTTOM_COLORS[i % BOTTOM_COLORS.length].color);
        expect(Math.abs(spec.palette.inner.l - spec.palette.primary.l), `シャツ ${TOP_COLORS[i].name} ${seed}`).toBeGreaterThanOrEqual(0.09);
        expect(Math.abs(spec.palette.accent.l - spec.palette.primary.l), `アクセント ${TOP_COLORS[i].name} ${seed}`).toBeGreaterThanOrEqual(0.09);
        expect(Math.abs(spec.palette.shoes.l - spec.palette.secondary.l), `靴 ${seed}`).toBeGreaterThanOrEqual(0.09);
      }
    }
  });

  it('小物の色を選ぶと、そのとおりになる (どの seed でも)', () => {
    for (let i = 0; i < ACCESSORY_COLORS.length; i++) expect(specFromAnswers({ accessoryColor: i }, 5).palette.accessory).toEqual(ACCESSORY_COLORS[i].color);
  });

  it('色の名前は、それぞれの選択肢の中で重ならない', () => {
    for (const list of [TOP_COLORS, BOTTOM_COLORS, ACCESSORY_COLORS, HAIR_PALETTE]) expect(new Set(list.map(c => c.name)).size).toBe(list.length);
  });
});
