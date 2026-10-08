// 生成の記録: Quick Design で作った絵を、あとから作り直せるように残す情報
import type { Pixels } from '../editor/canvas/layers';
import type { SkinLayout } from '../editor/skin/layout';
import { renderSkin } from './render';
import { parseAnswers, specFromAnswers, RENDERER_VERSION } from './spec';
import type { SpecAnswers } from './spec';

// Quick Design で作った作品の、生成の記録。「もう一度作る」「条件を変える」のために残す
// (絵そのものは layers.base に入っている。これは、どう作ったかの記録で、無くても作品は使える)
export interface Generation {
  answers: SpecAnswers; // 質問への答え (省略 = おまかせ)
  seed: number; // 今の絵を作った乱数の種
  rendererVersion: number; // そのときの描き方のバージョン
}

// 保存されていた生成の記録を、使える形にする。壊れていれば undefined (記録が無い作品として扱う。作品は読み込める)
export function parseGeneration(value: unknown): Generation | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const { seed, rendererVersion } = v;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return undefined;
  if (typeof rendererVersion !== 'number' || !Number.isInteger(rendererVersion) || rendererVersion < 1 || rendererVersion > RENDERER_VERSION) return undefined;
  return { answers: parseAnswers(v.answers), seed, rendererVersion };
}

// 答えと seed から、スキンの画素と、その記録を作る
export function designSkin(answers: SpecAnswers, seed: number, layout: SkinLayout): { pixels: Pixels; generation: Generation } {
  const clean = parseAnswers(answers); // 壊れた答えは捨てる (保存してあった答えや、外からの入力でも、安全に作れるように)
  const spec = specFromAnswers(clean, seed);
  return { pixels: renderSkin(spec, layout), generation: { answers: clean, seed: spec.seed, rendererVersion: RENDERER_VERSION } };
}

// 新しい seed (「別の案」「もう一度作る」)
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}
