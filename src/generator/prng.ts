// seed付きの乱数。Math.random() と違い、同じ seed からは必ず同じ数列が出る
// スキンの生成は「同じ設定なら同じスキン」でなければならない (あとで同じ絵を作り直せる・共有できる) ので、必ずこれを使う
export type Rng = () => number; // 0以上1未満

// mulberry32: 小さくて速い、よく使われる乱数のアルゴリズム
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字列を32ビットの数にする (FNV-1a)
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// seed と「流れの名前」から、独立した乱数の流れを作る
// 設定を決める流れ・髪を描く流れ・服を描く流れ…を分けておくと、
// 髪の描き方を変えても (乱数の使う回数が変わっても)、服や顔のゆらぎは変わらない
export function createRng(seed: number, stream: string): Rng {
  return mulberry32(hashString(`${seed >>> 0}:${stream}`));
}

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
export const chance = (rng: Rng, probability: number) => rng() < probability;
// min 以上 max 以下の整数
export const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
// 並べ替えた新しい配列 (フィッシャー–イェーツのシャッフル。元の配列は変えない)
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
