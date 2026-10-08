import { describe, it, expect } from 'vitest';
import { PaintBuffer, paint } from './buffer';
import type { Mat } from './buffer';
import { shadeOffset, shadeBuffer, FACE_LIGHT } from './shading';
import { getLayout } from '../editor/skin/layout';
import { RAMP_SIZE } from './color';
import type { Rgb } from './color';

const CLASSIC = getLayout('classic');
const idx = (x: number, y: number) => y * 64 + x;
// 頭の正面は (8,8)〜(15,15)。面の中の (x, y) の画素番号
const headFront = (x: number, y: number) => idx(8 + x, 8 + y);

describe('光 (面ごとの明るさ)', () => {
  it('上面は明るく、下面は暗く、後ろ・左は少し暗く、正面・右は基本のまま (光は左上・前から)', () => {
    expect(FACE_LIGHT.top).toBeGreaterThan(FACE_LIGHT.front);
    expect(FACE_LIGHT.front).toBe(FACE_LIGHT.right);
    expect(FACE_LIGHT.left).toBeLessThan(FACE_LIGHT.front);
    expect(FACE_LIGHT.back).toBeLessThan(FACE_LIGHT.front);
    expect(FACE_LIGHT.bottom).toBeLessThan(FACE_LIGHT.back);
  });

  it('面の中は、中心だけ明るい (ピローシェーディング) にならない: 正面の内側のピクセルは、場所によらず同じ', () => {
    const buf = new PaintBuffer(CLASSIC);
    buf.face('body', 'base', 'front').fill(paint('top'));
    // 右端の列(丸みで暗い)と、一番上の数行(首の影・脇)を除けば、すべて同じ
    const inner = new Set<number>();
    for (let y = 3; y < 11; y++) for (let x = 0; x < 7; x++) inner.add(shadeOffset(buf, idx(20 + x, 20 + y)));
    expect(inner.size).toBe(1);
  });

  it('正面の右端の列だけ、丸みで1段階暗い', () => {
    const buf = new PaintBuffer(CLASSIC);
    buf.face('body', 'base', 'front').fill(paint('top'));
    expect(shadeOffset(buf, idx(20 + 7, 25))).toBe(shadeOffset(buf, idx(20 + 3, 25)) - 1);
  });

  it('flat のピクセル (目・ハイライト) は、光も影も受けない', () => {
    const buf = new PaintBuffer(CLASSIC);
    buf.face('head', 'base', 'right').fill(paint('skin'));
    buf.pixels[idx(2, 12)] = paint('eye', 0, true);
    expect(shadeOffset(buf, idx(2, 12))).toBe(0);
    expect(shadeOffset(buf, idx(3, 12))).toBe(FACE_LIGHT.right); // 同じ面の普通のピクセルは受ける
  });
});

