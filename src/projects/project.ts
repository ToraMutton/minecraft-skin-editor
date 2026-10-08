// 作品(プロジェクト)のデータ形式
import { createLayers } from '../editor/canvas/layers';
import type { SkinLayers } from '../editor/canvas/layers';
import { createStarterPixels } from '../editor/skin/starter';
import { getLayout } from '../editor/skin/layout';
import type { SkinModel } from '../editor/skin/layout';
import { parseGeneration } from '../generator/generation';
import type { Generation } from '../generator/generation';

export type { SkinModel, Generation };
export { parseGeneration };

// 保存するデータの形のバージョン。形を変えるときは増やし、読み込み時に古い形から変換する
export const SCHEMA_VERSION = 1;

export interface SkinProject {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  model: SkinModel; // classic = 腕4px / slim = 腕3px
  layers: SkinLayers; // 下地・手描き・消去マスク
  generation?: Generation; // Quick Design で作った作品だけ
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// 一覧用の軽い情報 (3層を含まない)
export type ProjectSummary = Pick<SkinProject, 'id' | 'name' | 'model' | 'createdAt' | 'updatedAt'> & { generated: boolean };

export function summarize(project: SkinProject): ProjectSummary {
  const { id, name, model, createdAt, updatedAt } = project;
  return { id, name, model, createdAt, updatedAt, generated: parseGeneration(project.generation) !== undefined };
}

export interface NewProjectOptions {
  name?: string;
  model?: SkinModel;
  generation?: Generation; // Quick Design で作るときの記録
  // 作り始め方: starter = 素体 / blank = 完全に透明 / 配列 = それを下地にする (読み込んだPNGなど)
  start?: 'starter' | 'blank' | Uint8ClampedArray;
  now?: Date; // テスト用に時刻を差し替えられる
}

export function createProject(options: NewProjectOptions = {}): SkinProject {
  const { name = '無題のスキン', model = 'classic', start = 'starter', generation, now = new Date() } = options;
  const base = start === 'starter' ? createStarterPixels(getLayout(model)) : start === 'blank' ? undefined : start;
  const timestamp = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    model,
    layers: createLayers(base),
    ...(generation ? { generation } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// 「無題のスキン」「無題のスキン 2」…のように、既存の名前と重ならない名前を作る
export function uniqueName(base: string, existing: string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
