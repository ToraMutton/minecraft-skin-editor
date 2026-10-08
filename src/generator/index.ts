// スキン生成エンジン (Quick Design の中身)。画面に依存しない純粋なコード
export { renderSkin, generateSkin, makeRamps } from './render';
export { randomSpec, parseSpec, RENDERER_VERSION, MOODS, HAIR_STYLES, EYE_STYLES, TOPS, BOTTOMS } from './spec';
export type { SkinSpec, SkinPalette, Mood, HairStyle, EyeStyle, TopStyle, BottomStyle } from './spec';
