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

  it('設定の全ての組み合わせ (雰囲気×髪×目×上着×下着×縞) が、壊れずに描ける', () => {
    const base = randomSpec(77);
    let count = 0;
    for (const mood of MOODS) for (const hair of HAIR_STYLES) for (const eyes of EYE_STYLES) for (const top of TOPS) for (const bottom of BOTTOMS) for (const stripes of [false, true]) {
      const spec: SkinSpec = { ...base, mood, hair, eyes, top, bottom, stripes };
      const px = renderSkin(spec, layout);
      expect(px).toHaveLength(64 * 64 * 4);
      for (let i = 0; i < 4096; i++) {
        const f = faceAt(layout, i % 64, Math.floor(i / 64));
        if (f?.layer === 'base') expect(px[i * 4 + 3], `${hair}/${eyes}/${top}/${bottom} ${i}`).toBe(255);
      }
      count++;
    }
    expect(count).toBe(MOODS.length * HAIR_STYLES.length * EYE_STYLES.length * TOPS.length * BOTTOMS.length * 2);
  }, 60000);

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
  }, 60000);

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

  it('Tシャツは外側の層に何も描かない (胴・腕とも)。ジャケット・パーカーは外側の層を使う', () => {
    const over = (b: PaintBuffer, part: string) => b.pixels.filter((p, i) => p && b.cells[i]?.layer === 'over' && b.cells[i]?.part === part && p.mat !== 'hair').length;
    const tee = build({ top: 'tshirt', hair: 'short' });
    expect(over(tee, 'body')).toBe(0);
    expect(over(tee, 'rightArm')).toBe(0);
    expect(over(build({ top: 'jacket', hair: 'short' }), 'body')).toBeGreaterThan(40);
    expect(over(build({ top: 'jacket' }), 'rightArm')).toBeGreaterThan(20);
    expect(over(build({ top: 'hoodie', hair: 'short' }), 'body')).toBeGreaterThan(15); // フード (長い髪だと、髪がフードの上に重なる)
  });

  it('ジャケットは前が開いていて(外側の層が空)、中のシャツが素の層に描かれている', () => {
    const buf = build({ top: 'jacket' });
    for (let y = 0; y <= 10; y++) for (const x of [3, 4]) expect(matAt(buf, { part: 'body', layer: 'over', face: 'front' }, x, y), `開き (${x},${y})`).toBeNull();
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

  it('目の種類ごとに、顔の描き方が違う (まつ毛はかわいい系だけ、つり目はクール系の形)', () => {
    const eyes = (style: SkinSpec['eyes']) => {
      const buf = build({ eyes: style });
      const f = buf.face('head', 'base', 'front');
      return [3, 4, 5].map(y => [0, 1, 2, 5, 6, 7].map(x => f.get(x, y)?.mat ?? '-').join(',')).join(' / ');
    };
    const patterns = new Set(EYE_STYLES.map(eyes));
    expect(patterns.size).toBe(4);
    expect(eyes('lashes')).toContain('dark');
  });
});

