import { describe, it, expect } from 'vitest';
import { renderSkin, generateSkin, buildBuffer, makeRamps } from './render';
import { randomSpec, MOODS, HAIR_STYLES, EYE_STYLES, TOPS, BOTTOMS, RENDERER_VERSION } from './spec';
import type { SkinSpec } from './spec';
import { getLayout } from '../editor/skin/layout';
import { PaintBuffer } from './buffer';
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
    expect(count).toBe(3 * 3 * 3 * 3 * 2 * 2);
  });

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
    expect(patterns.size).toBe(3);
    expect(eyes('lashes')).toContain('dark');
  });
});

describe('契約: 見た目が意図せず変わらない (描き方を変えたら、意図して更新する)', () => {
  // 描き方 (painters / shading / color / palettes) を変えると、この値が変わる。見た目を意図して変えたときは、
  // 画像を確認して、この値を更新し、RENDERER_VERSION を上げる (保存した設定で、昔と違う絵が作られないように)
  const GOLDEN: Record<string, string> = {
    'classic:1000': '8f10c6a3', 'classic:8919': '2eb53e27', 'classic:16838': 'e85f7aa3', 'classic:40595': '9df10781', 'classic:167299': 'addd64f7', 'classic:301922': 'a33d0959',
    'slim:1000': '39a422f3', 'slim:8919': '75215d9b', 'slim:16838': 'dbc19e1f', 'slim:40595': 'd11efed1', 'slim:167299': 'd792a66b', 'slim:301922': '1cf30d9d',
  };

  for (const model of MODELS) {
    it(`${model}: 代表的な seed の画素のハッシュ`, () => {
      for (const seed of [1000, 8919, 16838, 40595, 167299, 301922]) {
        expect(hash(renderSkin(randomSpec(seed), getLayout(model))), `${model}:${seed}`).toBe(GOLDEN[`${model}:${seed}`]);
      }
    });
  }

  it('描き方のバージョンは 1 (見た目を変えたら、ここも上げる)', () => {
    expect(RENDERER_VERSION).toBe(1);
  });
});
