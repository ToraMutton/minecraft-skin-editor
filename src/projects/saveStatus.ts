// 保存の状態と、その移り変わり。画面の「✓ 保存済み / 保存中… / ⚠ 保存失敗」の元になる
//
//   saved  : 保存済み (今の内容がIndexedDBにある)
//   dirty  : 未保存 (描いたが、まだ保存していない。少し待ってから保存する)
//   saving : 保存中
//   error  : 保存に失敗した (message に理由)。次に何か描いたら、また保存を試みる

export type SaveStatus =
  | { kind: 'saved' }
  | { kind: 'dirty' }
  | { kind: 'saving'; dirtyAgain: boolean } // dirtyAgain: 保存している最中にまた描いたか
  | { kind: 'error'; message: string };

export type SaveEvent =
  | { type: 'edited' } // 描いた・変更した
  | { type: 'saveStarted' } // 保存を始めた
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; message: string };

export const INITIAL_STATUS: SaveStatus = { kind: 'saved' };

export function nextStatus(status: SaveStatus, event: SaveEvent): SaveStatus {
  switch (event.type) {
    case 'edited':
      // 保存の最中に描いたら、その保存が終わった後にもう一度保存が要る
      if (status.kind === 'saving') return { kind: 'saving', dirtyAgain: true };
      return { kind: 'dirty' }; // saved / dirty / error のどこからでも、未保存になる (errorからは再試行になる)

    case 'saveStarted':
      return status.kind === 'dirty' || status.kind === 'error' ? { kind: 'saving', dirtyAgain: false } : status;

    case 'saveSucceeded':
      if (status.kind !== 'saving') return status;
      // 保存している間にまた描いていたなら、まだ未保存の分が残っている
      return status.dirtyAgain ? { kind: 'dirty' } : { kind: 'saved' };

    case 'saveFailed':
      return status.kind === 'saving' ? { kind: 'error', message: event.message } : status;
  }
}

// 画面を閉じようとしたときに、警告が要るか (まだ保存できていない内容があるか)
export function hasUnsavedChanges(status: SaveStatus): boolean {
  return status.kind !== 'saved';
}
