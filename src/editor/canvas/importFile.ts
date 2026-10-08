// PNGファイルの読み込み (「読込」と「新規 → PNGから」で共通)
import { SKIN_SIZE } from './layers';
import type { Pixels } from './layers';
import { imageToRawPixels } from './image';
import { detectModel } from '../skin/detect';
import { legacyToSkin64, LEGACY_HEIGHT } from '../skin/legacy';
import type { SkinModel } from '../skin/layout';
import { normalizeName } from '../../projects/actions';

// 画像の大きさ・種類が、スキンとして使えるかの判定 (ブラウザに依存しない純粋な関数)
// 使えなければ、画面に出す日本語の理由を返す
export function validateSkinImage(mimeType: string, width: number, height: number): string | null {
  if (mimeType !== 'image/png') return 'PNG画像を選んでください';
  // 引き伸ばすと位置がずれて壊れた絵になるので、64×64 (と旧形式の 64×32) 以外は断る
  const ok = width === SKIN_SIZE && (height === SKIN_SIZE || height === LEGACY_HEIGHT);
  if (!ok) return `64×64のスキン画像を選んでください (選択した画像: ${width}×${height})`;
  return null;
}

// 読み込んだ画像の画素 (64×64 または 64×32) から、スキンの画素とモデルを作る
// モデルは画像の中身から推測する。旧形式は Classic。判断できなければ null (選択中のモデルに従う)
export function interpretSkin(width: number, height: number, rgba: Uint8ClampedArray): { pixels: Pixels; model: SkinModel | null } {
  if (width === SKIN_SIZE && height === LEGACY_HEIGHT) return { pixels: legacyToSkin64(rgba), model: 'classic' };
  const pixels: Pixels = new Uint8ClampedArray(rgba);
  return { pixels, model: detectModel(pixels) };
}

// ファイル名から、作品の名前を作る ("my skin.png" → "my skin")。使えない名前なら null
export function nameFromFileName(fileName: string): string | null {
  return normalizeName(fileName.replace(/\.[^.]*$/, ''));
}

// model: 画像から推測したモデル。判断できなければ null
export type ImportedSkin = { ok: true; pixels: Pixels; model: SkinModel | null; name: string | null } | { ok: false; message: string };

// ファイルを読み込んで、スキンの画素と名前を返す。失敗したら理由を返す (例外は投げない)
export function readSkinFile(file: File): Promise<ImportedSkin> {
  const early = validateSkinImage(file.type, SKIN_SIZE, SKIN_SIZE); // まず種類だけ確かめる (大きさは読んでから)
  if (early) return Promise.resolve({ ok: false, message: early });

  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const problem = validateSkinImage(file.type, img.naturalWidth, img.naturalHeight);
      resolve(problem ? { ok: false, message: problem } : { ok: true, ...interpretSkin(img.naturalWidth, img.naturalHeight, imageToRawPixels(img)), name: nameFromFileName(file.name) });
    };
    img.onerror = () => { // 壊れたファイルなどで、画像として読めなかった場合
      URL.revokeObjectURL(url);
      resolve({ ok: false, message: '画像を読み込めませんでした' });
    };
    img.src = url;
  });
}

// 書き出すPNGのファイル名。作品の名前から作る (ファイル名に使えない文字は _ に置き換える)
export function exportFileName(projectName: string): string {
  // ファイル名に使えない記号と、制御文字 (改行など。文字コード 0〜31) を _ に置き換える
  const safe = [...projectName]
    .map(ch => (/[\\/:*?"<>|]/.test(ch) || ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .replace(/^\.+/, '') // 先頭のドットは隠しファイルになるので除く
    .trim();
  return `${safe === '' ? 'skin' : safe}.png`;
}
