import { describe, it, expect } from 'vitest';
import { getMirrorCoord } from './mirror';
import { getLayout } from './layout';

const MODELS = ['classic', 'slim'] as const;

// 左右反転したときの対応 (右腕 ↔ 左腕、右側面 ↔ 左側面。頭・胴・正面などはそのまま)
const MIRROR_PART: Record<string, string> = {
  head: 'head', body: 'body', rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg',
};
const MIRROR_FACE: Record<string, string> = {
  front: 'front', back: 'back', top: 'top', bottom: 'bottom', right: 'left', left: 'right',
};

describe.each(MODELS)('ミラー描画の対応表 (%s)', model => {
  const layout = getLayout(model);
  // 各ピクセルが「どの層の・どのパーツの・どの面」かの表
  type Where = { layer: string; part: string; face: string };
  const WHERE = new Map<number, Where>();
  for (const [layer, table] of [['base', layout.uv], ['over', layout.uvOver]] as const) {
    for (const [part, uv] of Object.entries(table)) {
      for (const [face, r] of Object.entries(uv)) {
        for (let y = r.v; y < r.v + r.h; y++) {
          for (let x = r.u; x < r.u + r.w; x++) WHERE.set(y * 64 + x, { layer, part, face });
        }
      }
    }
  }
  const whereIs = (x: number, y: number) => WHERE.get(y * 64 + x);

  it('ミラー先のミラー先は、元の位置に戻る', () => {
    const broken: string[] = [];
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const m = getMirrorCoord(layout, x, y);
        if (!m) continue;
        const back = getMirrorCoord(layout, m[0], m[1]);
        if (!back || back[0] !== x || back[1] !== y) broken.push(`(${x},${y}) → (${m}) → (${back})`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('スキンとして使われている全ピクセルに、ミラー先がある', () => {
    const missing = [...WHERE.keys()]
      .map(i => [i % 64, Math.floor(i / 64)] as const)
      .filter(([x, y]) => !getMirrorCoord(layout, x, y))
      .map(([x, y]) => `(${x},${y})`);
    expect(missing).toEqual([]);
  });

  it('ミラー先は「同じ層の、左右反対のパーツの、左右反対の面」になる', () => {
    const wrong: string[] = [];
    for (const i of WHERE.keys()) {
      const [x, y] = [i % 64, Math.floor(i / 64)];
      const m = getMirrorCoord(layout, x, y);
      if (!m) continue;
      const from = whereIs(x, y)!;
      const to = whereIs(m[0], m[1]);
      const expected = { layer: from.layer, part: MIRROR_PART[from.part], face: MIRROR_FACE[from.face] };
      if (!to || to.layer !== expected.layer || to.part !== expected.part || to.face !== expected.face) {
        wrong.push(`(${x},${y}) ${from.layer}.${from.part}.${from.face} → ${to ? `${to.layer}.${to.part}.${to.face}` : 'どこでもない'}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
