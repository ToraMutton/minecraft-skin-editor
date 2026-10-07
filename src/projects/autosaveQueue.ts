// 自動保存の順番待ち。React に依存しないので、時間を止めてテストできる
//
// ・保存は1つずつ順番に実行する (同時に2つ保存したり、古い内容が新しい内容を上書きしたりしない)
// ・描いてから少し待って保存する (描き続けている間は待ち時間がやり直し)
// ・保存の完了を await で待てる (作品を切り替える・削除する前に使う)
import type { SaveEvent } from './saveStatus';
import type { SkinProject } from './project';

export interface AutosaveQueueOptions {
  getProject: () => SkinProject | null; // 保存する瞬間の、今の作品
  save: (project: SkinProject) => Promise<void>;
  describeError: (error: unknown) => string; // 失敗の理由 (画面に出す日本語)
  onEvent: (event: SaveEvent) => void; // 保存状態の変化 (画面の表示用)
  delay: number; // 描いてから保存するまでの待ち時間 (ミリ秒)
  now?: () => Date;
}

export class AutosaveQueue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tail: Promise<unknown> = Promise.resolve(); // 保存の順番待ちの列
  private unsaved = false; // まだ保存していない変更があるか
  private readonly opts: AutosaveQueueOptions;
  private getProject: () => SkinProject | null;

  constructor(opts: AutosaveQueueOptions) {
    this.opts = opts;
    this.getProject = opts.getProject;
  }

  // 「今の作品を返す関数」を差し替える (画面が再描画されるたびに、最新のものにしておく)
  setGetProject(getProject: () => SkinProject | null) {
    this.getProject = getProject;
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  // 描いた・変更したら呼ぶ: 少し待ってから保存する
  markEdited() {
    this.unsaved = true;
    this.opts.onEvent({ type: 'edited' });
    this.clearTimer();
    this.timer = setTimeout(() => { void this.saveNow(); }, this.opts.delay);
  }

  // 今すぐ保存する (変更が無くても保存する)。成功したら true
  saveNow(): Promise<boolean> {
    this.clearTimer();
    const run = this.tail.then(async () => {
      const project = this.getProject();
      if (!project) return true;

      this.unsaved = false; // この瞬間の内容を保存する。保存中にまた描かれたら、markEdited で true に戻る
      this.opts.onEvent({ type: 'saveStarted' });
      try {
        // 保存する瞬間の更新日時を付ける (一覧の「新しい順」の元になる)
        await this.opts.save({ ...project, updatedAt: (this.opts.now?.() ?? new Date()).toISOString() });
        this.opts.onEvent({ type: 'saveSucceeded' });
        return true;
      } catch (error) {
        this.unsaved = true; // 保存できていないので、次のチャンスにまた保存する
        this.opts.onEvent({ type: 'saveFailed', message: this.opts.describeError(error) });
        return false;
      }
    });
    this.tail = run;
    return run;
  }

  // 変更があるときだけ保存する。保存が必要なかった場合も true (作品を切り替える前などに使う)
  async flush(): Promise<boolean> {
    if (!this.unsaved) { await this.tail; return true; } // 保存中のものがあれば、その完了を待つ
    return this.saveNow();
  }

  // 保存の予約を捨てて、今保存している分の完了を待つ (作品を削除するときなど。消した作品が保存で復活しないように)
  async discardPending(): Promise<void> {
    this.clearTimer();
    this.unsaved = false;
    await this.tail;
    this.opts.onEvent({ type: 'reset' });
  }

  // 作品を切り替えた: 新しい作品は変更なしの状態から始める
  reset() {
    this.clearTimer();
    this.unsaved = false;
    this.opts.onEvent({ type: 'reset' });
  }
}