describe('ちびかわいい目 (2×2を顔の下寄りに)', () => {
  const build = (changes: Partial<SkinSpec> = {}, model: 'classic' | 'slim' = 'classic') => buildBuffer({ ...randomSpec(5), eyes: 'kawaii', accessories: [], ...changes }, getLayout(model));
  const face = (b: PaintBuffer) => b.face('head', 'base', 'front');

  it('目は 2×2 が左右に1つずつ。5〜6行目 (顔の下寄り) にあり、上の4行 (おでこ) には目の部品が無い', () => {
    const f = face(build());
    for (const [x0, x1] of [[1, 2], [5, 6]]) {
      for (const y of [5, 6]) for (const x of [x0, x1]) expect(['eye', 'white'], `(${x},${y})`).toContain(f.get(x, y)?.mat);
    }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) expect(['eye', 'white', 'dark'], `(${x},${y})`).not.toContain(f.get(x, y)?.mat);
  });

  it('ハイライト(白)は、両目とも左上の1ピクセル。他の3ピクセルは黒目で、上の段は暗く、下の段は明るい', () => {
    const f = face(build());
    for (const left of [1, 5]) {
      expect(f.get(left, 5)?.mat).toBe('white');
      expect(f.get(left + 1, 5)).toMatchObject({ mat: 'eye', tone: -1 });
      expect(f.get(left, 6)).toMatchObject({ mat: 'eye', tone: 0 });
      expect(f.get(left + 1, 6)).toMatchObject({ mat: 'eye', tone: 1 });
    }
  });

  it('目尻にまつ毛、頬(左右の端)にほっぺ、あごの行に小さな口。目・ハイライトは光や影を受けない (flat)', () => {
    const f = face(build());
    expect(f.get(1, 4)?.mat).toBe('dark'); expect(f.get(6, 4)?.mat).toBe('dark');
    expect(f.get(0, 6)?.mat).toBe('blush'); expect(f.get(7, 6)?.mat).toBe('blush');
    expect(f.get(3, 7)?.mat).toBe('blush'); expect(f.get(4, 7)?.mat).toBe('blush');
    for (const [x, y] of [[1, 5], [2, 5], [1, 6], [2, 6]] as const) expect(f.get(x, y)?.flat, `(${x},${y})`).toBe(true);
  });

  it('髪が目にかからない (前髪は3行まで)。ClassicでもSlimでも同じ', () => {
    for (const model of ['classic', 'slim'] as const) {
      for (const seed of SEEDS.slice(0, 30)) {
        const b = buildBuffer({ ...randomSpec(seed), eyes: 'kawaii' }, getLayout(model));
        for (const layer of ['base', 'over'] as const) {
          const f = b.face('head', layer, 'front');
          for (let y = 3; y < 8; y++) for (let x = 0; x < 8; x++) if (layer === 'over' || y > 3) expect(f.get(x, y)?.mat, `${model} ${seed} ${layer} (${x},${y})`).not.toBe('hair');
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
    expect(checked).toBeGreaterThan(50);
  });
});

describe('アクセサリーの形', () => {
  const build = (accessories: SkinSpec['accessories'], changes: Partial<SkinSpec> = {}, model: 'classic' | 'slim' = 'classic', seed = 5) =>
    buildBuffer({ ...randomSpec(seed), hair: 'short', top: 'tshirt', accessories, ...changes }, getLayout(model));
  const matAt = (b: PaintBuffer, part: string, layer: 'base' | 'over', face: string, x: number, y: number) =>
    b.pixels[b.cells.findIndex(c => c && c.part === part && c.layer === layer && c.face === face && c.x === x && c.y === y)] ?? null;
  const overlayCount = (b: PaintBuffer, part: string) => b.pixels.filter((p, i) => p && b.cells[i]?.part === part && b.cells[i]?.layer === 'over').length;

  it('何も付けなければ、小物の跡は無い (Tシャツ+ショートの外側の層は、頭の髪の厚みだけ)', () => {
    const b = build([]);
    for (const part of ['body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']) expect(overlayCount(b, part) - (part.endsWith('Leg') ? overlayCount(b, part) : 0), part).toBe(0); // 脚はズボンの裾の厚みが出ることがある
    expect(b.pixels.filter((p, i) => p && b.cells[i]?.part === 'head' && b.cells[i]?.layer === 'over' && p.mat !== 'hair')).toHaveLength(0);
  });

  it('帽子: 頭の上3行を一周して覆い、ひさし(正面の3行目)が一番暗い。頭頂も覆う', () => {
    const b = build(['hat']);
    const band = b.band('head', 'over');
    for (let c = 0; c < band.width; c++) for (let y = 0; y < 3; y++) expect(band.get(c, y)?.mat, `(${c},${y})`).toBe(y === 1 && (c === 11 || c === 12) ? 'accent' : 'top');
    expect(band.get(band.frontStart + 2, 2)?.tone).toBe(-2); // ひさし
    expect(band.get(0, 2)?.tone).toBe(-1); // 後ろ・横の縁
    expect(matAt(b, 'head', 'over', 'top', 3, 3)?.mat).toBe('top');
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
      expect(b.band('head', 'over').get(7, 4)?.mat ?? b.band('head', 'over').get(7, 3)?.mat ?? b.band('head', 'over').get(7, 5)?.mat).toBeTruthy(); // 側面のつる
    }
  });

  it('メガネの枠は、肌と明るさが離れた色 (顔に溶けない)', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const spec = { ...randomSpec(seed), accessories: ['glasses' as const] };
      const b = buildBuffer(spec, getLayout('classic'));
      const mat = b.face('head', 'over', 'front').get(0, 4)?.mat ?? b.face('head', 'over', 'front').get(0, 5)?.mat;
      expect(mat, String(seed)).toBeTruthy();
      const l = { accent: spec.palette.accent.l, top: spec.palette.primary.l, white: 0.95, dark: 0.3 }[mat as 'accent' | 'top' | 'white' | 'dark'];
      expect(Math.abs(l - spec.palette.skin.l), String(seed)).toBeGreaterThanOrEqual(0.15);
    }
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

  it('手袋の色は、肌と明るさが離れている (肌に溶けない)', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const spec = { ...randomSpec(seed), accessories: ['gloves' as const] };
      const mat = buildBuffer(spec, getLayout('classic')).band('rightArm', 'base').get(0, 10)?.mat;
      const l = { accent: spec.palette.accent.l, top: spec.palette.primary.l, white: 0.95, dark: 0.3 }[mat as 'accent' | 'top' | 'white' | 'dark'];
      expect(Math.abs(l - spec.palette.skin.l), String(seed)).toBeGreaterThanOrEqual(0.15);
    }
  });
});

describe('契約: 見た目が意図せず変わらない (描き方を変えたら、意図して更新する)', () => {
  // 描き方 (painters / shading / color / palettes) を変えると、この値が変わる。見た目を意図して変えたときは、
  // 画像を確認して、この値を更新し、RENDERER_VERSION を上げる (保存した設定で、昔と違う絵が作られないように)
  const GOLDEN: Record<string, string> = {
    'classic:1000': '3fc2bdb8', 'classic:8919': '3fb5b24c', 'classic:16838': '0595ad95', 'classic:40595': 'f9717369', 'classic:167299': 'a7ff3f28', 'classic:301922': 'f15d2370',
    'slim:1000': '1c3c5f58', 'slim:8919': '17dd0908', 'slim:16838': 'f73917f9', 'slim:40595': 'aa9dfb79', 'slim:167299': 'a7ec8a44', 'slim:301922': 'b19853ac',
  };


  for (const model of MODELS) {
    it(`${model}: 代表的な seed の画素のハッシュ`, () => {
      for (const seed of [1000, 8919, 16838, 40595, 167299, 301922]) {
        expect(hash(renderSkin(randomSpec(seed), getLayout(model))), `${model}:${seed}`).toBe(GOLDEN[`${model}:${seed}`]);
      }
    });
  }

  it('描き方のバージョンは 2 (見た目を変えたら、ここも上げる)', () => {
    expect(RENDERER_VERSION).toBe(2);
  });
});
