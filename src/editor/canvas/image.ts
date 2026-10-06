// 画像(<img> / <canvas>)と層のデータの変換。ブラウザのcanvasが必要な処理はここに集める
import { SKIN_SIZE, composite } from './layers';
import type { SkinLayers, Pixels } from './layers';

// 読み込んだ画像を、64×64のRGBA配列にする
export function imageToPixels(img: HTMLImageElement): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_SIZE;
  canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, SKIN_SIZE, SKIN_SIZE);
  return ctx.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data;
}

// 3つの層を重ねた見た目を canvas に描く (3D表示のテクスチャ・PNG書き出しはこの canvas を使う)
export function renderToCanvas(canvas: HTMLCanvasElement, layers: SkinLayers) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(new ImageData(composite(layers), SKIN_SIZE, SKIN_SIZE), 0, 0);
}
