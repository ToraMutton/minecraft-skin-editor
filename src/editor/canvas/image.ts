// 画像(<img> / <canvas>)と層のデータの変換。ブラウザのcanvasが必要な処理はここに集める
import { SKIN_SIZE, composite } from './layers';
import type { SkinLayers, Pixels } from './layers';
import type { DecodedImage } from './autosave';

// 読み込んだ画像を、64×64のRGBA配列にする
export function imageToPixels(img: HTMLImageElement): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_SIZE;
  canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, SKIN_SIZE, SKIN_SIZE);
  return ctx.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data;
}

// 読み込んだスキン画像の画素を、そのままの大きさで読む (64×64 または 旧形式の 64×32。引き伸ばさない)
export function imageToRawPixels(img: HTMLImageElement): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

// データURL(など)の画像を読み込み、大きさと中身を返す。読めなければ失敗(reject)する
export function decodeImage(url: string): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, pixels: imageToPixels(img) });
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}

// 3つの層を重ねた見た目を canvas に描く (3D表示のテクスチャ・PNG書き出しはこの canvas を使う)
export function renderToCanvas(canvas: HTMLCanvasElement, layers: SkinLayers) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(new ImageData(composite(layers), SKIN_SIZE, SKIN_SIZE), 0, 0);
}
