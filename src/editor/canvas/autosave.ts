// 自動保存されたスキンの読み込み (V1 からの移行も兼ねる)
//
// V1 も今も、localStorage に「見た目(合成結果)の PNG データURL」を保存している。
// 起動時にそれを読み込み、下地(base)にする。
// 読み込みに失敗しても起動は止めない。読めなかったデータは消さずに退避しておく (作品を失わないため)
import { SKIN_SIZE } from './layers';
import type { Pixels } from './layers';

export interface DecodedImage {
  width: number;
  height: number;
  pixels: Pixels;
}

// データURL → 画像の中身。ブラウザでは image.ts の decodeImage、テストでは偽物を渡す
export type ImageDecoder = (url: string) => Promise<DecodedImage>;

export type LoadResult =
  | { status: 'empty' } // 保存データが無い (初回起動など)
  | { status: 'loaded'; pixels: Pixels }
  | { status: 'unreadable'; reason: string }; // 保存データはあるが読めなかった

export async function loadAutosave(saved: string | null, decode: ImageDecoder): Promise<LoadResult> {
  if (!saved) return { status: 'empty' };
  if (!saved.startsWith('data:image/')) return { status: 'unreadable', reason: '画像のデータではありません' };

  let image: DecodedImage;
  try {
    image = await decode(saved);
  } catch {
    return { status: 'unreadable', reason: '画像として読み込めませんでした' };
  }

  // 引き伸ばすと位置がずれて壊れた絵になるので、64×64 以外は使わない
  if (image.width !== SKIN_SIZE || image.height !== SKIN_SIZE) {
    return { status: 'unreadable', reason: `大きさが64×64ではありません (${image.width}×${image.height})` };
  }
  return { status: 'loaded', pixels: image.pixels };
}
