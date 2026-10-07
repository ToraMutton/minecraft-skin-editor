// fake-indexeddb を最初に読み込むと、Node の上に本物と同じ動きの IndexedDB が用意される
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, deleteDB } from 'idb';
import { LocalProjectRepository, isValidProject } from './localRepository';
import { RepositoryError } from './repository';
import { createProject } from './project';
import { PIXEL_COUNT } from '../editor/canvas/layers';

// テストごとに、データベースを丸ごと消して始める
// (索引などの作り方も本物のコードで毎回作られるようにするため。テスト側で作ってしまうと、本物のコードの間違いを見逃す)
// 開きっぱなしの接続があると deleteDB が終わらず待ち続けるので、使った窓口は必ず閉じる
const opened: LocalProjectRepository[] = [];
function newRepo() {
  const repo = new LocalProjectRepository();
  opened.push(repo);
  return repo;
}
beforeEach(async () => {
  await deleteDB('vextra');
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map(r => r.close()));
});

const at = (iso: string) => new Date(iso);

describe('保存と読み込み', () => {
  it('保存した作品を、3層の中身まで同じ状態で取り出せる', async () => {
    const repo = newRepo();
    const project = createProject({ name: 'A' });
    project.layers.paint[40] = 200; // 手描き
    project.layers.paint[43] = 255;
    project.layers.erased[10] = 1; // 消去マスク
    await repo.save(project);

    const loaded = await repo.get(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('A');
    expect(loaded!.layers.base).toEqual(project.layers.base);
    expect(loaded!.layers.paint).toEqual(project.layers.paint);
    expect(loaded!.layers.erased).toEqual(project.layers.erased);
    // 型付き配列のまま戻ってくる (PNG変換などで形が変わっていない)
    expect(loaded!.layers.paint).toBeInstanceOf(Uint8ClampedArray);
    expect(loaded!.layers.erased).toBeInstanceOf(Uint8Array);
  });

  it('同じ id で保存し直すと上書きされ、件数は増えない', async () => {
    const repo = newRepo();
    const project = createProject({ name: '前' });
    await repo.save(project);
    await repo.save({ ...project, name: '後' });
    expect((await repo.list())).toHaveLength(1);
    expect((await repo.get(project.id))!.name).toBe('後');
  });

  it('存在しない id は null', async () => {
    expect(await newRepo().get('nothing')).toBeNull();
  });

  it('削除すると取り出せなくなる。存在しない id の削除でも失敗しない', async () => {
    const repo = newRepo();
    const project = createProject();
    await repo.save(project);
    await repo.delete(project.id);
    expect(await repo.get(project.id)).toBeNull();
    await expect(repo.delete(project.id)).resolves.toBeUndefined();
  });

  it('新しく開き直した別の窓口からも、保存した作品が読める (ブラウザを閉じて開き直した状態)', async () => {
    const project = createProject({ name: '永続' });
    await newRepo().save(project);
    expect((await newRepo().get(project.id))!.name).toBe('永続');
  });
});

describe('一覧', () => {
  it('更新が新しい順に並び、3層は含まない', async () => {
    const repo = newRepo();
    const old = createProject({ name: '古い', now: at('2026-01-01T00:00:00Z') });
    const mid = createProject({ name: '真ん中', now: at('2026-06-01T00:00:00Z') });
    const recent = createProject({ name: '新しい', now: at('2026-10-01T00:00:00Z') });
    for (const p of [mid, old, recent]) await repo.save(p); // わざと順番をばらして保存

    const list = await repo.list();
    expect(list.map(p => p.name)).toEqual(['新しい', '真ん中', '古い']);
    expect(list[0]).not.toHaveProperty('layers');
  });

  it('並びは「更新日時」の順で、作成日時ではない (古くに作って、最近更新した作品が上に来る)', async () => {
    const repo = newRepo();
    const createdEarlyUpdatedLate = { ...createProject({ name: '古くに作成・最近更新', now: at('2026-01-01T00:00:00Z') }), updatedAt: '2026-10-05T00:00:00.000Z' };
    const createdLateNeverUpdated = createProject({ name: '最近作成・更新なし', now: at('2026-09-01T00:00:00Z') });
    await repo.save(createdLateNeverUpdated);
    await repo.save(createdEarlyUpdatedLate);

    expect((await repo.list()).map(p => p.name)).toEqual(['古くに作成・最近更新', '最近作成・更新なし']);
  });

  it('作品が無ければ空の一覧', async () => {
    expect(await newRepo().list()).toEqual([]);
  });
});

describe('壊れたデータへの耐性', () => {
  // 窓口を通さず、データベースに直接書き込んで「壊れた保存データ」を作る
  async function putRaw(value: unknown) {
    await newRepo().list(); // 本物のコードでデータベースを作ってから、直接書き込む
    const db = await openDB('vextra', 1);
    await db.put('projects', value);
    db.close();
  }
  const rawOf = (p = createProject({ name: '壊す前' })) => ({ ...p });

  it('壊れた作品があっても、一覧は壊れていない作品だけで表示できる (一覧が全滅しない)', async () => {
    const repo = newRepo();
    const ok = createProject({ name: '無事' });
    await repo.save(ok);
    await putRaw({ id: 'bad-1', name: '層が無い' });
    await putRaw({ ...rawOf(), id: 'bad-2', layers: { base: new Uint8ClampedArray(10), paint: new Uint8ClampedArray(10), erased: new Uint8Array(1) } });
    await putRaw({ ...rawOf(), id: 'bad-3', model: 'unknown' });

    expect((await repo.list()).map(p => p.name)).toEqual(['無事']);
  });

  it('壊れた作品を get すると、日本語の理由つきのエラーになる (例外で画面が止まらず、エラーとして扱える)', async () => {
    await putRaw({ id: 'bad', name: '壊れ' });
    await expect(newRepo().get('bad')).rejects.toBeInstanceOf(RepositoryError);
    await expect(newRepo().get('bad')).rejects.toThrow('壊れています');
  });

  it('壊れた作品は、一覧に出なくなっても消されない (あとから救出できる)', async () => {
    await putRaw({ id: 'keep', name: '残す' });
    await newRepo().list();
    const db = await openDB('vextra', 1);
    expect(await db.get('projects', 'keep')).toBeDefined();
    db.close();
  });

  it('isValidProject: 正しい作品だけを通す', () => {
    const good = createProject();
    expect(isValidProject(good)).toBe(true);
    expect(isValidProject(null)).toBe(false);
    expect(isValidProject('text')).toBe(false);
    expect(isValidProject({ ...good, schemaVersion: 999 })).toBe(false); // 将来の形式は、今のコードでは読めない
    expect(isValidProject({ ...good, layers: { ...good.layers, erased: new Uint8Array(PIXEL_COUNT - 1) } })).toBe(false);
    expect(isValidProject({ ...good, layers: { ...good.layers, base: new Array(PIXEL_COUNT * 4).fill(0) } })).toBe(false); // 普通の配列は型付き配列ではない
  });
});

describe('保存に失敗したとき', () => {
  it('容量不足は、理由のわかる日本語メッセージの RepositoryError になる', async () => {
    const repo = newRepo();
    // 保存の途中で容量不足(QuotaExceededError)が起きたことにする
    const db = await (repo as unknown as { db(): Promise<{ put: () => Promise<void> }> }).db();
    db.put = () => Promise.reject(new DOMException('full', 'QuotaExceededError'));

    const error = await repo.save(createProject()).catch(e => e);
    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.message).toContain('容量');
  });
});
