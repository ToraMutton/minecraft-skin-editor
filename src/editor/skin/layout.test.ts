import { describe, it, expect } from 'vitest';
import { getLayout } from './layout';
import { SKIN_UV, SKIN_UV_OVER } from './uv';
import { FACE_MAPPINGS } from './mirror';

describe('getLayout', () => {
  it('Classic は、これまでの展開図とミラー対応表そのもの (2-5a は見た目も動きも変えない)', () => {
    const layout = getLayout('classic');
    expect(layout.model).toBe('classic');
    expect(layout.uv).toBe(SKIN_UV);
    expect(layout.uvOver).toBe(SKIN_UV_OVER);
    expect(layout.mirror).toBe(FACE_MAPPINGS);
  });

  it('面は 素の層36 + 上着の層36 = 72 面で、番号表と面の一覧が対応している', () => {
    const { faceRects, faceIndex } = getLayout('classic');
    expect(faceRects).toHaveLength(72);
    expect(faceRects.filter(f => f.layer === 'base')).toHaveLength(36);
    expect(Math.max(...faceIndex)).toBe(71);
  });

  it('同じモデルなら、同じものを返す (毎回作り直さない)', () => {
    expect(getLayout('classic')).toBe(getLayout('classic'));
  });
});
