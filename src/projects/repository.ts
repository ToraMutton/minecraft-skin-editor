import type { SkinProject, ProjectSummary } from './project';

// 作品の保存先の「窓口」。画面側はこのインターフェースだけを使う。
// 今は IndexedDB (localRepository.ts)、将来クラウド保存を足すときも、同じ形の別の実装を作るだけで済む
export interface ProjectRepository {
  // 一覧 (新しく更新した順)。3層は含まない
  list(): Promise<ProjectSummary[]>;
  // 1件取得。無ければ null
  get(id: string): Promise<SkinProject | null>;
  // 保存 (同じidがあれば上書き)。更新日時は呼び出し側で決める
  save(project: SkinProject): Promise<void>;
  delete(id: string): Promise<void>;
}

// 保存に失敗したときのエラー。理由を日本語で添えて、画面に表示できるようにする
export class RepositoryError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
    this.cause = cause;
  }
}
