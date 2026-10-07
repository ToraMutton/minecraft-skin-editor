import { describe, it, expect } from 'vitest';
import { loadInitialProject, loadInitialProjectOnce } from './startup';
import type { StartupDeps } from './startup';
import { createProject } from './project';
import type { SkinProject, ProjectSummary } from './project';
import { summarize } from './project';
import type { ProjectRepository } from './repository';
import type { ImageDecoder } from '../editor/canvas/autosave';

// メモリ上だけの偽の保存先 (IndexedDBを使わずに、起動の判断だけをテストする)
function memoryRepo(initial: SkinProject[] = [], options: { failList?: boolean; failSave?: boolean } = {}) {
  const store = new Map(initial.map(p => [p.id, p]));
  const repo: ProjectRepository = {
    async list() {
      if (options.failList) throw new Error('開けない');
      return [...store.values()].map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) as ProjectSummary[];
    },
    async get(id) { return store.get(id) ?? null; },
    async save(p) { if (options.failSave) throw new Error('容量不足'); store.set(p.id, p); },
    async delete(id) { store.delete(id); },
  };
  return { repo, store };
}

const okDecoder = (size = 64): ImageDecoder => async () => ({ width: size, height: size, pixels: new Uint8ClampedArray(64 * 64 * 4).fill(5) });
const failDecoder: ImageDecoder = async () => { throw new Error('壊れ'); };
const PNG = 'data:image/png;base64,AAAA';

function deps(over: Partial<StartupDeps> & { repo: ProjectRepository }): StartupDeps & { backups: string[] } {
  const backups: string[] = [];
  return { repository: over.repo, readLegacy: over.readLegacy ?? (() => null), backupUnreadable: d => backups.push(d), decode: over.decode ?? okDecoder(), backups };
}

describe('起動時にどの作品を開くか', () => {
  it('作品があれば、最後に更新したものを開く', async () => {
    const old = createProject({ name: '古い', now: new Date('2026-01-01') });
    const recent = createProject({ name: '最近', now: new Date('2026-10-01') });
    const { repo } = memoryRepo([old, recent]);
    const result = await loadInitialProject(deps({ repo }));
    expect(result.source).toBe('indexeddb');
    expect(result.project.name).toBe('最近');
  });

  it('作品があるときは、古い localStorage のデータは見ない (二重に取り込まない)', async () => {
    const { repo, store } = memoryRepo([createProject({ name: '既存' })]);
    let read = false;
    await loadInitialProject(deps({ repo, readLegacy: () => { read = true; return PNG; } }));
    expect(read).toBe(false);
    expect(store.size).toBe(1);
  });

  it('作品が無くて昔の自動保存データがあれば、それを最初の作品として保存して開く', async () => {
    const { repo, store } = memoryRepo();
    const result = await loadInitialProject(deps({ repo, readLegacy: () => PNG }));
    expect(result.source).toBe('migrated');
    expect(result.project.name).toBe('以前のスキン');
    expect(result.project.layers.base[0]).toBe(5); // 昔の絵が下地になっている
    expect(store.has(result.project.id)).toBe(true); // IndexedDB にも保存された
    expect(result.warning).toBeUndefined();
  });

  it('移行しても、localStorage のデータは消さない (読むだけ)', async () => {
    // 消す処理は渡していないので、そもそも消せない作りになっている。退避も呼ばれない
    const { repo } = memoryRepo();
    const d = deps({ repo, readLegacy: () => PNG });
    await loadInitialProject(d);
    expect(d.backups).toEqual([]);
  });

  it('昔のデータが読めなければ、退避して素体から始める', async () => {
    const { repo, store } = memoryRepo();
    const d = deps({ repo, readLegacy: () => PNG, decode: failDecoder });
    const result = await loadInitialProject(d);
    expect(result.source).toBe('new');
    expect(d.backups).toEqual([PNG]);
    expect(result.project.layers.base.some(v => v > 0)).toBe(true); // 素体
    expect(store.size).toBe(0);
  });

  it('64×64 でない昔のデータも、読めないものとして退避する', async () => {
    const { repo } = memoryRepo();
    const d = deps({ repo, readLegacy: () => PNG, decode: okDecoder(32) });
    expect((await loadInitialProject(d)).source).toBe('new');
    expect(d.backups).toEqual([PNG]);
  });

  it('何も無ければ、素体の新しい作品', async () => {
    const { repo } = memoryRepo();
    const result = await loadInitialProject(deps({ repo }));
    expect(result.source).toBe('new');
    expect(result.warning).toBeUndefined();
  });

  it('保存先を開けなくても、素体で起動できる (警告つき)', async () => {
    const { repo } = memoryRepo([], { failList: true });
    const result = await loadInitialProject(deps({ repo, readLegacy: () => PNG }));
    expect(result.source).toBe('new');
    expect(result.warning).toContain('保存');
  });

  it('移行した作品を保存できなくても、絵は失われずに開ける (警告つき)', async () => {
    const { repo } = memoryRepo([], { failSave: true });
    const result = await loadInitialProject(deps({ repo, readLegacy: () => PNG }));
    expect(result.source).toBe('migrated');
    expect(result.project.layers.base[0]).toBe(5);
    expect(result.warning).toContain('保存できません');
  });
});

describe('loadInitialProjectOnce (二重に起動処理が走っても、作品が1つしか作られない)', () => {
  it('同じ保存先で2回同時に呼んでも、昔のデータの取り込みは1回だけ', async () => {
    const { repo, store } = memoryRepo();
    const d = deps({ repo, readLegacy: () => PNG });
    const [a, b] = await Promise.all([loadInitialProjectOnce(d), loadInitialProjectOnce(d)]);
    expect(store.size).toBe(1);
    expect(a.project.id).toBe(b.project.id); // 同じ作品が返る
  });

  it('保護なしの loadInitialProject だと、同時に2回呼ぶと2つ作られてしまう (保護が必要な理由)', async () => {
    // 昔のデータを読み込む処理(非同期)の途中で、もう1つの呼び出しが「作品なし」と判断するため
    const { repo, store } = memoryRepo();
    const d = deps({ repo, readLegacy: () => PNG });
    await Promise.all([loadInitialProject(d), loadInitialProject(d)]);
    expect(store.size).toBe(2);
  });

  it('別の保存先なら、それぞれ別に実行される', async () => {
    const a = memoryRepo(), b = memoryRepo();
    await loadInitialProjectOnce(deps({ repo: a.repo, readLegacy: () => PNG }));
    await loadInitialProjectOnce(deps({ repo: b.repo, readLegacy: () => PNG }));
    expect(a.store.size).toBe(1);
    expect(b.store.size).toBe(1);
  });
});
