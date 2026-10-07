// 起動したときに、どの作品を開くかを決める
//
//   1. IndexedDB に作品がある → 最後に更新した作品
//   2. 無い & localStorage に昔の自動保存データがある → それを最初の作品として保存して開く (V1・1B からの移行)
//   3. どちらも無い、または読めない → 素体の新しい作品
//
// 古い localStorage のデータは消さない (移行で問題が起きても元に戻せるように。作品を失わないため)
import { createProject } from './project';
import type { SkinProject } from './project';
import type { ProjectRepository } from './repository';
import { loadAutosave } from '../editor/canvas/autosave';
import type { ImageDecoder } from '../editor/canvas/autosave';

export type StartupSource = 'indexeddb' | 'migrated' | 'new';

export interface StartupResult {
  project: SkinProject;
  source: StartupSource;
  // 開くときに起きた問題 (画面に出して知らせる用)。起動自体は止めない
  warning?: string;
}

export interface StartupDeps {
  repository: ProjectRepository;
  readLegacy: () => string | null; // localStorage の古い自動保存データ
  backupUnreadable: (data: string) => void; // 読めなかった古いデータを退避する
  decode: ImageDecoder;
}

export async function loadInitialProject({ repository, readLegacy, backupUnreadable, decode }: StartupDeps): Promise<StartupResult> {
  // 1. IndexedDB に作品があれば、最後に更新したものを開く
  try {
    const [latest] = await repository.list(); // 新しい順
    if (latest) {
      const project = await repository.get(latest.id);
      if (project) return { project, source: 'indexeddb' };
    }
  } catch {
    // IndexedDB が使えない・読めない場合は、保存なしで素体から始める (編集は続けられる)
    return {
      project: createProject(),
      source: 'new',
      warning: '作品の保存先を開けませんでした。このまま編集できますが、保存されない可能性があります',
    };
  }

  // 2. 昔の自動保存データがあれば、最初の作品にする
  const legacy = readLegacy();
  if (legacy) {
    const result = await loadAutosave(legacy, decode);
    if (result.status === 'loaded') {
      const project = createProject({ name: '以前のスキン', start: result.pixels });
      try {
        await repository.save(project); // ここで IndexedDB に入れる。localStorage は消さない
      } catch {
        return { project, source: 'migrated', warning: '以前のスキンを引き継ぎましたが、保存できませんでした' };
      }
      return { project, source: 'migrated' };
    }
    if (result.status === 'unreadable') backupUnreadable(legacy); // 消さずに退避して、素体から始める
  }

  // 3. 素体の新しい作品
  return { project: createProject(), source: 'new' };
}

// 起動処理を1回だけ実行する (同じ窓口での2回目以降の呼び出しは、1回目の結果を共有する)
// 開発モードの React は副作用をわざと2回実行するので、そのまま呼ぶと昔のデータが2つの作品として取り込まれてしまう
const startupRuns = new WeakMap<ProjectRepository, Promise<StartupResult>>();

export function loadInitialProjectOnce(deps: StartupDeps): Promise<StartupResult> {
  let run = startupRuns.get(deps.repository);
  if (!run) {
    run = loadInitialProject(deps);
    startupRuns.set(deps.repository, run);
  }
  return run;
}
