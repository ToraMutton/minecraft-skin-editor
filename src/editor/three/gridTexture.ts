import * as THREE from 'three';

// 512x512の高解像度キャンバスに、ピクセル単位の網目を描画してテクスチャ化する関数
export function createGridTexture(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    // 64x64のマイクラテクスチャに合わせ、8ピクセルごとに線を引く(512/64 = 8)
    for (let i = 0; i <= 64; i++) {
      const pos = i * 8;
      // 線が細すぎて消えないように2px幅で描画
      ctx.fillRect(pos, 0, 1, 512); // 縦線
      ctx.fillRect(0, pos, 512, 1); // 横線
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter; // ズームアウトした時に線が消えないようにLinear
  return tex;
}
