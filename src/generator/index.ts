// スキン生成エンジン (Quick Design の中身)。画面に依存しない純粋なコード
export { renderSkin, generateSkin, makeRamps } from './render';
export { randomSpec, specFromAnswers, parseSpec, parseAnswers, countAnswered, ANSWER_COUNT, RENDERER_VERSION, MOODS, HAIR_STYLES, EYE_STYLES, TOPS, BOTTOMS, ACCESSORIES, normalizeAccessories } from './spec';
export type { SpecAnswers, Accessory, SkinSpec, SkinPalette, Mood, HairStyle, EyeStyle, TopStyle, BottomStyle } from './spec';
export { designSkin, randomSeed, parseGeneration } from './generation';
export type { Generation } from './generation';
