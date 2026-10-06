import { describe, it, expect } from 'vitest';
import { SKIN_UV, SKIN_UV_OVER } from './uv';
import type { PartUV } from './uv';

// 全パーツ・全面を「名前付きの長方形」の一覧にする
const facesOf = (table: Record<string, PartUV>, layer: string) =>
  Object.entries(table).flatMap(([part, uv]) =>
    Object.entries(uv).map(([face, rect]) => ({ name: `${layer}.${part}.${face}`, ...rect })));

const ALL_FACES = [...facesOf(SKIN_UV, 'base'), ...facesOf(SKIN_UV_OVER, 'over')];

describe('UVマッピング定義', () => {
  it('すべての面が64×64の中に収まっている', () => {
    const outside = ALL_FACES.filter(f => f.u < 0 || f.v < 0 || f.u + f.w > 64 || f.v + f.h > 64);
    expect(outside.map(f => f.name)).toEqual([]);
  });

  it('どの2つの面も重なっていない', () => {
    const owner = new Map<number, string>();
    const overlaps: string[] = [];
    for (const f of ALL_FACES) {
      for (let y = f.v; y < f.v + f.h; y++) {
        for (let x = f.u; x < f.u + f.w; x++) {
          const prev = owner.get(y * 64 + x);
          if (prev) overlaps.push(`(${x},${y}): ${prev} と ${f.name}`);
          owner.set(y * 64 + x, f.name);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  // 箱の 幅W・高さH・奥行きD とすると、前後は W×H、左右は D×H、上下は W×D になるはず
  it('各パーツの面の大きさが、箱の形として矛盾しない', () => {
    for (const [layer, table] of [['base', SKIN_UV], ['over', SKIN_UV_OVER]] as const) {
      for (const [part, uv] of Object.entries(table)) {
        const W = uv.front.w, H = uv.front.h, D = uv.right.w;
        const name = `${layer}.${part}`;
        expect({ w: uv.back.w, h: uv.back.h }, `${name}.back`).toEqual({ w: W, h: H });
        expect({ w: uv.right.w, h: uv.right.h }, `${name}.right`).toEqual({ w: D, h: H });
        expect({ w: uv.left.w, h: uv.left.h }, `${name}.left`).toEqual({ w: D, h: H });
        expect({ w: uv.top.w, h: uv.top.h }, `${name}.top`).toEqual({ w: W, h: D });
        expect({ w: uv.bottom.w, h: uv.bottom.h }, `${name}.bottom`).toEqual({ w: W, h: D });
      }
    }
  });

  it('上着の層は、素の層と同じパーツ・同じ大きさの面を持つ', () => {
    expect(Object.keys(SKIN_UV_OVER).sort()).toEqual(Object.keys(SKIN_UV).sort());
    for (const [part, uv] of Object.entries(SKIN_UV)) {
      for (const [face, rect] of Object.entries(uv)) {
        const over = SKIN_UV_OVER[part][face as keyof PartUV];
        expect({ w: over.w, h: over.h }, `${part}.${face}`).toEqual({ w: rect.w, h: rect.h });
      }
    }
  });
});
