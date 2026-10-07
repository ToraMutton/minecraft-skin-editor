import { useCallback, useEffect, useReducer, useState } from 'react';
import { nextStatus, INITIAL_STATUS } from './saveStatus';
import { AutosaveQueue } from './autosaveQueue';
import { RepositoryError } from './repository';
import type { ProjectRepository } from './repository';
import type { SkinProject } from './project';

const AUTOSAVE_DELAY = 1000; // 描いてから保存するまで待つ時間 (ミリ秒)。描いている間は何度も保存しない

// 作品の自動保存 (IndexedDB)。順番待ち・予約・破棄の中身は AutosaveQueue にあり、ここは React の状態につなぐだけ
// getProject: 今の作品の中身を返す関数。保存する瞬間に呼んで、最新の絵を保存する
export function useAutosave(repository: ProjectRepository, getProject: () => SkinProject | null) {
  const [status, dispatch] = useReducer(nextStatus, INITIAL_STATUS);
  const [queue] = useState(() => new AutosaveQueue({
    getProject,
    save: project => repository.save(project),
    describeError: error => (error instanceof RepositoryError ? error.message : '保存できませんでした'),
    onEvent: dispatch,
    delay: AUTOSAVE_DELAY,
  }));

  useEffect(() => {
    queue.setGetProject(getProject); // 再描画のたびに、最新の「今の作品を返す関数」に差し替える
  });

  const markEdited = useCallback(() => queue.markEdited(), [queue]);
  const saveNow = useCallback(() => queue.saveNow(), [queue]);
  const flush = useCallback(() => queue.flush(), [queue]);
  const discardPending = useCallback(() => queue.discardPending(), [queue]);
  const resetStatus = useCallback(() => queue.reset(), [queue]);

  // 画面を閉じる・別のタブに移るときに、未保存の分があれば急いで保存する
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') void queue.flush(); };
    const onHide = () => { void queue.flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [queue]);

  return { status, markEdited, saveNow, flush, discardPending, resetStatus };
}
