import { describe, it, expect } from 'vitest';
import { History } from './history';

// 状態を文字列で表して、「描く → Undo → Redo」の流れを確かめる
// (今の状態 = state。変更する前に push(state) してから state を書き換える、という使い方)
function editor(limit = 100) {
  const history = new History<string>(limit);
  let state = 'A';
  return {
    history,
    get state() { return state; },
    edit(next: string) { history.push(state); state = next; },
    undo() { const s = history.undo(state); if (s !== undefined) state = s; },
    redo() { const s = history.redo(state); if (s !== undefined) state = s; },
  };
}

describe('History (Undo / Redo)', () => {
  it('最初は Undo も Redo もできない', () => {
    const { history } = editor();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('Undo で1つ前、Redo で1つ先に戻る', () => {
    const e = editor();
    e.edit('B'); e.edit('C');
    e.undo(); expect(e.state).toBe('B');
    e.undo(); expect(e.state).toBe('A');
    e.redo(); expect(e.state).toBe('B');
    e.redo(); expect(e.state).toBe('C');
  });

  it('これ以上戻れない・進めないときは、状態を変えない', () => {
    const e = editor();
    e.edit('B');
    e.undo(); e.undo(); expect(e.state).toBe('A');
    e.redo(); e.redo(); expect(e.state).toBe('B');
  });

  it('Undo した後に新しく描くと、Redo できる先は無くなる', () => {
    const e = editor();
    e.edit('B'); e.edit('C');
    e.undo(); // B
    e.edit('D');
    expect(e.history.canRedo).toBe(false);
    e.redo(); expect(e.state).toBe('D');
    e.undo(); expect(e.state).toBe('B');
  });

  it('canUndo / canRedo がボタンの状態として正しく変わる', () => {
    const e = editor();
    e.edit('B');
    expect([e.history.canUndo, e.history.canRedo]).toEqual([true, false]);
    e.undo();
    expect([e.history.canUndo, e.history.canRedo]).toEqual([false, true]);
    e.redo();
    expect([e.history.canUndo, e.history.canRedo]).toEqual([true, false]);
  });

  it('上限を超えると一番古い履歴から捨てる (上限3なら3回までしか戻れない)', () => {
    const e = editor(3);
    for (const s of ['B', 'C', 'D', 'E']) e.edit(s); // A→B→C→D→E
    e.undo(); e.undo(); e.undo();
    expect(e.state).toBe('B'); // A までは戻れない
    expect(e.history.canUndo).toBe(false);
  });

  it('上限100なら100回戻れる', () => {
    const e = editor(100);
    for (let i = 1; i <= 120; i++) e.edit(String(i));
    let count = 0;
    while (e.history.canUndo) { e.undo(); count++; }
    expect(count).toBe(100);
    expect(e.state).toBe('20');
  });
});
