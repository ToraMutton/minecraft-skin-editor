import { describe, it, expect } from 'vitest';
import { normalizeName, renameProject, duplicateProject, MAX_NAME_LENGTH } from './actions';
import { createProject, summarize } from './project';
import type { SkinProject } from './project';
import type { ProjectRepository } from './repository';
import { RepositoryError } from './repository';

function memoryRepo(initial: SkinProject[] = []) {
  const store = new Map(initial.map(p => [p.id, p]));
  const repo: ProjectRepository = {
    async list() { return [...store.values()].map(summarize); },
    async get(id) { return store.get(id) ?? null; },
    async save(p) { store.set(p.id, p); },
    async delete(id) { store.delete(id); },
  };
  return { repo, store };
}

describe('normalizeName', () => {
  it('前後の空白を取り、途中の連続した空白は1つにする', () => {
    expect(normalizeName('  青い   服  ')).toBe('青い 服');
  });
  it('空や空白だけは null (名前なしの作品は作らない)', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('   \n ')).toBeNull();
  });
  it(`${MAX_NAME_LENGTH}文字までに切り詰める。絵文字も1文字として数える`, () => {
    expect([...normalizeName('あ'.repeat(100))!]).toHaveLength(MAX_NAME_LENGTH);
    const emoji = normalizeName('🙂'.repeat(100))!;
    expect([...emoji]).toHaveLength(MAX_NAME_LENGTH);
    expect(emoji).toBe('🙂'.repeat(MAX_NAME_LENGTH)); // 絵文字が途中で割れて、壊れた文字が残っていない
  });
});

describe('renameProject', () => {
  it('名前だけが変わり、更新日時と絵は変わらない', async () => {
    const p = createProject({ name: '前', now: new Date('2026-01-01T00:00:00Z') });
    const { repo, store } = memoryRepo([p]);
    const renamed = await renameProject(repo, p.id, '  後  ');
    expect(renamed.name).toBe('後');
    expect(store.get(p.id)!.name).toBe('後');
    expect(store.get(p.id)!.updatedAt).toBe(p.updatedAt);
    expect(store.get(p.id)!.layers.base).toEqual(p.layers.base);
  });
  it('空の名前は、日本語の理由つきのエラーで、何も変えない', async () => {
    const p = createProject({ name: '前' });
    const { repo, store } = memoryRepo([p]);
    await expect(renameProject(repo, p.id, '  ')).rejects.toBeInstanceOf(RepositoryError);
    expect(store.get(p.id)!.name).toBe('前');
  });
  it('存在しない作品はエラー', async () => {
    await expect(renameProject(memoryRepo().repo, 'none', 'x')).rejects.toThrow('見つかりません');
  });
});

describe('duplicateProject', () => {
  it('別の id・「のコピー」という名前・同じ絵の、新しい作品ができ、元の作品は変わらない', async () => {
    const src = createProject({ name: '元', now: new Date('2026-01-01T00:00:00Z') });
    src.layers.paint[8] = 77;
    const { repo, store } = memoryRepo([src]);
    const copy = await duplicateProject(repo, src.id, new Date('2026-10-07T00:00:00Z'));

    expect(copy.id).not.toBe(src.id);
    expect(copy.name).toBe('元 のコピー');
    expect(copy.layers.paint[8]).toBe(77);
    expect(copy.createdAt).toBe('2026-10-07T00:00:00.000Z');
    expect(store.size).toBe(2);
    expect(store.get(src.id)!.updatedAt).toBe(src.updatedAt);
  });
  it('コピーの絵を書き換えても、元の絵に影響しない (3層が別の配列)', async () => {
    const src = createProject({ name: '元' });
    const { repo, store } = memoryRepo([src]);
    const copy = await duplicateProject(repo, src.id);
    copy.layers.paint[0] = 200;
    expect(store.get(src.id)!.layers.paint[0]).toBe(0);
  });
  it('何度複製しても、名前が重ならない', async () => {
    const src = createProject({ name: '元' });
    const { repo } = memoryRepo([src]);
    const names = [(await duplicateProject(repo, src.id)).name, (await duplicateProject(repo, src.id)).name, (await duplicateProject(repo, src.id)).name];
    expect(names).toEqual(['元 のコピー', '元 のコピー 2', '元 のコピー 3']);
  });
  it('存在しない作品はエラー', async () => {
    await expect(duplicateProject(memoryRepo().repo, 'none')).rejects.toThrow('見つかりません');
  });
});

describe('複製と生成の記録', () => {
  it('Quick Design の作品を複製すると、生成の記録も引き継がれる (複製の「もう一度作る」ができる)', async () => {
    const source = createProject({ name: 'QD', generation: { answers: { top: 'jacket' }, seed: 99, rendererVersion: 1 } });
    const { repo, store } = memoryRepo([source]);
    const copy = await duplicateProject(repo, source.id);
    expect(copy.generation).toEqual({ answers: { top: 'jacket' }, seed: 99, rendererVersion: 1 });
    expect(store.get(copy.id)!.generation).toEqual(source.generation);
  });
});
