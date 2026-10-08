import { describe, it, expect } from 'vitest';
import { designSkin, randomSeed, parseGeneration } from './generation';
import { renderSkin } from './render';
import { specFromAnswers, RENDERER_VERSION } from './spec';
import { getLayout } from '../editor/skin/layout';

describe('designSkin', () => {
  it('答えと seed から、画素と生成の記録を作る。画素は renderSkin(specFromAnswers(...)) と同じ', () => {
    const layout = getLayout('classic');
    const answers = { mood: 'cute' as const, hair: 'long' as const, skin: 2 };
    const { pixels, generation } = designSkin(answers, 4242, layout);
    expect(pixels).toEqual(renderSkin(specFromAnswers(answers, 4242), layout));
    expect(generation).toEqual({ answers, seed: 4242, rendererVersion: RENDERER_VERSION });
  });

  it('同じ答えと seed なら、同じ絵と記録 (何度作っても)。seed が違えば違う絵', () => {
    const layout = getLayout('slim');
    expect(designSkin({}, 99, layout)).toEqual(designSkin({}, 99, layout));
    expect(designSkin({}, 99, layout).pixels).not.toEqual(designSkin({}, 100, layout).pixels);
  });

  it('記録に残る答えは、使える項目だけ (壊れた答えは捨てる)。記録は、そのまま parseGeneration で読み戻せる', () => {
    const { generation } = designSkin({ hair: 'short', mood: 'scary', skin: 99 } as never, 5, getLayout('classic'));
    expect(generation.answers).toEqual({ hair: 'short' });
    expect(parseGeneration(JSON.parse(JSON.stringify(generation)))).toEqual(generation);
  });

  it('モデルが違っても、同じ記録で作り直せる (記録にモデルは入れない)', () => {
    const a = designSkin({ top: 'jacket' }, 7, getLayout('classic')), b = designSkin({ top: 'jacket' }, 7, getLayout('slim'));
    expect(a.generation).toEqual(b.generation);
    expect(a.pixels).not.toEqual(b.pixels); // 腕の幅が違う
  });
});

describe('randomSeed', () => {
  it('32ビットの整数で、呼ぶたびに(ほぼ必ず)違う', () => {
    const seeds = Array.from({ length: 200 }, randomSeed);
    for (const s of seeds) { expect(Number.isInteger(s)).toBe(true); expect(s >= 0 && s <= 0xffffffff).toBe(true); }
    expect(new Set(seeds).size).toBeGreaterThan(195);
  });
});
