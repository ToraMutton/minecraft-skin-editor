import { describe, it, expect } from 'vitest';
import { hoverTarget, hoverTargetInMode } from './hoverHighlight';
import { brushPixels } from '../canvas/operations';
import { faceAt } from '../skin/faces';

describe('hoverTarget', () => {
  it('マウスの下の面を返す', () => {
    expect(hoverTarget([10, 10], { tool: 'pen', size: 1, mirror: false })?.face).toEqual(faceAt(10, 10));
  });

  it('ペンの太さ1・ミラーなしなら、マウスの下の1ピクセルだけ', () => {
    expect(hoverTarget([10, 10], { tool: 'pen', size: 1, mirror: false })?.pixels).toEqual([[10, 10]]);
  });

  it('ペン・消しゴムは、実際に塗るときと同じ範囲 (太さとミラー込み)', () => {
    for (const tool of ['pen', 'eraser'] as const) {
      const target = hoverTarget([22, 24], { tool, size: 3, mirror: true });
      expect(target?.pixels).toEqual(brushPixels(22, 24, 3, true));
      expect(target!.pixels.length).toBeGreaterThan(9); // ミラー先の分も入っている
    }
  });

  it('バケツ・スポイトは、太さやミラーに関係なく押した1点だけ', () => {
    for (const tool of ['bucket', 'picker'] as const) {
      expect(hoverTarget([22, 24], { tool, size: 3, mirror: true })?.pixels).toEqual([[22, 24]]);
    }
  });

  it('どの面でもない場所では null', () => {
    expect(hoverTarget([0, 0], { tool: 'pen', size: 1, mirror: false })).toBeNull();
  });
});

describe('hoverTargetInMode', () => {
  const pen = { tool: 'pen', size: 1, mirror: false } as const;

  it('編集モードでは、マウスの下を強調する', () => {
    expect(hoverTargetInMode([10, 10], 'edit', pen)).toEqual(hoverTarget([10, 10], pen));
  });

  it('アニメーションモードでは、モデルの上でも何も出さない (塗れないので)', () => {
    expect(hoverTargetInMode([10, 10], 'pose', pen)).toBeNull();
  });

  it('モデルの外(texel が null)では何も出さない', () => {
    expect(hoverTargetInMode(null, 'edit', pen)).toBeNull();
  });
});
