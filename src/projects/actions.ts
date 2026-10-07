// 作品の操作 (名前の変更・複製・削除)。保存先の窓口(ProjectRepository)だけに依存する
import { RepositoryError } from './repository';
import type { ProjectRepository } from './repository';
import { uniqueName } from './project';
import type { SkinProject } from './project';
import { cloneLayers } from '../editor/canvas/layers';

export const MAX_NAME_LENGTH = 40;

// 入力された名前を整える。前後の空白を取り、長すぎれば切り詰める。空なら null (名前なしの作品は作らない)
export function normalizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '') return null;
  return [...name].slice(0, MAX_NAME_LENGTH).join(''); // 絵文字などを途中で割らないよう、1文字ずつ数える
}

// 名前を変える。更新日時は変えない (名前を直しただけで、一覧の並びが変わらないように)
export async function renameProject(repo: ProjectRepository, id: string, rawName: string): Promise<SkinProject> {
  const name = normalizeName(rawName);
  if (name === null) throw new RepositoryError('名前を入力してください');
  const project = await repo.get(id);
  if (!project) throw new RepositoryError('作品が見つかりません');
  const renamed = { ...project, name };
  await repo.save(renamed);
  return renamed;
}

// 複製する。「○○ のコピー」という重ならない名前で、3層も別のコピーを持つ
export async function duplicateProject(repo: ProjectRepository, id: string, now = new Date()): Promise<SkinProject> {
  const source = await repo.get(id);
  if (!source) throw new RepositoryError('作品が見つかりません');
  const existing = (await repo.list()).map(p => p.name);
  const timestamp = now.toISOString();
  const copy: SkinProject = {
    ...source,
    id: crypto.randomUUID(),
    name: uniqueName(`${source.name} のコピー`, existing),
    layers: cloneLayers(source.layers),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await repo.save(copy);
  return copy;
}
