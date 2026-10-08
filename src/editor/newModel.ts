// 「新規」で作るスキンのモデル (Classic / Slim) を、次に開いたときも覚えておく
import type { SkinModel } from './skin/layout';
import { NEW_MODEL_KEY } from './canvas/constants';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

const browserStorage = (): Storage | null => { try { return localStorage; } catch { return null; } }; // 使えないブラウザでは null

// 覚えているモデル。何も無い・読めない・知らない値のときは Classic
export function readNewModel(storage: Reader | null = browserStorage()): SkinModel {
  try { return storage?.getItem(NEW_MODEL_KEY) === 'slim' ? 'slim' : 'classic'; } catch { return 'classic'; }
}

// モデルを覚える。保存できなくても、選んだこと自体は有効 (今回の起動の間だけ覚えている)
export function saveNewModel(model: SkinModel, storage: Writer | null = browserStorage()) {
  try { storage?.setItem(NEW_MODEL_KEY, model); } catch { /* 覚えられなくても、新規作成はできる */ }
}
