import { describe, it, expect } from 'vitest';
import { PaintBuffer, PARTS, paint } from './buffer';
import { getLayout } from '../editor/skin/layout';

describe.each(['classic', 'slim'] as const)('PaintBuffer (%s)', model => {
  const layout = getLayout(model);
  const mat = paint('skin');

  it('側面4枚は、同じ高さに隙間なく横に並んでいる (帯として扱える)', () => {
    for (const table of [layout.uv, layout.uvOver]) {
      for (const part of PARTS) {
        const { right, front, left, back } = table[part];
        expect(front.u, part).toBe(right.u + right.w);
        expect(left.u, part).toBe(front.u + front.w);
        expect(back.u, part).toBe(left.u + left.w);
        for (const f of [front, left, back]) expect(f.v, part).toBe(right.v);
      }
    }
  });

  it('帯の幅・正面の位置は、展開図どおり (腕の幅は モデルで違う)', () => {
    const b = new PaintBuffer(layout);
    expect(b.band('head', 'base')).toMatchObject({ width: 32, height: 8, frontStart: 8, frontWidth: 8, backStart: 24 });
    expect(b.band('body', 'base')).toMatchObject({ width: 24, height: 12, frontStart: 4, frontWidth: 8, backStart: 16 });
    const armFront = model === 'slim' ? 3 : 4;
    expect(b.band('rightArm', 'base')).toMatchObject({ width: 8 + 2 * armFront, frontWidth: armFront });
    expect(b.band('leftLeg', 'over')).toMatchObject({ width: 16, height: 12 });
  });

  it('mirror は折り返しで、2回で元に戻り、正面の端どうしが入れ替わる', () => {
    const b = new PaintBuffer(layout);
    for (const part of PARTS) {
      const band = b.band(part, 'base');
      for (let c = 0; c < band.width; c++) expect(band.mirror(band.mirror(c)), `${part}:${c}`).toBe(c);
      expect(band.mirror(band.frontStart)).toBe(band.frontStart + band.frontWidth - 1);
      expect(band.mirror(0)).toBe(band.leftStart + band.rightWidth - 1); // 右側面の後ろ端 ↔ 左側面の後ろ端
    }
  });

  it('帯に塗ると、展開図の正しい面のピクセルに入る。列は巻き戻り、行が外なら無視される', () => {
    const b = new PaintBuffer(layout);
    const band = b.band('head', 'base');
    band.set(8 + 3, 4, mat); // 正面の左から3列目・上から4行目
    expect(b.pixels[(8 + 4) * 64 + 8 + 3]).toBe(mat);
    band.set(32 + 1, 0, mat); // 巻き戻って 1 列目 (右側面)
    expect(b.pixels[(8 + 0) * 64 + 1]).toBe(mat);
    band.set(-1, 0, mat); // 後ろ側面の右端 (31)
    expect(b.pixels[8 * 64 + 31]).toBe(mat);
    const before = b.pixels.filter(Boolean).length;
    band.set(3, -1, mat); band.set(3, 8, mat);
    expect(b.pixels.filter(Boolean).length).toBe(before);
  });

  it('面に塗る/読む/埋める。面の外は無視される', () => {
    const b = new PaintBuffer(layout);
    const top = b.face('head', 'base', 'top');
    expect([top.w, top.h]).toEqual([8, 8]);
    top.fill(mat);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(top.get(x, y)).toBe(mat);
    expect(top.get(8, 0)).toBeNull();
    top.set(-1, 0, mat); top.set(0, 8, mat);
    expect(b.pixels.filter(Boolean)).toHaveLength(64);
  });

  it('展開図の全ピクセルに、パーツ・層・面・位置の情報がある (面の外には無い)', () => {
    const b = new PaintBuffer(layout);
    const count = (layer: string) => b.cells.filter(c => c?.layer === layer).length;
    expect(count('base')).toBe(count('over')); // 素の層と上着の層は、同じ大きさの面を持つ
    const head = b.cells[(8 + 3) * 64 + 8 + 2]!;
    expect(head).toMatchObject({ part: 'head', layer: 'base', face: 'front', x: 2, y: 3, w: 8, h: 8 });
    expect(b.cells[0]).toBeNull();
  });

  it('素の層のピクセルから、同じ場所の上着の層のピクセルが分かる (面の中の位置が同じ)', () => {
    const b = new PaintBuffer(layout);
    for (let i = 0; i < 4096; i++) {
      const cell = b.cells[i];
      if (!cell || cell.layer !== 'base') { expect(b.twin[i], String(i)).toBe(-1); continue; }
      const over = b.cells[b.twin[i]]!;
      expect(over, String(i)).toMatchObject({ part: cell.part, layer: 'over', face: cell.face, x: cell.x, y: cell.y });
    }
  });
});
