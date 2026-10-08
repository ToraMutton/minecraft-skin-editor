import { describe, it, expect } from 'vitest';
import { createProject, summarize, uniqueName, SCHEMA_VERSION } from './project';
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
    expect(Object.keys(summary).sort()).toEqual(['createdAt', 'id', 'model', 'name', 'updatedAt']);
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
