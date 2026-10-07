import { useCallback } from 'react';
import type { ProjectRepository } from '../projects/repository';
import { RepositoryError } from '../projects/repository';
import { createProject } from '../projects/project';
import type { SkinProject } from '../projects/project';
import { renameProject, duplicateProject, normalizeName } from '../projects/actions';

// 操作の結果。失敗したときは、画面に出せる日本語の理由を返す
export type ActionResult = { ok: true } | { ok: false; message: string };
const ok: ActionResult = { ok: true };
const fail = (error: unknown, fallback: string): ActionResult => ({
  ok: false, message: error instanceof RepositoryError ? error.message : fallback,
});

interface Deps {
  repository: ProjectRepository;
  projectRef: { current: SkinProject }; // 今開いている作品
  setProjectInfo: (info: { id: string; name: string }) => void;
  loadProject: (project: SkinProject) => void;
  flush: () => Promise<boolean>; // 未保存の分を保存する (保存できたら true)
  discardPending: () => Promise<void>;
  resetStatus: () => void;
  markEdited: () => void;
}

// マイスキン (作品の一覧) の操作: 開く・名前を変える・複製・削除
// 今開いている作品には、まだ保存していない絵があるので、操作の前に必ず保存する
export function useProjectManager({ repository, projectRef, setProjectInfo, loadProject, flush, discardPending, resetStatus, markEdited }: Deps) {
  // 今の作品を、一覧に反映できるよう保存しておく
  const syncCurrent = useCallback(() => flush(), [flush]);

  const open = useCallback(async (id: string): Promise<ActionResult> => {
    if (id === projectRef.current.id) return ok;
    // 保存できなかったら切り替えない (切り替えると、保存できていない絵を失う)
    if (!(await flush())) return { ok: false, message: '今のスキンを保存できなかったため、切り替えられません' };
    try {
      const project = await repository.get(id);
      if (!project) return { ok: false, message: '作品が見つかりません' };
      loadProject(project);
      resetStatus();
      return ok;
    } catch (error) {
      return fail(error, '作品を開けませんでした');
    }
  }, [repository, projectRef, flush, loadProject, resetStatus]);

  const rename = useCallback(async (id: string, rawName: string): Promise<ActionResult> => {
    try {
      if (id !== projectRef.current.id) {
        await renameProject(repository, id, rawName);
        return ok;
      }
      // 開いている作品は、メモリ上の名前を変えて保存する (保存の予約が古い名前で上書きしないように)
      const name = normalizeName(rawName);
      if (name === null) return { ok: false, message: '名前を入力してください' };
      projectRef.current = { ...projectRef.current, name };
      setProjectInfo({ id, name });
      markEdited();
      return (await flush()) ? ok : { ok: false, message: '名前を保存できませんでした' };
    } catch (error) {
      return fail(error, '名前を変更できませんでした');
    }
  }, [repository, projectRef, setProjectInfo, markEdited, flush]);

  const duplicate = useCallback(async (id: string): Promise<ActionResult> => {
    try {
      if (id === projectRef.current.id && !(await flush())) return { ok: false, message: '今のスキンを保存できなかったため、複製できません' };
      await duplicateProject(repository, id);
      return ok;
    } catch (error) {
      return fail(error, '複製できませんでした');
    }
  }, [repository, projectRef, flush]);

  const remove = useCallback(async (id: string): Promise<ActionResult> => {
    try {
      if (id !== projectRef.current.id) {
        await repository.delete(id);
        return ok;
      }
      // 開いている作品を消す: 保存の予約を捨ててから消す (予約が残っていると、消した作品が保存で復活する)
      await discardPending();
      try {
        await repository.delete(id);
      } catch (error) {
        markEdited(); // 消せなかった。作品は開いたままなので、また保存できる状態に戻す
        throw error;
      }
      // 代わりに、残っている最新の作品を開く。1つも無ければ、素体の新しい作品を作る
      const [next] = await repository.list();
      const project = next ? await repository.get(next.id) : null;
      if (project) {
        loadProject(project);
      } else {
        const fresh = createProject();
        loadProject(fresh);
        await repository.save(fresh);
      }
      resetStatus();
      return ok;
    } catch (error) {
      return fail(error, '削除できませんでした');
    }
  }, [repository, projectRef, discardPending, markEdited, loadProject, resetStatus]);

  return { open, rename, duplicate, remove, syncCurrent };
}
