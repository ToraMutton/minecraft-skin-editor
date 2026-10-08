import { describe, it, expect } from 'vitest';
import { mulberry32, hashString, createRng, pick, between, int, chance } from './prng';

const take = (rng: () => number, n: number) => Array.from({ length: n }, rng);

describe('mulberry32', () => {
  it('同じ seed なら、必ず同じ数列', () => {
    expect(take(mulberry32(123), 20)).toEqual(take(mulberry32(123), 20));
  });
  it('seed が違えば、違う数列', () => {
    expect(take(mulberry32(1), 5)).not.toEqual(take(mulberry32(2), 5));
  });
  it('0以上1未満で、まんべんなく出る', () => {
    const values = take(mulberry32(7), 5000);
    expect(values.every(v => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    for (let bucket = 0; bucket < 10; bucket++) {
      const n = values.filter(v => Math.floor(v * 10) === bucket).length;
      expect(n, `区間${bucket}`).toBeGreaterThan(400);
    }
  });
  it('値そのものを固定しておく (アルゴリズムを変えると、過去のスキンが作り直せなくなるため)', () => {
    expect(take(mulberry32(1), 3).map(v => Math.round(v * 1e6))).toEqual([627074, 2736, 527447]);
  });
});

describe('createRng (流れの名前で、独立した乱数)', () => {
  it('同じ seed と名前なら同じ数列。名前が違えば別の数列', () => {
    expect(take(createRng(5, 'hair'), 8)).toEqual(take(createRng(5, 'hair'), 8));
    expect(take(createRng(5, 'hair'), 8)).not.toEqual(take(createRng(5, 'face'), 8));
    expect(take(createRng(5, 'hair'), 8)).not.toEqual(take(createRng(6, 'hair'), 8));
  });
  it('ある流れを何回使っても、別の流れには影響しない', () => {
    const face1 = take(createRng(5, 'face'), 5);
    const hair = createRng(5, 'hair');
    take(hair, 100);
    expect(take(createRng(5, 'face'), 5)).toEqual(face1);
  });
});

describe('hashString', () => {
  it('同じ文字列は同じ値、違えば(ほぼ必ず)違う値', () => {
    expect(hashString('hair')).toBe(hashString('hair'));
    expect(hashString('hair')).not.toBe(hashString('hairs'));
    expect(hashString('')).toBe(0x811c9dc5);
  });
});

describe('補助関数', () => {
  const rng = () => mulberry32(9);
  it('pick は配列の要素を返し、between / int は範囲に収まる', () => {
    const r = rng();
    for (let i = 0; i < 200; i++) {
      expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']));
      const b = between(r, 2, 3); expect(b >= 2 && b < 3).toBe(true);
      const n = int(r, 4, 6); expect([4, 5, 6]).toContain(n);
    }
  });
  it('int は両端を含む。chance(0) は決して起きず、chance(1) は必ず起きる', () => {
    const r = rng();
    const seen = new Set(Array.from({ length: 300 }, () => int(r, 0, 2)));
    expect(seen).toEqual(new Set([0, 1, 2]));
    expect(Array.from({ length: 100 }, () => chance(r, 0)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 100 }, () => chance(r, 1)).every(Boolean)).toBe(true);
  });
});
