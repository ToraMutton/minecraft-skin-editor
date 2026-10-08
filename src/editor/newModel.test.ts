import { describe, it, expect } from 'vitest';
import { readNewModel, saveNewModel } from './newModel';
import { NEW_MODEL_KEY } from './canvas/constants';

// localStorage の代わりになる、メモリ上の入れ物
const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};

describe('「新規」で作るモデルの記憶', () => {
  it('何も覚えていなければ Classic', () => {
    expect(readNewModel(memoryStorage())).toBe('classic');
  });

  it('保存したモデルを、読み出せる', () => {
    const storage = memoryStorage();
    saveNewModel('slim', storage);
    expect(storage.data[NEW_MODEL_KEY]).toBe('slim');
    expect(readNewModel(storage)).toBe('slim');
    saveNewModel('classic', storage);
    expect(readNewModel(storage)).toBe('classic');
  });

  it('知らない値・壊れた値は Classic として扱う', () => {
    for (const value of ['', 'SLIM', 'alex', '{"model":"slim"}']) {
      expect(readNewModel(memoryStorage({ [NEW_MODEL_KEY]: value })), value).toBe('classic');
    }
  });

  it('保存先が使えなくても (null・読み書きで例外)、エラーにならず Classic', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readNewModel(null)).toBe('classic');
    expect(readNewModel(broken)).toBe('classic');
    expect(() => saveNewModel('slim', null)).not.toThrow();
    expect(() => saveNewModel('slim', broken)).not.toThrow();
  });
});
