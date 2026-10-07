import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutosaveQueue } from './autosaveQueue';
import { createProject } from './project';
import type { SkinProject } from './project';
import type { SaveEvent } from './saveStatus';

// 時間を止めて、「1秒後に保存」を一瞬で進められるようにする
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// 保存の完了を、テストが好きなタイミングで決められる偽の保存先
function setup(options: { failNext?: boolean } = {}) {
  const saved: SkinProject[] = [];
  const events: SaveEvent[] = [];
  const gates: (() => void)[] = []; // 保存の完了待ち。gate を呼ぶと、その保存が終わる
  let current = createProject({ name: 'v1' });
  let fail = options.failNext ?? false;
  let hold = false; // true の間は、保存が終わらない

  const queue = new AutosaveQueue({
    getProject: () => current,
    save: async project => {
      if (hold) await new Promise<void>(resolve => gates.push(resolve));
      if (fail) { fail = false; throw new Error('容量不足'); }
      saved.push(project);
    },
    describeError: () => '保存できません',
    onEvent: e => events.push(e),
    delay: 1000,
  });
  return {
    queue, saved, events, gates,
    edit(name: string) { current = { ...current, name }; queue.markEdited(); },
    holdSaves() { hold = true; },
    release() { hold = false; gates.splice(0).forEach(g => g()); },
    failNextSave() { fail = true; },
  };
}
const kinds = (events: SaveEvent[]) => events.map(e => e.type);

describe('描いてから保存するまで', () => {
  it('描いて1秒待つと、1回保存される', async () => {
    const t = setup();
    t.edit('A');
    expect(t.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(t.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.saved.map(p => p.name)).toEqual(['A']);
    expect(kinds(t.events)).toEqual(['edited', 'saveStarted', 'saveSucceeded']);
  });

  it('描き続けている間は待ち時間がやり直しになり、最後に1回だけ、最新の内容を保存する', async () => {
    const t = setup();
    for (const name of ['A', 'B', 'C']) { t.edit(name); await vi.advanceTimersByTimeAsync(600); }
    expect(t.saved).toHaveLength(0); // まだ1秒たっていない
    await vi.advanceTimersByTimeAsync(400);
    expect(t.saved.map(p => p.name)).toEqual(['C']);
  });

  it('保存するたびに、保存する瞬間の更新日時が付く', async () => {
    const t = setup();
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    t.edit('A');
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.saved[0].updatedAt).toBe('2026-10-07T10:00:01.000Z');
  });
});

describe('保存は1つずつ順番に', () => {
  it('保存の最中にまた保存を頼むと、前の保存が終わるまで始まらない', async () => {
    const t = setup();
    t.holdSaves();
    t.edit('A');
    await vi.advanceTimersByTimeAsync(1000); // 1つ目の保存が始まって、終わらない
    const second = t.queue.saveNow(); // 2つ目を頼む
    await vi.advanceTimersByTimeAsync(0);
    expect(t.gates).toHaveLength(1); // 始まっているのは1つ目だけ
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await second).toBe(true);
  });

  it('保存の最中に描いた分は、あとでちゃんと保存される (取りこぼさない)', async () => {
    const t = setup();
    t.holdSaves();
    t.edit('A');
    await vi.advanceTimersByTimeAsync(1000);
    t.edit('B'); // 保存の最中に描いた
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.saved.map(p => p.name)).toEqual(['A', 'B']);
  });
});

describe('flush (切り替える前の保存)', () => {
  it('変更があれば保存して true', async () => {
    const t = setup();
    t.edit('A');
    expect(await t.queue.flush()).toBe(true);
    expect(t.saved.map(p => p.name)).toEqual(['A']);
  });

  it('変更が無ければ保存しない (更新日時だけが新しくならない)', async () => {
    const t = setup();
    expect(await t.queue.flush()).toBe(true);
    expect(t.saved).toHaveLength(0);
  });

  it('保存中のものがあれば、その完了を待ってから戻る', async () => {
    const t = setup();
    t.holdSaves();
    t.edit('A');
    await vi.advanceTimersByTimeAsync(1000);
    let done = false;
    void t.queue.flush().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('保存に失敗したら false (切り替えを止められる)。次の flush で、もう一度保存する', async () => {
    const t = setup({ failNext: true });
    t.edit('A');
    expect(await t.queue.flush()).toBe(false);
    expect(t.events.at(-1)).toEqual({ type: 'saveFailed', message: '保存できません' });
    expect(await t.queue.flush()).toBe(true); // 直ったので、成功する
    expect(t.saved.map(p => p.name)).toEqual(['A']);
  });
});

describe('discardPending (削除などで、保存の予約を捨てる)', () => {
  it('予約済みの保存は、時間がたっても実行されない (消した作品が保存で復活しない)', async () => {
    const t = setup();
    t.edit('A'); // 保存の予約
    await t.queue.discardPending();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.saved).toHaveLength(0);
    expect(t.events.at(-1)).toEqual({ type: 'reset' });
  });

  it('捨てた後は、flush も「変更なし」として何も保存しない', async () => {
    const t = setup();
    t.edit('A');
    await t.queue.discardPending();
    expect(await t.queue.flush()).toBe(true);
    expect(t.saved).toHaveLength(0);
  });

  it('保存の最中なら、その完了を待ってから戻る (戻った後に、古い保存が割り込まない)', async () => {
    const t = setup();
    t.holdSaves();
    t.edit('A');
    await vi.advanceTimersByTimeAsync(1000);
    let discarded = false;
    void t.queue.discardPending().then(() => { discarded = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(discarded).toBe(false);
    t.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(discarded).toBe(true);
  });

  it('捨てた後に新しく描けば、また普通に保存される', async () => {
    const t = setup();
    t.edit('A');
    await t.queue.discardPending();
    t.edit('B');
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.saved.map(p => p.name)).toEqual(['B']);
  });
});

describe('reset (作品を切り替えた)', () => {
  it('予約を捨てて、保存状態を「変更なし」に戻す', async () => {
    const t = setup();
    t.edit('A');
    t.queue.reset();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.saved).toHaveLength(0);
    expect(t.events.at(-1)).toEqual({ type: 'reset' });
  });
});

describe('setGetProject (今の作品を返す関数の差し替え)', () => {
  it('差し替えた後の保存では、新しい関数が返す作品が保存される', async () => {
    const t = setup();
    const other = createProject({ name: '別の作品' });
    t.queue.setGetProject(() => other);
    t.queue.markEdited();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.saved.map(p => p.name)).toEqual(['別の作品']);
  });
});
