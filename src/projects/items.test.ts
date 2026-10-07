import { describe, it, expect } from 'vitest';
import { loadProjectItems } from './items';
import { createProject, summarize } from './project';
import type { SkinProject } from './project';
import type { ProjectRepository } from './repository';

function repoOf(projects: SkinProject[], failGet: string[] = []): ProjectRepository {
  const store = new Map(projects.map(p => [p.id, p]));
  return {
    async list() { return projects.map(summarize); },
    async get(id) { if (failGet.includes(id)) throw new Error('壊れ'); return store.get(id) ?? null; },
    async save() {}, async delete() {},
  };
}

describe('loadProjectItems', () => {
  it('作品ごとに、情報と16×32のサムネイルを返す', async () => {
    const a = createProject({ name: 'A' });
    const items = await loadProjectItems(repoOf([a]));
    expect(items).toHaveLength(1);
    expect(items[0].summary.name).toBe('A');
    expect(items[0].thumbnail).toHaveLength(16 * 32 * 4);
  });

  it('作品が無ければ空', async () => {
    expect(await loadProjectItems(repoOf([]))).toEqual([]);
  });

  it('1つ読めない作品があっても、一覧は全部出る (読めない作品はサムネイルなし)', async () => {
    const good = createProject({ name: '無事' }), bad = createProject({ name: '壊れ' });
    const items = await loadProjectItems(repoOf([good, bad], [bad.id]));
    expect(items.map(i => i.summary.name)).toEqual(['無事', '壊れ']);
    expect(items[0].thumbnail).not.toBeNull();
    expect(items[1].thumbnail).toBeNull();
  });
});
