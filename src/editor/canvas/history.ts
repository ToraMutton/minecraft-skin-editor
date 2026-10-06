// Undo / Redo の履歴
// 中身(T)は何でもよい。今はスキンの3層の複製を積んでいる (1回あたり約36KB)
//
// 使い方:
//   変更する前に push(今の状態の複製)
//   Undo: const prev = history.undo(今の状態) → prev に戻す
//   Redo: const next = history.redo(今の状態) → next に進む
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // 変更する前の状態を積む。新しい変更をしたら、Redoできる先は無くなる
  push(snapshot: T) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift(); // 上限を超えたら一番古いものを捨てる
    this.redoStack = [];
  }

  // 1つ前の状態を返す (戻れなければ undefined)。current は Redo 用に取っておく
  undo(current: T): T | undefined {
    const previous = this.undoStack.pop();
    if (previous === undefined) return undefined;
    this.redoStack.push(current);
    return previous;
  }

  // 1つ先の状態を返す (進めなければ undefined)。current は Undo 用に取っておく
  redo(current: T): T | undefined {
    const next = this.redoStack.pop();
    if (next === undefined) return undefined;
    this.undoStack.push(current);
    return next;
  }
}
