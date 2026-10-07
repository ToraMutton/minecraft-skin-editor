import { useRef, useCallback, useEffect, useReducer } from 'react';
import { nextStatus, INITIAL_STATUS } from './saveStatus';
import { RepositoryError } from './repository';
import type { ProjectRepository } from './repository';
import type { SkinProject } from './project';

const AUTOSAVE_DELAY = 1000; // 描いてから保存するまで待つ時間 (ミリ秒)。描いている間は何度も保存しない

// 作品の自動保存 (IndexedDB)
// getProject: 今の作品の中身を返す関数。保存する瞬間に呼んで、最新の絵を保存する
export function useAutosave(repository: ProjectRepository, getProject: () => SkinProject | null) {
  const [status, dispatch] = useReducer(nextStatus, INITIAL_STATUS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getProjectRef = useRef(getProject);
  const saving = useRef(false); // 保存中か (同時に2つ保存しないため)
  const pending = useRef(false); // 保存中に描かれて、終わったらもう一度保存が要るか

  useEffect(() => {
    getProjectRef.current = getProject;
  });

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  // 今すぐ保存する
  const saveNow = useCallback(async () => {
    clearTimer();
    const project = getProjectRef.current();
    if (!project) return;
    if (saving.current) { pending.current = true; return; } // 保存中なら、終わった後にもう一度

    saving.current = true;
    dispatch({ type: 'saveStarted' });
    try {
      // 保存する瞬間の更新日時を付ける (一覧の「新しい順」の元になる)
      await repository.save({ ...project, updatedAt: new Date().toISOString() });
      dispatch({ type: 'saveSucceeded' });
    } catch (error) {
      dispatch({ type: 'saveFailed', message: error instanceof RepositoryError ? error.message : '保存できませんでした' });
    } finally {
      saving.current = false;
    }
    if (pending.current) { // 保存している間に描かれていた分を保存する
      pending.current = false;
      void saveNow();
    }
  }, [repository]);

  // 描いた・変更したら呼ぶ: 少し待ってから保存する (続けて描いている間は、待ち時間がやり直しになる)
  const markEdited = useCallback(() => {
    dispatch({ type: 'edited' });
    clearTimer();
    timer.current = setTimeout(() => { void saveNow(); }, AUTOSAVE_DELAY);
  }, [saveNow]);

  // 画面を閉じる・別のタブに移るときに、未保存の分があれば急いで保存する
  useEffect(() => {
    const flush = () => { if (timer.current) void saveNow(); }; // タイマーが動いている = 未保存の分がある
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [saveNow]);

  return { status, markEdited, saveNow };
}
