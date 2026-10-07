import { describe, it, expect } from 'vitest';
import { nextStatus, hasUnsavedChanges, INITIAL_STATUS } from './saveStatus';
import type { SaveEvent, SaveStatus } from './saveStatus';

// イベントを順に流して、最終的な状態を返す
const run = (events: SaveEvent[], from: SaveStatus = INITIAL_STATUS) => events.reduce(nextStatus, from);
const edited: SaveEvent = { type: 'edited' };
const started: SaveEvent = { type: 'saveStarted' };
const ok: SaveEvent = { type: 'saveSucceeded' };
const failed: SaveEvent = { type: 'saveFailed', message: '容量がいっぱいです' };

describe('保存状態の移り変わり', () => {
  it('最初は保存済み', () => {
    expect(INITIAL_STATUS).toEqual({ kind: 'saved' });
  });

  it('描く → 未保存 → 保存中 → 保存済み、の基本の流れ', () => {
    expect(run([edited])).toEqual({ kind: 'dirty' });
    expect(run([edited, started])).toEqual({ kind: 'saving', dirtyAgain: false });
    expect(run([edited, started, ok])).toEqual({ kind: 'saved' });
  });

  it('描き続けている間は未保存のまま (何回描いても)', () => {
    expect(run([edited, edited, edited])).toEqual({ kind: 'dirty' });
  });

  it('保存している最中にまた描いたら、保存が終わっても未保存に戻る (新しい分を取りこぼさない)', () => {
    expect(run([edited, started, edited])).toEqual({ kind: 'saving', dirtyAgain: true });
    expect(run([edited, started, edited, ok])).toEqual({ kind: 'dirty' });
  });

  it('保存に失敗したら、理由つきのエラーになる', () => {
    expect(run([edited, started, failed])).toEqual({ kind: 'error', message: '容量がいっぱいです' });
  });

  it('失敗の後にまた描いたら、未保存に戻って再試行できる', () => {
    const afterError = run([edited, started, failed]);
    expect(run([edited], afterError)).toEqual({ kind: 'dirty' });
    expect(run([edited, started, ok], afterError)).toEqual({ kind: 'saved' });
  });

  it('失敗の状態からでも、保存を始め直せる (「再試行」ボタン用)', () => {
    const afterError = run([edited, started, failed]);
    expect(run([started], afterError)).toEqual({ kind: 'saving', dirtyAgain: false });
  });

  it('おかしな順番のイベントは無視する (保存していないのに「成功」が来ても、状態は変わらない)', () => {
    expect(run([ok])).toEqual({ kind: 'saved' });
    expect(run([failed])).toEqual({ kind: 'saved' });
    expect(run([started])).toEqual({ kind: 'saved' });
    expect(run([edited, ok])).toEqual({ kind: 'dirty' });
  });

  it('保存済み以外は「未保存の内容あり」', () => {
    expect(hasUnsavedChanges({ kind: 'saved' })).toBe(false);
    for (const s of [run([edited]), run([edited, started]), run([edited, started, failed])]) expect(hasUnsavedChanges(s)).toBe(true);
  });
});
