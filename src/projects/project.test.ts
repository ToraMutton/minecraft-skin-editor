import { describe, it, expect } from 'vitest';
import { createProject, summarize, uniqueName, parseGeneration, SCHEMA_VERSION } from './project';
import { RENDERER_VERSION } from '../generator/spec';
import { PIXEL_COUNT } from '../editor/canvas/layers';

describe('createProject', () => {
  it('既定は、素体から始まる classic モデルの「無題のスキン」', () => {
    const p = createProject();
    expect(p.name).toBe('無題のスキン');
    expect(p.model).toBe('classic');
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    // 素体は下地に入り、手描きと消去マスクは空
    expect(p.layers.base.some(v => v > 0)).toBe(true);
    expect(p.layers.paint.every(v => v === 0)).toBe(true);
    expect(p.layers.erased.every(v => v === 0)).toBe(true);
  });

  it('model に slim を渡すと、Slim の作品になり、素体も腕が幅3で描かれる', () => {
    const p = createProject({ model: 'slim' });
    expect(p.model).toBe('slim');
    const alpha = (x: number, y: number) => p.layers.base[(y * 64 + x) * 4 + 3];
    expect(alpha(53, 25)).toBe(255); // 右腕の背面の右端 (Slim は x=51〜53)
    expect(alpha(55, 25)).toBe(0); // Classic の背面の右端 (Slim では使わない列)
    expect(createProject().layers.base[(25 * 64 + 55) * 4 + 3]).toBe(255); // Classic では塗られている
  });

  it('blank なら下地も完全に透明', () => {
    expect(createProject({ start: 'blank' }).layers.base.every(v => v === 0)).toBe(true);
  });

  it('配列を渡すと、それが下地になる (読み込んだPNGなど)', () => {
    const png = new Uint8ClampedArray(PIXEL_COUNT * 4).fill(9);
    expect(createProject({ start: png }).layers.base[0]).toBe(9);
  });

  it('作るたびに別の id になり、作成日時と更新日時は同じ', () => {
    const now = new Date('2026-10-07T12:00:00.000Z');
    const a = createProject({ now }), b = createProject({ now });
    expect(a.id).not.toBe(b.id);
    expect(a.createdAt).toBe('2026-10-07T12:00:00.000Z');
    expect(a.updatedAt).toBe(a.createdAt);
  });
});

describe('summarize', () => {
  it('3層を含まない、一覧用の情報だけを返す', () => {
    const summary = summarize(createProject({ name: 'テスト' }));
    expect(Object.keys(summary).sort()).toEqual(['createdAt', 'generated', 'id', 'model', 'name', 'updatedAt']);
  });
});

describe('uniqueName', () => {
  it('重ならなければそのまま', () => {
    expect(uniqueName('無題のスキン', ['別の名前'])).toBe('無題のスキン');
  });
  it('重なったら番号を付ける。使われている番号は飛ばす', () => {
    expect(uniqueName('無題のスキン', ['無題のスキン'])).toBe('無題のスキン 2');
    expect(uniqueName('無題のスキン', ['無題のスキン', '無題のスキン 2', '無題のスキン 4'])).toBe('無題のスキン 3');
  });
});

describe('generation (Quick Design の記録)', () => {
  const generation = { answers: { mood: 'cool' as const, skin: 2 }, seed: 12345, rendererVersion: RENDERER_VERSION };

  it('普通の作品には無い。渡せば作品に入り、一覧用の情報では generated になる', () => {
    expect('generation' in createProject()).toBe(false);
    expect(summarize(createProject()).generated).toBe(false);
    const p = createProject({ generation });
    expect(p.generation).toEqual(generation);
    expect(summarize(p).generated).toBe(true);
  });

  it('parseGeneration: 作った記録は、JSONにして戻しても同じ', () => {
    expect(parseGeneration(JSON.parse(JSON.stringify(generation)))).toEqual(generation);
  });

  it('壊れた記録は undefined (記録が無い作品として扱う)。答えの壊れた項目だけが捨てられる', () => {
    for (const bad of [null, 'x', 5, [], {}, { seed: 1 }, { seed: -1, rendererVersion: 1 }, { seed: 1.5, rendererVersion: 1 }, { seed: 2 ** 32, rendererVersion: 1 },
      { seed: 1, rendererVersion: 0 }, { seed: 1, rendererVersion: RENDERER_VERSION + 1 }, { seed: 'a', rendererVersion: 1 }]) {
      expect(parseGeneration(bad), JSON.stringify(bad)).toBeUndefined();
    }
    expect(parseGeneration({ seed: 7, rendererVersion: 1, answers: { mood: 'scary', hair: 'long', skin: 99 } })).toEqual({ answers: { hair: 'long' }, seed: 7, rendererVersion: 1 });
    expect(parseGeneration({ seed: 7, rendererVersion: 1 })).toEqual({ answers: {}, seed: 7, rendererVersion: 1 }); // 答えが無ければ全部おまかせ
  });
});
