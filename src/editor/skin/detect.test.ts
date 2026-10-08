import { describe, it, expect } from 'vitest';
import { detectModel, SLIM_UNUSED_PIXELS } from './detect';
import { getLayout } from './layout';
import { createStarterPixels } from './starter';
import { createLayers, composite } from '../canvas/layers';
import type { Pixels } from '../canvas/layers';
import { convertLayers } from './convert';

const CLASSIC = getLayout('classic');
const SLIM = getLayout('slim');
const set = (p: Pixels, [x, y]: readonly [number, number], rgba: number[]) => p.set(rgba, (y * 64 + x) * 4);
const blank = (): Pixels => new Uint8ClampedArray(64 * 64 * 4);

describe('判定に使う場所 (Slim の腕が使わない場所)', () => {
  it('skinview3d と同じ4か所: (50,16) 2×4 / (54,20) 2×12 / (42,48) 2×4 / (46,52) 2×12', () => {
    const expected: [number, number][] = [];
    for (const [x0, y0, w, h] of [[50, 16, 2, 4], [54, 20, 2, 12], [42, 48, 2, 4], [46, 52, 2, 12]]) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) expected.push([x, y]);
    }
    const key = (a: [number, number][]) => a.map(([x, y]) => y * 64 + x).sort((a, b) => a - b);
    expect(key(SLIM_UNUSED_PIXELS)).toEqual(key(expected));
  });
});

describe('detectModel', () => {
  it('素体 (Classic / Slim) は、それぞれのモデルと判定される', () => {
    expect(detectModel(createStarterPixels(CLASSIC))).toBe('classic');
    expect(detectModel(createStarterPixels(SLIM))).toBe('slim');
  });

  it('Classic の素体を Slim に変換した絵は、Slim と判定される (変換と判定が噛み合っている)', () => {
    const converted = convertLayers(createLayers(createStarterPixels(CLASSIC)), CLASSIC, SLIM);
    expect(detectModel(composite(converted))).toBe('slim');
  });

  it('使わない場所が全部透明で、腕に絵があれば Slim', () => {
    const p = createStarterPixels(CLASSIC);
    for (const px of SLIM_UNUSED_PIXELS) set(p, px, [0, 0, 0, 0]);
    expect(detectModel(p)).toBe('slim');
  });

  it('使わない場所の一部だけが透明なら Classic (Classic の腕の一部を消した絵を、Slim と間違えない)', () => {
    const p = createStarterPixels(CLASSIC);
    set(p, SLIM_UNUSED_PIXELS[0], [0, 0, 0, 0]);
    expect(detectModel(p)).toBe('classic');
  });

  it('半透明の画素が1つでもあれば Classic', () => {
    const p = createStarterPixels(CLASSIC);
    set(p, SLIM_UNUSED_PIXELS[5], [10, 20, 30, 128]);
    expect(detectModel(p)).toBe('classic');
  });

  it('使わない場所が全部透明でも、腕に絵が無ければ判断できない (null)。完全に透明な画像も null', () => {
    expect(detectModel(blank())).toBeNull();
    const p = blank();
    set(p, [10, 10], [1, 2, 3, 255]); // 頭にだけ絵がある
    expect(detectModel(p)).toBeNull();
  });

  it('使わない場所が全部黒・全部白に塗りつぶされていて、腕に別の色があれば Slim (昔のツールの形式)', () => {
    for (const fill of [[0, 0, 0, 255], [255, 255, 255, 255]]) {
      const p = createStarterPixels(SLIM);
      for (const px of SLIM_UNUSED_PIXELS) set(p, px, fill);
      expect(detectModel(p), String(fill)).toBe('slim');
    }
  });

  it('腕が全部黒(白)の Classic は、塗りつぶしと区別できないので判断しない (null)', () => {
    const p = createStarterPixels(CLASSIC);
    for (const arm of ['rightArm', 'leftArm']) {
      for (const f of Object.values(CLASSIC.uv[arm])) {
        for (let y = f.v; y < f.v + f.h; y++) for (let x = f.u; x < f.u + f.w; x++) set(p, [x, y], [0, 0, 0, 255]);
      }
    }
    expect(detectModel(p)).toBeNull();
  });

  it('使わない場所が不透明で、塗りつぶしでもなければ Classic', () => {
    const p = createStarterPixels(CLASSIC);
    for (const px of SLIM_UNUSED_PIXELS) set(p, px, [0, 0, 0, 255]);
    set(p, SLIM_UNUSED_PIXELS[3], [9, 9, 9, 255]); // 1つだけ違う色
    expect(detectModel(p)).toBe('classic');
  });
});
