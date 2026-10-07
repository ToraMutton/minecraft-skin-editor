// ブラウザの IndexedDB に作品を保存する実装
// IndexedDB は型付き配列(Uint8ClampedArray など)をそのまま保存できるので、3層をPNGに変換せずに入れる
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { RepositoryError } from './repository';
import type { ProjectRepository } from './repository';
import { SCHEMA_VERSION, summarize } from './project';
import type { SkinProject, ProjectSummary } from './project';
import { PIXEL_COUNT } from '../editor/canvas/layers';

const DB_NAME = 'vextra';
const DB_VERSION = 1;
const STORE = 'projects';

// 保存されていたデータが、作品として使える形かを確かめる (壊れたデータで画面が止まらないように)
export function isValidProject(value: unknown): value is SkinProject {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<SkinProject>;
  return (
    p.schemaVersion === SCHEMA_VERSION &&
    typeof p.id === 'string' && p.id.length > 0 &&
    typeof p.name === 'string' &&
    (p.model === 'classic' || p.model === 'slim') &&
    typeof p.createdAt === 'string' && typeof p.updatedAt === 'string' &&
    typeof p.layers === 'object' && p.layers !== null &&
    p.layers.base instanceof Uint8ClampedArray && p.layers.base.length === PIXEL_COUNT * 4 &&
    p.layers.paint instanceof Uint8ClampedArray && p.layers.paint.length === PIXEL_COUNT * 4 &&
    p.layers.erased instanceof Uint8Array && p.layers.erased.length === PIXEL_COUNT
  );
}

// 保存の失敗を、画面に出せる日本語のメッセージにする
function describeFailure(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'QuotaExceededError') return 'ブラウザの保存容量がいっぱいです';
  if (name === 'InvalidStateError' || name === 'SecurityError') return 'このブラウザ(またはプライベートモード)では保存できません';
  return '保存できませんでした';
}

export class LocalProjectRepository implements ProjectRepository {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  // 使うときに初めて開く (開けなければ、次回また試せるよう結果を覚えない)
  private db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // 初めて作るとき。一覧を更新日時順に取れるよう、updatedAt の索引も作る
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        },
      }).catch(error => {
        this.dbPromise = null;
        throw new RepositoryError(describeFailure(error), error);
      });
    }
    return this.dbPromise;
  }

  // データベースとの接続を閉じる (閉じた後に使うと、また自動で開き直す)
  async close(): Promise<void> {
    const pending = this.dbPromise;
    this.dbPromise = null;
    if (pending) (await pending.catch(() => null))?.close();
  }

  async list(): Promise<ProjectSummary[]> {
    const db = await this.db();
    try {
      const all = await db.getAllFromIndex(STORE, 'updatedAt');
      // 壊れたデータは一覧に出さない (消しはしないので、あとから救出できる)
      return all.filter(isValidProject).map(summarize).reverse(); // 新しい順
    } catch (error) {
      throw new RepositoryError('作品の一覧を読み込めませんでした', error);
    }
  }

  async get(id: string): Promise<SkinProject | null> {
    const db = await this.db();
    try {
      const value = await db.get(STORE, id);
      if (value === undefined) return null;
      if (!isValidProject(value)) throw new RepositoryError('作品のデータが壊れています');
      return value;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      throw new RepositoryError('作品を読み込めませんでした', error);
    }
  }

  async save(project: SkinProject): Promise<void> {
    const db = await this.db();
    try {
      await db.put(STORE, project);
    } catch (error) {
      throw new RepositoryError(describeFailure(error), error);
    }
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    try {
      await db.delete(STORE, id);
    } catch (error) {
      throw new RepositoryError('作品を削除できませんでした', error);
    }
  }
}
