import { describe, it, expect } from 'vitest';
import { renderSkin, generateSkin, buildBuffer, makeRamps } from './render';
import { randomSpec, MOODS, HAIR_STYLES, EYE_STYLES, TOPS, BOTTOMS, ACCESSORIES, RENDERER_VERSION } from './spec';
import type { SkinSpec, HairStyle } from './spec';
import { getLayout } from '../editor/skin/layout';
import { PaintBuffer } from './buffer';
import { shadeOffset, FACE_LIGHT } from './shading';
import { rgbToOklch } from './color';
import { RAMP_BASE } from './color';
import { faceAt } from '../editor/skin/faces';

const MODELS = ['classic', 'slim'] as const;
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);

// 画素の並びから、32ビットのハッシュ (FNV-1a)
function hash(pixels: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (const v of pixels) { h ^= v; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const colors = (pixels: Uint8ClampedArray, keep: (i: number) => boolean = () => true) => {
  const set = new Set<string>();
  for (let i = 0; i < 4096; i++) if (keep(i) && pixels[i * 4 + 3] > 0) set.add(`${pixels[i * 4]},${pixels[i * 4 + 1]},${pixels[i * 4 + 2]}`);
  return set;
};

describe.each(MODELS)('renderSkin (%s)', model => {
  const layout = getLayout(model);

  it('同じ設定からは、必ず同じ画素。seed が違えば違う絵', () => {
    for (const seed of SEEDS.slice(0, 10)) expect(renderSkin(randomSpec(seed), layout)).toEqual(renderSkin(randomSpec(seed), layout));
    const hashes = new Set(SEEDS.map(seed => hash(renderSkin(randomSpec(seed), layout))));
    expect(hashes.size).toBe(SEEDS.length);
  });

  it('同じ設定でも seed が違うと、形のゆらぎ(髪束・シワ)が変わるが、色の組み合わせは同じ', () => {
    const base = randomSpec(1000);
    const a = renderSkin(base, layout), b = renderSkin({ ...base, seed: 2000 }, layout);
    expect(hash(a)).not.toBe(hash(b));
    // 肌と服の主役の色は同じ設定から決まるので、使われる色の大半が共通
    const ca = colors(a), cb = colors(b);
    const common = [...ca].filter(c => cb.has(c)).length;
    expect(common / Math.max(ca.size, cb.size)).toBeGreaterThan(0.6);
  });

  it('素の層の面は全部不透明、面の外は透明、外側の層は不透明か透明のどちらか (半透明にしない)', () => {
    for (const seed of SEEDS) {
      const px = renderSkin(randomSpec(seed), layout);
      for (let i = 0; i < 4096; i++) {
        const f = faceAt(layout, i % 64, Math.floor(i / 64));
        const a = px[i * 4 + 3];
        if (!f) expect(a, `面の外 ${seed}:${i}`).toBe(0);
        else if (f.layer === 'base') expect(a, `素の層 ${seed}:${i}`).toBe(255);
        else expect([0, 255], `外側の層 ${seed}:${i}`).toContain(a);
      }
    }
  });

  it('真っ黒(0,0,0)・真っ白(255,255,255)の画素が無い', () => {
    for (const seed of SEEDS) {
      const px = renderSkin(randomSpec(seed), layout);
      for (let i = 0; i < 4096; i++) {
        if (px[i * 4 + 3] === 0) continue;
        const [r, g, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
        expect(r + g + b, `${seed}:${i}`).toBeGreaterThan(0);
        expect(r + g + b, `${seed}:${i}`).toBeLessThan(765);
      }
    }
  });

  it('色数が絞られている: 素材ごとの5色 × 素材数を超えない。かといって単調でもない (12色以上)', () => {
    for (const seed of SEEDS) {
      const n = colors(renderSkin(randomSpec(seed), layout)).size;
      expect(n, `色数 ${seed}`).toBeLessThanOrEqual(11 * 5);
      expect(n, `色数 ${seed}`).toBeGreaterThanOrEqual(12);
    }
  });

  it('設定の全ての組み合わせ (雰囲気×髪×目×口×上着×下着×縞) が、壊れずに描ける', () => {
    const base = randomSpec(77);
    let count = 0;
    for (const mood of MOODS) for (const hair of HAIR_STYLES) for (const eyes of EYE_STYLES) for (const mouth of [true, false]) for (const top of TOPS) for (const bottom of BOTTOMS) {
      for (const stripes of top === 'tshirt' ? [false, true] : [false]) { // 縞はTシャツだけ
        const spec: SkinSpec = { ...base, mood, hair, eyes, mouth, top, bottom, stripes };
        const px = renderSkin(spec, layout);
        expect(px).toHaveLength(64 * 64 * 4);
        for (let i = 0; i < 4096; i++) {
          const f = faceAt(layout, i % 64, Math.floor(i / 64));
          if (f?.layer === 'base') expect(px[i * 4 + 3], `${hair}/${eyes}/${top}/${bottom} ${i}`).toBe(255);
        }
        count++;
      }
    }
    expect(count).toBe(MOODS.length * HAIR_STYLES.length * EYE_STYLES.length * 2 * (TOPS.length + 1) * BOTTOMS.length);
  }, 180000);

  it('アクセサリーを付けても、全ての組み合わせ (小物1つずつ × 目 × 上着、全部付け × 目) が壊れずに描ける。素の層は全面不透明のまま', () => {
    const base = randomSpec(77);
    const check = (accessories: SkinSpec['accessories'], eyes: SkinSpec['eyes'], top: SkinSpec['top']) => {
      const px = renderSkin({ ...base, accessories, eyes, top, hair: 'long' }, layout);
      for (let i = 0; i < 4096; i++) {
        const f = faceAt(layout, i % 64, Math.floor(i / 64));
        if (!f) expect(px[i * 4 + 3], `面の外 ${accessories} ${i}`).toBe(0);
        else if (f.layer === 'base') expect(px[i * 4 + 3], `${accessories}/${eyes}/${top} ${i}`).toBe(255);
        else expect([0, 255]).toContain(px[i * 4 + 3]);
      }
    };
    for (const a of ACCESSORIES) for (const eyes of EYE_STYLES) for (const top of TOPS) check([a], eyes, top);
    for (const eyes of EYE_STYLES) check(['glasses', 'earrings', 'scarf', 'gloves', 'headband'], eyes, 'jacket');
  }, 120000);

  it('顔が描かれている (目・口があるので、頭の正面の目の高さに、肌以外の色が複数ある)', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const px = renderSkin(randomSpec(seed), layout);
      const row = new Set<string>();
      for (let y = 11; y <= 14; y++) for (let x = 8; x < 16; x++) row.add(`${px[(y * 64 + x) * 4]},${px[(y * 64 + x) * 4 + 1]},${px[(y * 64 + x) * 4 + 2]}`);
      expect(row.size, `顔 ${seed}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('背面も作り込まれている: 胴の背面 (外側の層があればそれ、無ければ素の層) に、襟・服・裾などの3色以上がある', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const px = renderSkin(randomSpec(seed), layout);
      const back = new Set<string>();
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 8; x++) {
          const base = ((20 + y) * 64 + 32 + x) * 4, over = ((36 + y) * 64 + 32 + x) * 4;
          const i = px[over + 3] > 0 ? over : base; // 見えているほう
          back.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
        }
      }
      expect(back.size, `背面 ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('描き方のバージョンが違う設定は断る', () => {
    expect(() => renderSkin({ ...randomSpec(1), rendererVersion: RENDERER_VERSION + 1 }, layout)).toThrow('バージョン');
  });

  it('generateSkin は、seed から設定を決めて描く (設定も返す)', () => {
    const { spec, pixels } = generateSkin(4242, layout);
    expect(spec).toEqual(randomSpec(4242));
    expect(pixels).toEqual(renderSkin(spec, layout));
  });
});

describe('Classic と Slim で、腕以外は1ピクセルも変わらない', () => {
  it('同じ設定なら、頭・胴・脚は同じ画素 (腕の幅に引きずられない)', () => {
    const classic = getLayout('classic'), slim = getLayout('slim');
    const arm = new Set<number>();
    for (const layout of [classic, slim]) {
      for (const table of [layout.uv, layout.uvOver]) {
        for (const part of ['rightArm', 'leftArm']) {
          for (const f of Object.values(table[part])) for (let y = f.v; y < f.v + f.h; y++) for (let x = f.u; x < f.u + f.w; x++) arm.add(y * 64 + x);
        }
      }
    }
    for (const seed of SEEDS.slice(0, 40)) {
      const spec = randomSpec(seed);
      const a = renderSkin(spec, classic), b = renderSkin(spec, slim);
      for (let i = 0; i < 4096; i++) {
        if (arm.has(i)) continue;
        for (let k = 0; k < 4; k++) expect(a[i * 4 + k], `${seed}:${i}`).toBe(b[i * 4 + k]);
      }
    }
  });
});

describe('色相シフト (素材のランプ)', () => {
  it('どの素材も、影の色は赤紫寄り、光の色は黄色寄りに、色相がずれている (色がある素材で)', () => {
    const hueDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;
    let checked = 0;
    for (const seed of SEEDS) {
      const spec = randomSpec(seed);
      for (const [mat, ramp] of Object.entries(makeRamps(spec))) {
        const [dark, base, light] = [rgbToOklch(ramp[0]), rgbToOklch(ramp[RAMP_BASE]), rgbToOklch(ramp[4])];
        if (base.c < 0.05 || mat === 'dark') continue; // ほぼ無彩色は色相が不安定
        // 暗い側は 300° へ、明るい側は 90° へ向かって動く (行き過ぎない範囲で)
        const towardShadow = hueDiff(300, base.h), towardLight = hueDiff(90, base.h);
        if (Math.abs(towardShadow) > 20) expect(Math.sign(hueDiff(dark.h, base.h)), `${mat} 影 ${seed}`).toBe(Math.sign(towardShadow));
        if (Math.abs(towardLight) > 20) expect(Math.sign(hueDiff(light.h, base.h)), `${mat} 光 ${seed}`).toBe(Math.sign(towardLight));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

// 塗った素材のレベルで、各パーツの形を確かめる
describe('各パーツの作り (素材・形)', () => {
  const build = (changes: Partial<SkinSpec>, model: 'classic' | 'slim' = 'classic', seed = 5) => buildBuffer({ ...randomSpec(seed), ...changes }, getLayout(model));
  const matAt = (buf: PaintBuffer, face: { part: string; layer: string; face: string }, x: number, y: number) =>
    buf.pixels[buf.cells.findIndex(c => c && c.part === face.part && c.layer === face.layer && c.face === face.face && c.x === x && c.y === y)]?.mat ?? null;

  it('目が見える: 頭の正面の5行目(目の高さ)から下に、髪の素材は無い。前髪は最大3行で、眉の1行(4行目)の上まで', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const layer of ['base', 'over']) {
        const buf = build({}, 'classic', seed);
        for (let y = 4; y < 8; y++) for (let x = 0; x < 8; x++) expect(matAt(buf, { part: 'head', layer, face: 'front' }, x, y), `${seed} ${layer} (${x},${y})`).not.toBe('hair');
        if (layer === 'over') for (let x = 0; x < 8; x++) expect(matAt(buf, { part: 'head', layer, face: 'front' }, x, 3), `${seed} over (${x},3)`).not.toBe('hair'); // 外側の層には眉が無いので、4行目も髪にならない
      }
    }
  });

  it('髪は最大でも頭の8行の中。ショートは後ろの最下行(8行目)が肌で、ロングだけが背中(体の外側の層)まで垂れる', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const short = build({ hair: 'short' }, 'classic', seed), long = build({ hair: 'long' }, 'classic', seed);
      const bodyHair = (b: PaintBuffer) => b.pixels.filter((p, i) => p?.mat === 'hair' && b.cells[i]?.part === 'body').length;
      expect(bodyHair(short), `short ${seed}`).toBe(0);
      expect(bodyHair(long), `long ${seed}`).toBeGreaterThan(10);
      for (let x = 0; x < 8; x++) expect(matAt(short, { part: 'head', layer: 'base', face: 'back' }, x, 7), `${seed} short back (${x},7)`).toBe('skin');
    }
  });

  it('外側の層の使い方: Tシャツは襟・裾・袖口の厚みだけ (少し)、パーカーはフードやポケットも、ジャケットは上着の全体を外側の層に描く', () => {
    const over = (b: PaintBuffer, part: string) => b.pixels.filter((p, i) => p && b.cells[i]?.part === part && b.cells[i]?.layer === 'over' && p.mat !== 'hair' && p.mat !== 'accessory').length;
    const tee = build({ top: 'tshirt', hair: 'short' }), hood = build({ top: 'hoodie', hair: 'short' }), jacket = build({ top: 'jacket', hair: 'short' });
    expect(over(tee, 'body')).toBeGreaterThan(50); // 裾の一周とベルトの一周 (24ずつ)、襟など
    expect(over(tee, 'body')).toBeLessThan(75);
    expect(over(tee, 'rightArm')).toBeGreaterThan(0); // 袖口
    expect(over(hood, 'body')).toBeGreaterThan(over(tee, 'body') + 5); // フードとポケットが加わる
    expect(over(jacket, 'body')).toBeGreaterThan(200);
    expect(over(jacket, 'rightArm')).toBeGreaterThan(20);
  });

  it('ジャケットは前が開いていて(外側の層が空)、中のシャツが素の層に描かれている', () => {
    const buf = build({ top: 'jacket' });
    for (let y = 0; y <= 9; y++) for (const x of [3, 4]) expect(matAt(buf, { part: 'body', layer: 'over', face: 'front' }, x, y), `開き (${x},${y})`).toBeNull(); // 10行目は、ベルトが開いた所から見える
    expect(matAt(buf, { part: 'body', layer: 'over', face: 'front' }, 1, 5)).toBe('top');
    expect(matAt(buf, { part: 'body', layer: 'base', face: 'front' }, 3, 5)).toBe('inner');
  });

  it('縞はTシャツの胴だけで、腕には入らない', () => {
    const buf = build({ top: 'tshirt', stripes: true });
    const accentAt = (part: string) => buf.pixels.filter((p, i) => p?.mat === 'accent' && buf.cells[i]?.part === part && buf.cells[i]?.layer === 'base').length;
    expect(accentAt('body')).toBeGreaterThan(30);
    expect(accentAt('rightArm') + accentAt('leftArm')).toBe(0);
  });

  it('脚の下の3行は靴(一番下は暗い底)。長ズボンは膝下まで、ショートパンツは膝から下が素肌かソックス', () => {
    const pants = build({ bottom: 'pants' }), shorts = build({ bottom: 'shorts' });
    const leg = { part: 'rightLeg', layer: 'base', face: 'front' };
    for (const buf of [pants, shorts]) for (let y = 9; y < 12; y++) expect(matAt(buf, leg, 0, y)).toBe('shoes'); // 正面の左端 (x=1,2 の9行目は靴紐)
    expect(matAt(pants, leg, 1, 6)).toBe('bottom');
    expect(['skin', 'white']).toContain(matAt(shorts, leg, 1, 6));
    expect(pants.pixels[pants.cells.findIndex(c => c && c.part === 'rightLeg' && c.layer === 'base' && c.face === 'front' && c.x === 1 && c.y === 11)]?.tone).toBe(-2);
  });

  it('目の種類ごとに、顔の描き方が違う (6種類が、どれも別の形)', () => {
    const eyes = (style: SkinSpec['eyes']) => {
      const buf = build({ eyes: style });
      const f = buf.face('head', 'base', 'front');
      return [3, 4, 5].map(y => [0, 1, 2, 5, 6, 7].map(x => f.get(x, y)?.mat ?? '-').join(',')).join(' / ');
    };
    const patterns = new Set(EYE_STYLES.map(eyes));
    expect(patterns.size).toBe(6);
    expect(eyes('lashes')).toContain('dark');
  });
});

describe('目 (ページの定番の描き方: 四角い大きな目・縦目・横目)', () => {
  const build = (changes: Partial<SkinSpec> = {}, model: 'classic' | 'slim' = 'classic') => buildBuffer({ ...randomSpec(5), eyes: 'kawaii', mouth: false, accessories: [], ...changes }, getLayout(model));
  const face = (b: PaintBuffer) => b.face('head', 'base', 'front');

  it('四角い大きな目: 5〜6行目の2×2。外側は上が灰色・下が白、内側は上が明るい目の色・下が目の色。左右対称', () => {
    const f = face(build());
    for (const [outer, inner] of [[1, 2], [6, 5]]) {
      expect(f.get(outer, 5)).toMatchObject({ mat: 'white', tone: -1 }); // 灰色
      expect(f.get(outer, 6)).toMatchObject({ mat: 'white', tone: 0 }); // 白
      expect(f.get(inner, 5)).toMatchObject({ mat: 'eye', tone: 2 }); // 明るい目の色
      expect(f.get(inner, 6)).toMatchObject({ mat: 'eye', tone: 0 }); // 目の色
    }
  });

  it('四角い大きな目: 上に黒いまつ毛の帯 (4行目の4ピクセル)、目尻 (5行目の両端) に黒い縁。おでこ(上の4行)に目の部品は無い。目は光や影を受けない', () => {
    const f = face(build());
    for (const x of [1, 2, 5, 6]) expect(f.get(x, 4)?.mat, `まつ毛 ${x}`).toBe('dark');
    expect(f.get(0, 5)).toMatchObject({ mat: 'dark', tone: -2 }); expect(f.get(7, 5)).toMatchObject({ mat: 'dark', tone: -2 });
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) expect(['eye', 'white', 'dark'], `(${x},${y})`).not.toContain(f.get(x, y)?.mat);
    for (const [x, y] of [[1, 5], [2, 5], [1, 6], [2, 6], [1, 4], [0, 5]] as const) expect(f.get(x, y)?.flat, `(${x},${y})`).toBe(true);
  });

  it('縦目: x=1 と x=6 の 4〜6行目の1×3。上が一番明るく、下が一番暗い', () => {
    const f = face(build({ eyes: 'vertical' }));
    for (const x of [1, 6]) { expect(f.get(x, 4)?.tone).toBe(2); expect(f.get(x, 5)?.tone).toBe(0); expect(f.get(x, 6)?.tone).toBe(-2); for (const y of [4, 5, 6]) expect(f.get(x, y)?.mat).toBe('eye'); }
    for (const x of [2, 3, 4, 5]) for (const y of [4, 5, 6]) expect(f.get(x, y)?.mat, `(${x},${y})`).toBe('skin'); // 他の場所に目は無い
  });

  it('横目: 6行目に、外側が白・内側が目の色の2ピクセルが左右に1つずつ (他の行には何も無い)', () => {
    const f = face(build({ eyes: 'sideways' }));
    for (const [outer, inner] of [[1, 2], [6, 5]]) { expect(f.get(outer, 6)?.mat).toBe('white'); expect(f.get(inner, 6)?.mat).toBe('eye'); }
    for (let y = 0; y < 8; y++) if (y !== 6) for (let x = 0; x < 8; x++) expect(['eye', 'white', 'dark', 'blush'], `(${x},${y})`).not.toContain(f.get(x, y)?.mat);
  });

  it('口: 口なしなら、顔のどこにも口(blush)が無い。口ありなら、小さな2ピクセル (下寄りの目はあごの行、ほかの目は6行目)。鼻は、どの目でも描かない', () => {
    for (const eyes of EYE_STYLES) {
      const without = face(build({ eyes, mouth: false })), withMouth = face(build({ eyes, mouth: true }));
      const lips = (f: ReturnType<typeof face>) => { const out: [number, number][] = []; for (let y = 0; y < 8; y++) for (let x = 2; x < 6; x++) if (f.get(x, y)?.mat === 'blush') out.push([x, y]); return out; };
      expect(lips(without), `${eyes} 口なし`).toHaveLength(0);
      const row = ['kawaii', 'vertical', 'sideways'].includes(eyes) ? 7 : 6;
      expect(lips(withMouth), `${eyes} 口あり`).toEqual([[3, row], [4, row]]);
      for (let y = 3; y < 7; y++) for (const x of [3, 4]) if (y !== row) expect(['skin', 'dark'], `${eyes} 鼻(${x},${y})`).toContain(withMouth.get(x, y)?.mat); // 鼻は描かない
    }
  });

  it('髪が目にかからない (前髪は3行まで)。ClassicでもSlimでも、全ての髪型で同じ', () => {
    for (const model of ['classic', 'slim'] as const) {
      for (const hair of HAIR_STYLES) {
        for (const seed of SEEDS.slice(0, 10)) {
          const b = buildBuffer({ ...randomSpec(seed), hair, eyes: 'kawaii' }, getLayout(model));
          for (const layer of ['base', 'over'] as const) {
            const f = b.face('head', layer, 'front');
            for (let y = 3; y < 8; y++) for (let x = 0; x < 8; x++) if (layer === 'over' || y > 3) expect(f.get(x, y)?.mat, `${model} ${hair} ${seed} ${layer} (${x},${y})`).not.toBe('hair');
          }
        }
      }
    }
  });
});

describe('髪の外側の層の凹凸', () => {
  const build = (changes: Partial<SkinSpec>, seed: number) => buildBuffer({ ...randomSpec(seed), accessories: [], ...changes }, getLayout('classic'));
  // 頭の帯の列ごとの、上から続く髪の行数
  const depths = (b: PaintBuffer, layer: 'base' | 'over') => {
    const band = b.band('head', layer);
    return Array.from({ length: band.width }, (_, c) => { let d = 0; while (d < band.height && band.get(c, d)?.mat === 'hair') d++; return d; });
  };

  it('外側の層は、素の層の複製ではない。列ごとに長さが違い、毛先が素の層より長い所・短い所がある', () => {
    let differing = 0, longer = 0, shorter = 0, total = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      for (const hair of HAIR_STYLES) {
        const b = build({ hair }, seed);
        const [base, over] = [depths(b, 'base'), depths(b, 'over')];
        base.forEach((d, c) => { total++; if (over[c] !== d) differing++; if (over[c] > d) longer++; if (over[c] < d) shorter++; });
      }
    }
    expect(differing / total).toBeGreaterThan(0.25); // 4分の1以上の列で、素の層と長さが違う
    expect(longer).toBeGreaterThan(0); expect(shorter).toBeGreaterThan(0);
  });

  it('毛先が尖る: 同じ束の中で、真ん中の列だけが1行長い (束のあいだに切れ込みができる)。ロングで特に多い', () => {
    const notches = (hair: HairStyle) => {
      let n = 0;
      for (const seed of SEEDS.slice(0, 40)) {
        const d = depths(build({ hair }, seed), 'over');
        for (let c = 1; c < 31; c++) if (d[c] > d[c - 1] && d[c] > d[c + 1] && d[c] >= 3) n++; // 左右より1行以上長い列 = 尖った毛先
      }
      return n;
    };
    expect(notches('long')).toBeGreaterThan(40);
    expect(notches('medium')).toBeGreaterThan(20);
  });

  it('前髪は、長い束と短い束が混ざる (どの seed でも、正面の外側の層の前髪が2種類以上の長さ)', () => {
    let mixed = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const d = depths(build({ hair: 'medium' }, seed), 'over').slice(8, 16);
      if (new Set(d).size >= 2) mixed++;
    }
    expect(mixed).toBeGreaterThan(30);
  });

  it('ロングは肩・背中、ミディアムは襟足に毛先が出る。ショートは出ない。肩の前に垂れる毛束は外側ほど長い', () => {
    const body = (b: PaintBuffer) => b.pixels.filter((p, i) => p?.mat === 'hair' && b.cells[i]?.part === 'body' && b.cells[i]?.layer === 'over').length;
    for (const seed of SEEDS.slice(0, 20)) {
      expect(body(build({ hair: 'short' }, seed)), `short ${seed}`).toBe(0);
      expect(body(build({ hair: 'medium' }, seed)), `medium ${seed}`).toBeLessThan(40);
      expect(body(build({ hair: 'long' }, seed)), `long ${seed}`).toBeGreaterThan(25);
      const over = build({ hair: 'long', top: 'tshirt' }, seed).band('body', 'over');
      const f = over.frontStart;
      const len = (x: number) => { let d = 0; while (over.get(f + x, d)?.mat === 'hair') d++; return d; };
      expect(len(0), `外側ほど長い ${seed}`).toBeGreaterThanOrEqual(len(1));
      expect(len(7)).toBeGreaterThanOrEqual(len(6));
    }
  });

  it('外側の層の髪の下の素の層(髪・肌)は、接触部分の影で暗くなる (奥行き)', () => {
    const b = build({ hair: 'long' }, 3);
    const over = b.band('head', 'over'), base = b.band('head', 'base');
    let checked = 0;
    for (let c = 0; c < 32; c++) {
      for (let y = 0; y < 8; y++) {
        if (over.get(c, y)?.mat !== 'hair' || base.get(c, y)?.mat !== 'hair') continue;
        const i = ((8 + y) * 64 + c); // 頭の帯の画素番号
        expect(shadeOffset(b, i), `(${c},${y})`).toBeLessThan(FACE_LIGHT[b.cells[i]!.face]); // 外側の層に覆われた素の層は、必ず暗い
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });
});

describe('アクセサリーの形', () => {
  const build = (accessories: SkinSpec['accessories'], changes: Partial<SkinSpec> = {}, model: 'classic' | 'slim' = 'classic', seed = 5) =>
    buildBuffer({ ...randomSpec(seed), hair: 'short', top: 'tshirt', accessories, ...changes }, getLayout(model));
  const matAt = (b: PaintBuffer, part: string, layer: 'base' | 'over', face: string, x: number, y: number) =>
    b.pixels[b.cells.findIndex(c => c && c.part === part && c.layer === layer && c.face === face && c.x === x && c.y === y)] ?? null;

  it('何も付けなければ、小物の色 (accessory) の画素は一つも無い (髪ゴムを使わない髪型のとき)', () => {
    for (const model of ['classic', 'slim'] as const) {
      const b = build([], {}, model);
      expect(b.pixels.filter(p => p?.mat === 'accessory')).toHaveLength(0);
    }
  });

  it('帽子: 頭の上3行を一周して覆い、ひさし(正面の3行目)が一番暗い。頭頂も覆う', () => {
    const b = build(['hat']);
    const band = b.band('head', 'over');
    for (let c = 0; c < band.width; c++) for (let y = 0; y < 3; y++) expect(band.get(c, y)?.mat, `(${c},${y})`).toBe(y === 1 && (c === 11 || c === 12) ? 'accent' : 'accessory'); // 帽子は小物の色。正面に、アクセントの色のマーク
    expect(band.get(band.frontStart + 2, 2)?.tone).toBe(-2); // ひさし
    expect(band.get(0, 2)?.tone).toBe(-1); // 後ろ・横の縁
    expect(matAt(b, 'head', 'over', 'top', 3, 3)?.mat).toBe('accessory');
  });

  it('メガネ: 目のまわりに枠 (外側の層)。目の部分は透明のままで、素の層の目が見える。どの目の種類でも、目を隠さない', () => {
    for (const eyes of EYE_STYLES) {
      const b = build(['glasses'], { eyes });
      const front = b.face('head', 'over', 'front'), base = b.face('head', 'base', 'front');
      const eyePixels: [number, number][] = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (['eye', 'white'].includes(base.get(x, y)?.mat ?? '')) eyePixels.push([x, y]);
      expect(eyePixels.length, eyes).toBeGreaterThanOrEqual(4);
      for (const [x, y] of eyePixels) expect(front.get(x, y), `${eyes} 目(${x},${y})が枠に隠れている`).toBeNull();
      let frame = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = front.get(x, y); if (p && p.mat !== 'hair') frame++; } // 髪の外側の層は数えない
      expect(frame, `${eyes} 枠の画素数`).toBeGreaterThanOrEqual(10);
      expect(frame, `${eyes} 枠が大きすぎない`).toBeLessThanOrEqual(26);
      for (let y = 0; y < 8; y++) expect(front.get(3, y)?.mat === 'blush', `${eyes} 口を隠さない`).toBe(false);
      const temple = { classic: 3, lashes: 3, sharp: 3, kawaii: 4, vertical: 3, sideways: 5 }[eyes] + 1; // つるは、レンズの上の辺の1行下
      expect(b.band('head', 'over').get(7, temple)?.mat, `${eyes} 側面のつる`).toBe('accessory');
    }
  });

  it('小物は、設定の「小物の色」で描かれる: 色を変えると、小物の画素だけが変わる (小物が無ければ、何も変わらない)', () => {
    const base = { ...randomSpec(5), hair: 'short' as const, top: 'tshirt' as const };
    const other = { ...base.palette, accessory: { l: 0.5, c: 0.15, h: 150 } };
    const diff = (a: SkinSpec, b: SkinSpec) => { const [x, y] = [renderSkin(a, getLayout('classic')), renderSkin(b, getLayout('classic'))]; let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; };
    expect(diff({ ...base, accessories: [] }, { ...base, accessories: [], palette: other })).toBe(0);
    for (const a of ACCESSORIES) expect(diff({ ...base, accessories: [a] }, { ...base, accessories: [a], palette: other }), a).toBeGreaterThan(0);
  });

  it('リボン: 正面の上に 5×3 の蝶結び。結び目は暗く、輪の内側は明るく、左右どちらかに寄る', () => {
    const sides = new Set<number>();
    for (const seed of SEEDS.slice(0, 20)) {
      const b = build(['ribbon'], {}, 'classic', seed);
      const front = b.face('head', 'over', 'front');
      const knots = [0, 1, 2, 3, 4, 5, 6, 7].filter(x => front.get(x, 1)?.tone === -1 && front.get(x, 1)?.mat !== 'hair'); // 髪の外側の層(束の境目の影)は除く
      expect(knots, String(seed)).toHaveLength(1);
      const k = knots[0];
      sides.add(k);
      expect(front.get(k - 1, 1)?.tone).toBe(1); expect(front.get(k + 1, 1)?.tone).toBe(1);
      for (const x of [k - 2, k + 2]) for (const y of [0, 1, 2]) expect(front.get(x, y)?.mat, `輪 (${x},${y})`).toBeTruthy();
      const ribbonMat = front.get(k, 1)!.mat;
      expect(front.get(k, 0)?.mat === ribbonMat, `結び目の上 ${seed}`).toBe(false); expect(front.get(k, 2)?.mat === ribbonMat, `結び目の下 ${seed}`).toBe(false); // 結び目の上下はあく (髪が見える)
    }
    expect(sides.size).toBe(2);
  });

  it('カチューシャ: 頭頂を横切り、両耳の前に降り、正面の生え際にも1行。帽子と同時には付かない (正規化)', () => {
    const b = build(['headband']);
    const top = b.face('head', 'over', 'top');
    for (let x = 0; x < 8; x++) expect(top.get(x, 3)?.mat, `頭頂 ${x}`).toBeTruthy();
    for (let y = 0; y <= 4; y++) { expect(b.band('head', 'over').get(5, y)).toBeTruthy(); expect(b.band('head', 'over').get(18, y)).toBeTruthy(); }
    for (let x = 0; x < 8; x++) expect(b.face('head', 'over', 'front').get(x, 0)?.mat, `生え際 ${x}`).toBeTruthy();
  });

  it('イヤリング: 側面の耳の位置に、光る玉(flat)と垂れる飾り。右の側面には必ず付く', () => {
    const b = build(['earrings']);
    const band = b.band('head', 'over');
    expect(band.get(3, 5)).toMatchObject({ flat: true, tone: 1 });
    expect(band.get(3, 6)?.mat).toBeTruthy();
  });

  it('マフラー: 首を一周する2行 (編み目で1列おきに明るさが違う)。前に垂れる端は、先が欠ける', () => {
    const b = build(['scarf']);
    const body = b.band('body', 'over');
    for (let c = 0; c < body.width; c++) for (let y = 0; y < 2; y++) expect(body.get(c, y), `(${c},${y})`).toBeTruthy();
    expect(body.get(0, 0)?.tone).not.toBe(body.get(1, 0)?.tone);
    const f = body.frontStart;
    for (let y = 2; y <= 4; y++) { expect(body.get(f + 5, y)).toBeTruthy(); expect(body.get(f + 6, y)).toBeTruthy(); }
    expect(body.get(f + 5, 5)).toBeTruthy(); expect(body.get(f + 6, 5)).toBeNull(); // ふさ
  });

  it('手袋: 手首から先の素の層 (9〜11行目) が肌でなくなり、外側の層に手首の縁。腕の幅が違うSlimでも同じ', () => {
    for (const model of ['classic', 'slim'] as const) {
      const b = build(['gloves'], {}, model);
      for (const part of ['rightArm', 'leftArm']) {
        const base = b.band(part as 'rightArm', 'base'), over = b.band(part as 'rightArm', 'over');
        const mat = base.get(0, 9)?.mat;
        expect(mat, `${model} ${part}`).not.toBe('skin');
        for (let c = 0; c < base.width; c++) {
          for (let y = 9; y < 12; y++) expect(base.get(c, y)?.mat, `${model} ${part} (${c},${y})`).toBe(mat);
          expect(over.get(c, 9)?.tone, `${model} ${part} 縁`).toBe(1);
          expect(base.get(c, 8)?.mat).not.toBe(mat); // 手首より上は手袋ではない
        }
      }
    }
  });

});

describe('髪: ベースと外側の層の混ぜ方・前髪・髪型', () => {
  const build = (hair: HairStyle, seed: number, changes: Partial<SkinSpec> = {}, model: 'classic' | 'slim' = 'classic') => buildBuffer({ ...randomSpec(seed), hair, eyes: 'kawaii', accessories: [], ...changes }, getLayout(model)); // 眉(髪の素材)の無い目で、髪だけを数える
  const hairCount = (b: PaintBuffer, layer: 'base' | 'over', part = 'head') => b.pixels.filter((p, i) => p?.mat === 'hair' && b.cells[i]?.layer === layer && b.cells[i]?.part === part).length;
  const frontDepths = (b: PaintBuffer) => { const f = b.face('head', 'base', 'front'); return Array.from({ length: 8 }, (_, x) => { let d = 0; while (f.get(x, d)?.mat === 'hair') d++; return d; }); };

  it('前髪の生え際は、どの髪型・どの seed でも、場所によって長さが違う (横一列のぱっつんにならない)。おでこが見える (1〜3行)', () => {
    for (const hair of HAIR_STYLES) {
      for (const seed of SEEDS.slice(0, 40)) {
        const d = frontDepths(build(hair, seed));
        expect(new Set(d).size, `${hair} ${seed} ${d}`).toBeGreaterThanOrEqual(2);
        for (const v of d) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(3); }
        let run = 1, longest = 1;
        for (let x = 1; x < 8; x++) { run = d[x] === d[x - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
        expect(longest, `同じ長さが続きすぎる ${hair} ${seed} ${d}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('前髪の形は何種類も出る (seed を変えると、生え際の形が変わる)', () => {
    const shapes = new Set(SEEDS.slice(0, 60).map(seed => frontDepths(build('medium', seed)).join('')));
    expect(shapes.size).toBeGreaterThanOrEqual(8);
  });

  it('ベースと外側の層を混ぜる: 外側の層の髪は、ベースの髪の全部を覆わない (3分の2以下)。ポニーテール・ツインテール・お団子の飛び出しを含めても', () => {
    for (const hair of HAIR_STYLES) {
      let base = 0, over = 0;
      for (const seed of SEEDS.slice(0, 30)) {
        const b = build(hair, seed);
        base += hairCount(b, 'base'); over += hairCount(b, 'over');
      }
      expect(over / base, `${hair}`).toBeLessThan(0.67);
      expect(over / base, `${hair} 外側の層も使う`).toBeGreaterThan(0.1);
    }
  });

  it('外側の層の髪が、ベースの髪より外側に突き出ている所 (長く垂れる前髪の束・もみあげ・毛先) がある。ベースの髪は、全ての列で途切れず続く', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = build('medium', seed);
      const base = b.band('head', 'base'), over = b.band('head', 'over');
      let beyond = 0;
      for (let c = 0; c < 32; c++) {
        let d = 0; while (base.get(c, d)?.mat === 'hair') d++;
        expect(d, `ベースの髪は全列にある (${c})`).toBeGreaterThanOrEqual(1);
        for (let y = d; y < 8; y++) if (over.get(c, y)?.mat === 'hair') beyond++;
      }
      expect(beyond, `突き出し ${seed}`).toBeGreaterThan(3);
    }
  });

  it('ポニーテール: 後頭部の高い所を髪ゴムで結び (小物の色の2ピクセル)、そこから尾が背中 (体の外側の層) へ垂れる。ほかの髪型には髪ゴムは無い', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = build('ponytail', seed);
      const ties = b.pixels.filter((p, i) => p?.mat === 'accessory' && b.cells[i]?.part === 'head' && b.cells[i]?.face === 'back');
      expect(ties, `髪ゴム ${seed}`).toHaveLength(2);
      const tail = b.pixels.filter((p, i) => p?.mat === 'hair' && b.cells[i]?.part === 'body' && b.cells[i]?.layer === 'over' && b.cells[i]?.face === 'back').length;
      expect(tail, `尾が背中へ ${seed}`).toBeGreaterThanOrEqual(2);
      expect(hairCount(b, 'base') + hairCount(b, 'over'), 'ベースの髪もある').toBeGreaterThan(80);
      for (const other of ['short', 'medium', 'long'] as const) expect(build(other, seed).pixels.filter(p => p?.mat === 'accessory'), `${other} に髪ゴムは無い`).toHaveLength(0);
    }
  });

  it('ツインテール: 左右の側面に髪ゴム (各2ピクセル) と、そこから垂れる尾。肩の前にも毛束が垂れる (左右とも)', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = build('twintails', seed);
      for (const face of ['right', 'left']) {
        const ties = b.pixels.filter((p, i) => p?.mat === 'accessory' && b.cells[i]?.part === 'head' && b.cells[i]?.face === face);
        expect(ties, `${face} 髪ゴム ${seed}`).toHaveLength(2);
        const tail = b.pixels.filter((p, i) => p?.mat === 'hair' && b.cells[i]?.part === 'head' && b.cells[i]?.layer === 'over' && b.cells[i]?.face === face && b.cells[i]!.y >= 3).length;
        expect(tail, `${face} 尾 ${seed}`).toBeGreaterThanOrEqual(8);
      }
      const front = b.band('body', 'over');
      for (const x of [0, 7]) expect(front.get(front.frontStart + x, 1)?.mat, `肩の前の毛束 ${x}`).toBe('hair');
    }
  });

  it('お団子: 頭頂の外側の層に 4×4 のかたまり (左上が明るく右下が暗い)、後頭部に髪ゴム。ほかの髪型の頭頂は、全体を覆わない', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = build('bun', seed);
      const top = b.face('head', 'over', 'top');
      let block = 0;
      for (let y = 1; y <= 4; y++) for (let x = 0; x < 8; x++) if (top.get(x, y)?.mat === 'hair') block++;
      expect(block, `団子 ${seed}`).toBeGreaterThanOrEqual(16);
      expect(b.pixels.filter((p, i) => p?.mat === 'accessory' && b.cells[i]?.part === 'head' && b.cells[i]?.face === 'back'), `髪ゴム ${seed}`).toHaveLength(2);
      let covered = 0;
      for (const hair of ['short', 'medium', 'long'] as const) {
        const t = build(hair, seed).face('head', 'over', 'top');
        let n = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (t.get(x, y)) n++;
        covered = Math.max(covered, n);
      }
      expect(covered, '頭頂の外側の層は、全体の半分以下').toBeLessThanOrEqual(32);
    }
  });

  it('ClassicでもSlimでも、髪型は同じ (腕の幅に影響されない)。全ての髪型で、素の層は全面不透明', () => {
    for (const hair of HAIR_STYLES) {
      const a = build(hair, 7, {}, 'classic'), b = build(hair, 7, {}, 'slim');
      for (const part of ['head']) expect(a.pixels.filter((p, i) => p && a.cells[i]?.part === part).map(p => `${p!.mat}${p!.tone}`)).toEqual(b.pixels.filter((p, i) => p && b.cells[i]?.part === part).map(p => `${p!.mat}${p!.tone}`));
    }
  });
});

describe('服の立体的な凹凸 (外側の層を一部だけ使う)', () => {
  const build = (changes: Partial<SkinSpec>, seed = 5, model: 'classic' | 'slim' = 'classic') => buildBuffer({ ...randomSpec(seed), hair: 'short', accessories: [], ...changes }, getLayout(model));

  it('Tシャツ: 裾と袖口が一周して厚くなり、襟のふちが盛り上がり、ズボンのベルトも外側の層で一周する', () => {
    const b = build({ top: 'tshirt', bottom: 'pants' });
    const body = b.band('body', 'over');
    for (let c = 0; c < body.width; c++) {
      expect(body.get(c, 9)?.mat, `裾 ${c}`).toBe('top');
      expect(body.get(c, 10)?.mat, `ベルト ${c}`).toBe(c === body.frontStart + 3 || c === body.frontStart + 4 ? 'accent' : 'bottom'); // 正面の中央はバックル
    }
    for (const part of ['rightArm', 'leftArm'] as const) { const arm = b.band(part, 'over'); for (let c = 0; c < arm.width; c++) expect(arm.get(c, 3)?.mat, `${part} 袖口 ${c}`).toBe('top'); }
    expect(body.get(body.frontStart + 3, 1)).toMatchObject({ mat: 'top', tone: 1 }); // 襟のふち
    expect(body.get(body.backStart + 3, 0)).toMatchObject({ mat: 'top', tone: 1 });
    expect(body.get(body.frontStart + 3, 10)).toMatchObject({ mat: 'accent', tone: 1 }); // バックル
  });

  it('パーカー: 裾と袖口は編み目(リブ)のように1列おきに明るさが違う。カンガルーポケットの縁、フード、紐が外側の層にある', () => {
    const b = build({ top: 'hoodie' });
    const body = b.band('body', 'over');
    for (let c = 0; c < body.width; c++) expect(body.get(c, 10)?.tone, `裾 ${c}`).toBe(c % 2 === 0 ? -1 : 1);
    expect(b.band('rightArm', 'over').get(0, 9)?.tone).not.toBe(b.band('rightArm', 'over').get(1, 9)?.tone);
    const f = body.frontStart;
    expect(body.get(f + 3, 6)).toMatchObject({ mat: 'top', tone: 1 }); // ポケットの上の縁
    expect(body.get(f + 3, 8)).toMatchObject({ mat: 'top', tone: -1 }); // 下の縁
    expect(body.get(f + 3, 7)).toBeNull(); // 中は素の層のまま
    expect(body.get(body.backStart + 3, 1)?.mat).toBe('top'); // フード
    expect(body.get(f + 2, 3)?.mat).toBe('accent'); // 紐
  });

  it('ジャケット: ポケットのふた(口の影の線・明るい縁)と、ベルトが前の開きから見える', () => {
    const b = build({ top: 'jacket', bottom: 'pants' });
    const over = b.band('body', 'over'), f = over.frontStart;
    expect(over.get(f + 1, 7)?.tone).toBe(-1); expect(over.get(f + 1, 8)?.tone).toBe(1);
    expect(over.get(f + 3, 10)).toMatchObject({ mat: 'accent', tone: 1 }); // 開きの下から、ベルトのバックルが見える
    expect(over.get(f + 2, 10)).toMatchObject({ mat: 'top', tone: 1 }); // 開きの両側は、上着の縁 (折り返しの厚み)
  });

  it('ズボンと靴: 長ズボンの裾の折り返し・靴の履き口・靴底の厚みが、両足を一周する。ショートパンツの裾は、ところどころ欠ける', () => {
    const pants = build({ bottom: 'pants' }), shorts = build({ bottom: 'shorts' });
    for (const b of [pants, shorts]) {
      for (const part of ['rightLeg', 'leftLeg'] as const) {
        const leg = b.band(part, 'over');
        for (let c = 0; c < leg.width; c++) { expect(leg.get(c, 9)).toMatchObject({ mat: 'shoes', tone: 1 }); expect(leg.get(c, 11)).toMatchObject({ mat: 'shoes', tone: -2 }); }
      }
    }
    for (let c = 0; c < 16; c++) expect(pants.band('rightLeg', 'over').get(c, 8)?.mat, `裾 ${c}`).toBe('bottom');
    const hems = Array.from({ length: 16 }, (_, c) => shorts.band('rightLeg', 'over').get(c, 4)?.mat ?? null);
    expect(hems.some(h => h === 'bottom')).toBe(true);
  });

  it('ポケット: ヒップポケット・カーゴポケットが付く seed と付かない seed があり、縁は影の線だけで色のまだらにはならない (周りと同じ明るさか、暗い)', () => {
    let withPocket = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const b = build({ bottom: 'pants' }, seed);
      const front = b.band('rightLeg', 'over'), f = front.frontStart;
      if (front.get(f, 1)) {
        withPocket++;
        for (let y = 1; y <= 3; y++) for (let x = 0; x < 2; x++) { const p = front.get(f + x, y); if (p) expect(p.tone, `(${x},${y})`).toBeLessThanOrEqual(0); }
      }
    }
    expect(withPocket).toBeGreaterThan(5);
    expect(withPocket).toBeLessThan(35);
  });

  it('外側の層の厚みの下の素の層は、接触部分の影で暗くなる (奥行き)', () => {
    const b = build({ top: 'tshirt', bottom: 'pants' });
    // 胴の正面の裾 (9行目) の外側の層の下 = 素の層の同じ場所 (胴の正面は (20,20)〜)
    const base = (x: number, y: number) => (20 + y) * 64 + 20 + x;
    expect(shadeOffset(b, base(3, 9))).toBeLessThan(FACE_LIGHT.front);
  });
});

describe('契約: 見た目が意図せず変わらない (描き方を変えたら、意図して更新する)', () => {
  // 描き方 (painters / shading / color / palettes) を変えると、この値が変わる。見た目を意図して変えたときは、
  // 画像を確認して、この値を更新し、RENDERER_VERSION を上げる (保存した設定で、昔と違う絵が作られないように)
  const GOLDEN: Record<string, string> = {
    'classic:1000': 'c3747f07', 'classic:8919': 'bae4fd40', 'classic:16838': '68758401', 'classic:40595': '6f1706a2', 'classic:167299': 'f5e4d391', 'classic:301922': '788a3115',
    'slim:1000': 'fa6d963b', 'slim:8919': '3f277a34', 'slim:16838': 'da254711', 'slim:40595': 'be65d4e2', 'slim:167299': 'd58a827d', 'slim:301922': '51e64a81',
  };



  for (const model of MODELS) {
    it(`${model}: 代表的な seed の画素のハッシュ`, () => {
      for (const seed of [1000, 8919, 16838, 40595, 167299, 301922]) {
        expect(hash(renderSkin(randomSpec(seed), getLayout(model))), `${model}:${seed}`).toBe(GOLDEN[`${model}:${seed}`]);
      }
    });
  }

  it('描き方のバージョンは 3 (見た目を変えたら、ここも上げる)', () => {
    expect(RENDERER_VERSION).toBe(3);
  });
});
