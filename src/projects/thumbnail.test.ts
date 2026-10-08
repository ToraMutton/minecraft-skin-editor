import { describe, it, expect } from 'vitest';
import { frontThumbnail, THUMB_WIDTH, THUMB_HEIGHT } from './thumbnail';
import { createProject } from './project';
import { SKIN_UV, SKIN_UV_OVER } from '../editor/skin/uv';
import { getLayout } from '../editor/skin/layout';

const CLASSIC = getLayout('classic');

const px = (t: Uint8ClampedArray, x: number, y: number) => [...t.slice((y * THUMB_WIDTH + x) * 4, (y * THUMB_WIDTH + x) * 4 + 4)];
const setPixel = (data: Uint8ClampedArray, x: number, y: number, rgba: number[]) => data.set(rgba, (y * 64 + x) * 4);

describe('frontThumbnail (一覧用の小さな正面の絵)', () => {
  it('16×32 の RGBA', () => {
    expect(frontThumbnail(createProject().layers, CLASSIC)).toHaveLength(THUMB_WIDTH * THUMB_HEIGHT * 4);
  });

  it('素体なら、頭・胴・腕・脚が人の形に並ぶ (すき間は透明)', () => {
    const t = frontThumbnail(createProject().layers, CLASSIC);
    expect(px(t, 8, 4)[3]).toBe(255); // 頭の真ん中
    expect(px(t, 8, 14)[3]).toBe(255); // 胴の真ん中
    expect(px(t, 1, 14)[3]).toBe(255); // 右腕 (画面の左)
    expect(px(t, 14, 14)[3]).toBe(255); // 左腕 (画面の右)
    expect(px(t, 5, 26)[3]).toBe(255); // 右脚
    expect(px(t, 10, 26)[3]).toBe(255); // 左脚
    expect(px(t, 0, 0)[3]).toBe(0); // 頭の左上の外
    expect(px(t, 1, 28)[3]).toBe(0); // 脚の外側
  });

  it('頭の正面の目の位置が、サムネイルの目の位置に来る', () => {
    const t = frontThumbnail(createProject().layers, CLASSIC);
    const eye = SKIN_UV.head.front; // 目は正面の (2,4) → サムネイルでは頭の位置(4,0)から (2,4) = (6,4)
    expect(px(t, 4 + 2, 4)).toEqual([47, 95, 208, 255]);
    expect(eye.w).toBe(8);
  });

  it('上着の層は素の層の上に重なる', () => {
    const p = createProject({ start: 'blank' });
    const head = SKIN_UV.head.front, headOver = SKIN_UV_OVER.head.front;
    setPixel(p.layers.base, head.u + 3, head.v + 3, [10, 20, 30, 255]);
    setPixel(p.layers.base, head.u + 4, head.v + 3, [10, 20, 30, 255]);
    setPixel(p.layers.paint, headOver.u + 3, headOver.v + 3, [200, 0, 0, 255]); // 上着だけ、片方のピクセルに重ねる
    const t = frontThumbnail(p.layers, CLASSIC);
    expect(px(t, 4 + 3, 3)).toEqual([200, 0, 0, 255]); // 上着が見える
    expect(px(t, 4 + 4, 3)).toEqual([10, 20, 30, 255]); // 上着が無い所は素の層
  });

  it('消去マスクで透明にした所は、透明に見える', () => {
    const p = createProject();
    const head = SKIN_UV.head.front;
    p.layers.erased[(head.v + 4) * 64 + head.u + 2] = 1;
    expect(px(frontThumbnail(p.layers, CLASSIC), 4 + 2, 4)[3]).toBe(0);
  });

  it('半透明の上着は、下の色と混ざる', () => {
    const p = createProject({ start: 'blank' });
    const head = SKIN_UV.head.front, headOver = SKIN_UV_OVER.head.front;
    setPixel(p.layers.base, head.u, head.v, [0, 0, 255, 255]);
    setPixel(p.layers.paint, headOver.u, headOver.v, [255, 0, 0, 128]);
    const [r, , b, a] = px(frontThumbnail(p.layers, CLASSIC), 4, 0);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(100); expect(r).toBeLessThan(160);
    expect(b).toBeGreaterThan(100); expect(b).toBeLessThan(160);
  });
});

describe('frontThumbnail (Slim)', () => {
  const SLIM = getLayout('slim');
  const slim = () => frontThumbnail(createProject({ model: 'slim' }).layers, SLIM);

  it('腕が幅3になり、胴体(x=4〜11)の横にぴったり付く', () => {
    const t = slim();
    expect(px(t, 0, 14)[3]).toBe(0); // 右腕の外 (Classic ならここも腕)
    expect(px(t, 1, 14)[3]).toBe(255); // 右腕の左端
    expect(px(t, 3, 14)[3]).toBe(255); // 右腕の右端 → すぐ隣が胴体
    expect(px(t, 4, 14)[3]).toBe(255); // 胴体の左端
    expect(px(t, 12, 14)[3]).toBe(255); // 左腕の左端
    expect(px(t, 14, 14)[3]).toBe(255); // 左腕の右端
    expect(px(t, 15, 14)[3]).toBe(0); // 左腕の外 (Classic ならここも腕)
  });

  it('頭・胴・脚は Classic と同じ位置 (腕以外の画素は変わらない)', () => {
    const slimThumb = slim();
    const classicThumb = frontThumbnail(createProject().layers, CLASSIC);
    for (let y = 0; y < THUMB_HEIGHT; y++) {
      for (let x = 4; x < 12; x++) expect(px(slimThumb, x, y), `(${x},${y})`).toEqual(px(classicThumb, x, y));
    }
  });

  it('Slim の腕の絵は、Slim の展開図の位置から読む (Classic の読み方だと別の場所になる)', () => {
    const p = createProject({ model: 'slim', start: 'blank' });
    const front = SLIM.uv.rightArm.front;
    setPixel(p.layers.paint, front.u, front.v + 5, [255, 0, 0, 255]); // 右腕の正面の、左端の列・上から5行目
    expect(px(frontThumbnail(p.layers, SLIM), 1, 8 + 5)).toEqual([255, 0, 0, 255]);
  });
});
