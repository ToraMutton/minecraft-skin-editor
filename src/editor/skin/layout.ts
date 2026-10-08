// スキンの「形式」: モデル(Classic / Slim)ごとに決まる、展開図・ミラー対応表・面の番号表のセット
// モデルによって変わる計算(どの面か・ミラー先はどこか・どこに貼るか)は、この SkinLayout を引数で受け取る。
// 「今のモデル」をグローバルに持たないので、渡し忘れは型エラーになり、テストでもモデルを指定できる
import { SKIN_UV, SKIN_UV_OVER } from './uv';
import type { PartUV } from './uv';
import { FACE_MAPPINGS } from './mirror';
import type { FaceMapping } from './mirror';
import { buildFaceTable } from './faces';
import type { FaceTable } from './faces';

// classic = 腕4px (Steve) / slim = 腕3px (Alex)
export type SkinModel = 'classic' | 'slim';

export interface SkinLayout extends FaceTable {
  model: SkinModel;
  uv: Record<string, PartUV>; // 素の層の展開図
  uvOver: Record<string, PartUV>; // 上着の層の展開図
  mirror: FaceMapping[]; // ミラー描画の対応表
}

const cache = new Map<SkinModel, SkinLayout>();

// モデルの形式を返す (作るのは最初の1回だけ)
export function getLayout(model: SkinModel): SkinLayout {
  let layout = cache.get(model);
  if (!layout) {
    layout = buildLayout(model);
    cache.set(model, layout);
  }
  return layout;
}

function buildLayout(model: SkinModel): SkinLayout {
  if (model === 'slim') throw new Error('Slimモデルの形式は、まだありません');
  return { model, uv: SKIN_UV, uvOver: SKIN_UV_OVER, mirror: FACE_MAPPINGS, ...buildFaceTable(SKIN_UV, SKIN_UV_OVER) };
}
