// マイスキンの一覧に出す情報 (作品の情報 + 正面のサムネイル)
import type { ProjectRepository } from './repository';
import type { ProjectSummary } from './project';
import { frontThumbnail } from './thumbnail';
import { getLayout } from '../editor/skin/layout';

export interface ProjectItem {
  summary: ProjectSummary;
  thumbnail: Uint8ClampedArray | null; // 読めなかった作品は null (一覧には出すが、絵は出せない)
}

// 新しく更新した順に、全作品の情報とサムネイルを読む
export async function loadProjectItems(repo: ProjectRepository): Promise<ProjectItem[]> {
  const summaries = await repo.list();
  return Promise.all(summaries.map(async summary => {
    try {
      const project = await repo.get(summary.id);
      return { summary, thumbnail: project ? frontThumbnail(project.layers, getLayout(project.model)) : null };
    } catch {
      return { summary, thumbnail: null };
    }
  }));
}