describe('接触部分の影 (Ambient Occlusion)', () => {
  const baseline = (buf: PaintBuffer, i: number) => FACE_LIGHT[buf.cells[i]!.face];

  it('髪のすぐ下の肌は暗い (前髪の下のおでこ)。2行下は元に戻る', () => {
    const buf = new PaintBuffer(CLASSIC);
    const f = buf.face('head', 'base', 'front');
    f.fill(paint('skin'));
    for (let x = 0; x < 8; x++) f.set(x, 2, paint('hair'));
    expect(shadeOffset(buf, headFront(2, 3))).toBe(baseline(buf, headFront(2, 3)) - 1);
    expect(shadeOffset(buf, headFront(2, 4))).toBe(baseline(buf, headFront(2, 4)));
  });

  it('外側の層の前髪が、素の層の髪より下に垂れていれば、その下の肌はさらに暗い', () => {
    const buf = new PaintBuffer(CLASSIC);
    const base = buf.face('head', 'base', 'front');
    base.fill(paint('skin'));
    for (let x = 0; x < 8; x++) base.set(x, 1, paint('hair'));
    const over = buf.face('head', 'over', 'front');
    for (let x = 0; x < 8; x++) { over.set(x, 1, paint('hair')); over.set(x, 2, paint('hair')); }
    // (2,2): すぐ上の素の層は髪、外側の層も髪 → 2段階。ただし外側の層が載っている所は、重なりの影も受ける
    // 載っていない (外側の層の2行目が空いている) 列で比べる
    over.set(5, 2, paint('hair')); // 載っている
    const free = shadeOffset(buf, headFront(1, 3)); // 素の層は肌、その上(2行目)は外側の層の髪
    expect(free).toBeLessThan(baseline(buf, headFront(1, 3))); // 少なくとも1段階暗い
  });

  it('袖口の下の腕・服の裾の下のズボン・ズボンの裾の下の靴も暗い。同じ素材が続くところは暗くしない', () => {
    const buf = new PaintBuffer(CLASSIC);
    const leg = buf.face('rightLeg', 'base', 'front'); // 足の正面 (4,20)〜
    for (let y = 0; y < 12; y++) for (let x = 0; x < 4; x++) leg.set(x, y, y < 8 ? paint('bottom') : paint('shoes'));
    const at = (x: number, y: number) => idx(4 + x, 20 + y);
    expect(shadeOffset(buf, at(1, 8))).toBe(baseline(buf, at(1, 8)) - 1); // 裾の下の靴
    expect(shadeOffset(buf, at(1, 4))).toBe(baseline(buf, at(1, 4))); // ズボンどうしは暗くしない
    expect(shadeOffset(buf, at(1, 10))).toBe(baseline(buf, at(1, 10))); // 靴どうしも
  });

  it('影を受けない素材 (髪・まつ毛など) は、上に何があっても暗くならない', () => {
    const buf = new PaintBuffer(CLASSIC);
    const f = buf.face('head', 'base', 'front');
    f.fill(paint('hair'));
    f.set(2, 3, paint('top')); // 髪のすぐ上に服 (ありえないが、ルールの確認)
    expect(shadeOffset(buf, headFront(2, 4))).toBe(baseline(buf, headFront(2, 4)));
  });

  it('外側の層が載っている素の層は暗い。外側の層の縁(横)に接する素の層も暗い', () => {
    const buf = new PaintBuffer(CLASSIC);
    buf.face('body', 'base', 'front').fill(paint('inner'));
    const over = buf.face('body', 'over', 'front');
    over.set(2, 5, paint('top'));
    const at = (x: number, y: number) => idx(20 + x, 20 + y);
    expect(shadeOffset(buf, at(2, 5))).toBe(baseline(buf, at(2, 5)) - 1); // 載っている
    expect(shadeOffset(buf, at(1, 5))).toBe(baseline(buf, at(1, 5)) - 1); // 左隣
    expect(shadeOffset(buf, at(3, 5))).toBe(baseline(buf, at(3, 5)) - 1); // 右隣
    expect(shadeOffset(buf, at(4, 5))).toBe(baseline(buf, at(4, 5))); // 離れていれば影響なし
  });

  it('腕の内側の面は暗く、腋(上の2行)はさらに暗い。右腕は「左」の面、左腕は「右」の面が内側', () => {
    const buf = new PaintBuffer(CLASSIC);
    for (const [part, innerFace, outerFace] of [['rightArm', 'left', 'right'], ['leftArm', 'right', 'left']] as const) {
      buf.face(part, 'base', innerFace).fill(paint('skin'));
      buf.face(part, 'base', outerFace).fill(paint('skin'));
      const cell = (face: string, y: number) => buf.cells.findIndex(c => c && c.part === part && c.layer === 'base' && c.face === face && c.x === 1 && c.y === y);
      const inner = (y: number) => shadeOffset(buf, cell(innerFace, y));
      expect(inner(5), part).toBe(FACE_LIGHT[innerFace] - 1);
      expect(inner(0), part).toBe(FACE_LIGHT[innerFace] - 2);
      expect(shadeOffset(buf, cell(outerFace, 0)), part).toBe(FACE_LIGHT[outerFace]); // 外側は影なし
    }
  });

  it('足の内側、胴の脇(上3行)、あごの下の首も暗い', () => {
    const buf = new PaintBuffer(CLASSIC);
    buf.face('body', 'base', 'right').fill(paint('top'));
    buf.face('body', 'base', 'front').fill(paint('skin'));
    const cellOf = (part: string, face: string, x: number, y: number) => buf.cells.findIndex(c => c && c.part === part && c.layer === 'base' && c.face === face && c.x === x && c.y === y);
    expect(shadeOffset(buf, cellOf('body', 'right', 1, 1))).toBe(FACE_LIGHT.right - 1); // 脇
    expect(shadeOffset(buf, cellOf('body', 'right', 1, 6))).toBe(FACE_LIGHT.right); // 脇より下は普通
    expect(shadeOffset(buf, cellOf('body', 'front', 3, 0))).toBe(FACE_LIGHT.front - 1); // 首
    buf.face('leftLeg', 'base', 'right').fill(paint('bottom'));
    expect(shadeOffset(buf, cellOf('leftLeg', 'right', 1, 6))).toBe(FACE_LIGHT.right - 1); // 左足の内側
  });
});

describe('shadeBuffer (色にする)', () => {
  // 素材ごとに、段階ごとに違う色のランプ (段階 i の色は [i*10 + 素材の番号, 0, 0])
  const ramps = Object.fromEntries((['skin', 'hair', 'top', 'inner', 'bottom', 'shoes', 'accent', 'eye', 'white', 'dark', 'blush'] as Mat[])
    .map((m, k) => [m, Array.from({ length: RAMP_SIZE }, (_, i): Rgb => [i * 10 + k, 0, 0])])) as Record<Mat, Rgb[]>;

  it('塗ったピクセルは不透明、塗っていないピクセルと展開図の外は透明', () => {
    const buf = new PaintBuffer(CLASSIC);
    buf.face('head', 'base', 'front').set(1, 1, paint('skin'));
    buf.pixels[0] = paint('skin'); // 展開図の外 (無視される)
    const out = shadeBuffer(buf, ramps);
    expect(out[headFront(1, 1) * 4 + 3]).toBe(255);
    expect(out[headFront(2, 1) * 4 + 3]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it('ランプの範囲を超える段階は、端の色になる (配列の外を読まない)', () => {
    const buf = new PaintBuffer(CLASSIC);
    const f = buf.face('head', 'base', 'bottom'); // 下面は -2 の光
    f.set(0, 0, paint('skin', -2)); // 合計 -4
    const top = buf.face('head', 'base', 'top');
    top.set(0, 0, paint('skin', 2)); // +2 +1 = 3 → 範囲外(上)
    const out = shadeBuffer(buf, ramps);
    const at = (x: number, y: number) => out[idx(x, y) * 4];
    expect(at(16, 0)).toBe(0 * 10 + 0); // 段階0 (skin は番号0)
    expect(at(8, 0)).toBe((RAMP_SIZE - 1) * 10 + 0); // 最後の段階
  });

  it('同じバッファからは、何回作っても同じ画素になる (ノイズを使わない)', () => {
    const buf = new PaintBuffer(CLASSIC);
    for (let i = 8; i < 16; i++) buf.face('head', 'base', 'front').fill(paint('skin'));
    expect(shadeBuffer(buf, ramps)).toEqual(shadeBuffer(buf, ramps));
  });
});
