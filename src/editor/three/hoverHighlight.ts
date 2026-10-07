// マウスの下の「今ここを描く」を見せるための、ホバー用のテクスチャ
// 展開図(64×64)と同じ並びの 512×512 の画像に描き、グリッドと同じ形のメッシュに貼る
// (なので、ミラー先のピクセルも自動で3Dモデルの正しい場所に出る)
import * as THREE from 'three';
import { brushPixels } from '../canvas/operations';
import type { Tool } from '../canvas/tools';
import { faceAt } from '../skin/faces';
import type { FaceRect } from '../skin/faces';
import type { ViewMode } from '../viewTypes';

// 今のブラシの設定 (どこが塗られるかの計算に使う)
export interface HoverBrush {
  tool: Tool;
  size: number;
  mirror: boolean;
}

// マウスの下の面と、押したら塗られる(読まれる)ピクセル
export interface HoverTarget {
  face: FaceRect;
  pixels: [number, number][];
}

// ピクセル(x, y)で今のツールを使ったら、どこに効くか (面の外なら null)
export function hoverTarget(texel: readonly [number, number], brush: HoverBrush): HoverTarget | null {
  const [x, y] = texel;
  const face = faceAt(x, y);
  if (!face) return null;
  // ペン・消しゴムは太さとミラーのぶん広がる。バケツ・スポイトは押した1点が起点
  const pixels = brush.tool === 'pen' || brush.tool === 'eraser' ? brushPixels(x, y, brush.size, brush.mirror) : [[x, y] as [number, number]];
  return { face, pixels };
}

// 今のモードで、マウスの下に何を強調するか (塗れないアニメーションモードと、モデルの外では何も出さない)
export function hoverTargetInMode(texel: readonly [number, number] | null, mode: ViewMode, brush: HoverBrush): HoverTarget | null {
  return mode === 'edit' && texel ? hoverTarget(texel, brush) : null;
}

const SIZE = 512;
const CELL = SIZE / 64; // テクスチャの1ピクセル = 8px

// 面のグリッドの色。いつものグリッド(素肌は水色・上着は白)と同じ色を、濃くしたもの
const FACE_GRID_COLOR = { base: 'rgba(129, 212, 250, 0.85)', over: 'rgba(255, 255, 255, 0.85)' };

// 面の中だけに、ピクセルごとの線と、少し太い外枠を描く
// (右端・下端の線は面の内側に引く。外側に引くと、展開図で隣にある別の面に線が出てしまう)
function drawFaceGrid(ctx: CanvasRenderingContext2D, face: FaceRect) {
  const x0 = face.u * CELL, y0 = face.v * CELL, w = face.w * CELL, h = face.h * CELL;
  ctx.fillStyle = FACE_GRID_COLOR[face.layer];
  for (let i = 1; i < face.w; i++) ctx.fillRect(x0 + i * CELL, y0, 1, h);
  for (let j = 1; j < face.h; j++) ctx.fillRect(x0, y0 + j * CELL, w, 1);
  ctx.fillRect(x0, y0, w, 2); ctx.fillRect(x0, y0 + h - 2, w, 2);
  ctx.fillRect(x0, y0, 2, h); ctx.fillRect(x0 + w - 2, y0, 2, h);
}

// 塗られるピクセルの印: 白く明るくして、暗い枠で囲む (明るい色・暗い色のどちらの上でも見えるように)
function drawPixelMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * CELL, py = y * CELL;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(px, py, CELL, CELL);
  ctx.fillStyle = 'rgba(30, 30, 31, 0.85)';
  ctx.fillRect(px, py, CELL, 1); ctx.fillRect(px, py + CELL - 1, CELL, 1);
  ctx.fillRect(px, py, 1, CELL); ctx.fillRect(px + CELL - 1, py, 1, CELL);
}

export interface HoverLayer {
  texture: THREE.CanvasTexture;
  // 表示を target に合わせる。null なら何も出さない。showGuide が off なら、面のグリッドは出さずピクセルの印だけ
  draw: (target: HoverTarget | null, showGuide: boolean) => void;
  dispose: () => void;
}

export function createHoverLayer(): HoverLayer {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;

  // マウスが同じピクセルの中で動いている間は、描き直さない (GPUへの転送を減らす)
  let lastKey = '';
  const draw = (target: HoverTarget | null, showGuide: boolean) => {
    const key = target ? JSON.stringify([target.face, target.pixels, showGuide]) : '';
    if (!ctx || key === lastKey) return;
    lastKey = key;

    ctx.clearRect(0, 0, SIZE, SIZE);
    if (target) {
      if (showGuide) drawFaceGrid(ctx, target.face);
      for (const [x, y] of target.pixels) drawPixelMark(ctx, x, y);
    }
    texture.needsUpdate = true;
  };

  return { texture, draw, dispose: () => texture.dispose() };
}
