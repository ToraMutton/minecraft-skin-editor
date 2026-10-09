// 設定 (SkinSpec) から 64×64 のスキン画像を作る
// 同じ設定と seed、同じ描き方のバージョンなら、必ず同じ画素になる
import type { Pixels } from '../editor/canvas/layers';
import type { SkinLayout } from '../editor/skin/layout';
import { PaintBuffer, MATS } from './buffer';
import type { Mat } from './buffer';
import { makeRamp } from './color';
import type { Rgb } from './color';
import { createRng } from './prng';
import { RENDERER_VERSION, randomSpec } from './spec';
import type { SkinSpec } from './spec';
import { shadeBuffer } from './shading';
import { paintBody } from './painters/body';
import { paintBottom } from './painters/bottom';
import { paintTop } from './painters/top';
import { paintFace } from './painters/face';
import { paintHair } from './painters/hair';
import { paintAccessories } from './painters/accessories';

// 素材ごとのランプ (暗い → 明るい の5色)
export function makeRamps(spec: SkinSpec): Record<Mat, Rgb[]> {
  const p = spec.palette;
  const base = {
    skin: p.skin, hair: p.hair, top: p.primary, inner: p.inner, bottom: p.secondary, shoes: p.shoes, accent: p.accent, accessory: p.accessory, eye: p.eye,
    white: { l: 0.95, c: 0.008, h: p.skin.h }, // 白目: 真っ白でなく、肌となじむオフホワイト
    dark: { l: 0.3, c: 0.035, h: 290 }, // まつ毛: 真っ黒でなく、青紫がかった濃い色
    blush: { l: 0.74, c: 0.09, h: 15 }, // ほっぺ・唇
  };
  return Object.fromEntries(MATS.map(mat => [mat, makeRamp(base[mat])])) as Record<Mat, Rgb[]>;
}

// 素材と段階だけを塗ったバッファを作る (色と陰影は、まだ付けない)
export function buildBuffer(spec: SkinSpec, layout: SkinLayout): PaintBuffer {
  if (spec.rendererVersion !== RENDERER_VERSION) throw new Error(`描き方のバージョンが違います (設定: ${spec.rendererVersion}, 現在: ${RENDERER_VERSION})`);
  const buf = new PaintBuffer(layout);
  // 塗る順番: 体 → ズボン・靴 → 上着 → 顔 → 髪 → アクセサリー (下から上へ重ねる)。処理ごとに専用の乱数の流れを使う
  const ctx = (stream: string) => ({ buf, spec, rng: createRng(spec.seed, stream) });
  paintBody(ctx('body'));
  paintBottom(ctx('bottom'));
  paintTop(ctx('top'));
  paintFace(ctx('face'));
  paintHair(ctx('hair'));
  paintAccessories(ctx('accessories'));
  return buf;
}

export function renderSkin(spec: SkinSpec, layout: SkinLayout): Pixels {
  return shadeBuffer(buildBuffer(spec, layout), makeRamps(spec));
}

// seed だけから (全問おまかせ)、スキンを作る
export function generateSkin(seed: number, layout: SkinLayout): { spec: SkinSpec; pixels: Pixels } {
  const spec = randomSpec(seed);
  return { spec, pixels: renderSkin(spec, layout) };
}
