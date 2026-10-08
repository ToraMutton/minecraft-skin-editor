// 色 (OKLCH)
// L: 明るさ(0〜1)  C: 鮮やかさ  H: 色相(度)
// RGBと違い「明るさだけ変える」が見た目どおりに効くので、陰影づけに向いている

export type Oklch = { l: number; c: number; h: number };
export type Rgb = [number, number, number];

const L_MIN = 0.17; // 真っ黒にしない (濃紺・こげ茶など、色のある暗い色にする)
const L_MAX = 0.97; // 真っ白にしない (オフホワイトにする)

// 表示できない色(sRGBの範囲外)なら null を返す
function oklchToRgb(l: number, c: number, h: number): Rgb | null {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  if (linear.some(v => v < -0.0001 || v > 1.0001)) return null;
  const toSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  const [r, g, bl] = linear.map(v => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255));
  return [r, g, bl];
}

// RGBにする。範囲外の色なら、鮮やかさを少しずつ下げて表示できる色にする
export function toRgb({ l, c, h }: Oklch): Rgb {
  const lightness = Math.min(L_MAX, Math.max(L_MIN, l));
  for (let chroma = c; chroma > 0; chroma -= 0.004) {
    const rgb = oklchToRgb(lightness, chroma, h);
    if (rgb) return rgb;
  }
  return oklchToRgb(lightness, 0, h)!;
}

// RGB → OKLCH (テストや、色の分析に使う)
export function rgbToOklch([r, g, b]: Rgb): Oklch {
  const toLinear = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

// 色相シフト (Hue Shifting): 影は暗くするだけでなく、赤紫寄りに。光は黄色寄りに。
// 影に黒を混ぜるより自然で、色がくすまない (ドット絵の定番テクニック)
const SHADOW_HUE = 300; // 影が向かう色相 (赤紫)
const LIGHT_HUE = 90; // 光が向かう色相 (黄色)
const MAX_HUE_SHIFT = 15; // 1回に動かす色相の最大 (度)

// 色相 from を、to のほうへ amount 度だけ動かす (近いほうの回り方で。届いたらそこで止まる)
function turnToward(from: number, to: number, amount: number): number {
  const diff = ((to - from + 540) % 360) - 180; // -180〜180
  return (from + Math.sign(diff) * Math.min(Math.abs(diff), amount) + 360) % 360;
}

// 明るさを dl だけ変える。暗くすると赤紫寄りで少し鮮やかに、明るくすると黄色寄りで少し淡くなる
export function shade(color: Oklch, dl: number): Oklch {
  if (dl === 0) return color;
  const amount = Math.min(Math.abs(dl) * 120, MAX_HUE_SHIFT);
  const h = turnToward(color.h, dl < 0 ? SHADOW_HUE : LIGHT_HUE, amount);
  const c = color.c * (dl < 0 ? 1 + 0.5 * -dl : 1 - 0.8 * dl);
  return { l: Math.min(L_MAX, Math.max(L_MIN, color.l + dl)), c, h };
}

// 1つの素材の色の段階 (ランプ)。暗い → 明るい の5色で、真ん中(RAMP_BASE)が基本の色
// 素材ごとに色を5色までに絞ると、全体に統一感が出る
export const RAMP_STEPS = [-0.17, -0.085, 0, 0.07, 0.13] as const;
export const RAMP_BASE = 2;
export const RAMP_SIZE = RAMP_STEPS.length;

export function makeRamp(base: Oklch): Rgb[] {
  // 暗い素材(濃紺のズボンなど)は、影の側の余地が少ない。そのまま暗くすると下の段階が黒に潰れるので、余地に収まるよう影の側の幅を縮める
  const room = Math.max(0, base.l - L_MIN);
  const darkScale = Math.min(1, room / -RAMP_STEPS[0]);
  return RAMP_STEPS.map(dl => toRgb(shade(base, dl < 0 ? dl * darkScale : dl)));
}

// CSSの色の文字列 (画面の色見本に使う)
export function cssColor(color: Oklch): string {
  const [r, g, b] = toRgb(color);
  return `rgb(${r}, ${g}, ${b})`;
}
