import { describe, it, expect } from 'vitest';
import { createStarterPixels } from '../skin/starter';
import { getLayout } from '../skin/layout';
import { validateSkinImage, interpretSkin, nameFromFileName, exportFileName } from './importFile';

describe('validateSkinImage', () => {
  it('64×64 の PNG なら問題なし (null)', () => {
    expect(validateSkinImage('image/png', 64, 64)).toBeNull();
  });
  it('PNG 以外は、種類の理由で断る', () => {
    for (const type of ['image/jpeg', 'image/gif', 'text/plain', '']) expect(validateSkinImage(type, 64, 64), type).toBe('PNG画像を選んでください');
  });
  it('旧形式の 64×32 も読み込める (読み込むときに 64×64 にする)', () => {
    expect(validateSkinImage('image/png', 64, 32)).toBeNull();
  });
  it('それ以外の大きさは、引き伸ばさずに、選んだ画像の大きさを添えて断る', () => {
    expect(validateSkinImage('image/png', 128, 64)).toBe('64×64のスキン画像を選んでください (選択した画像: 128×64)');
    expect(validateSkinImage('image/png', 32, 32)).toContain('32×32');
    expect(validateSkinImage('image/png', 64, 48)).toContain('64×48');
    expect(validateSkinImage('image/png', 128, 128)).toContain('128×128'); // 高解像度は未対応
  });
});

describe('interpretSkin (読み込んだ画素から、スキンとモデルを作る)', () => {
  it('64×64: そのまま使い、モデルは中身から推測する (素体は Classic、腕に絵が無ければ判断しない)', () => {
    const starter = createStarterPixels(getLayout('classic'));
    const out = interpretSkin(64, 64, starter);
    expect(out.pixels).toEqual(starter);
    expect(out.pixels).not.toBe(starter); // 複製を返す (元の配列を書き換えない)
    expect(out.model).toBe('classic');
    expect(interpretSkin(64, 64, createStarterPixels(getLayout('slim'))).model).toBe('slim');
    expect(interpretSkin(64, 64, new Uint8ClampedArray(64 * 64 * 4)).model).toBeNull();
  });

  it('64×32 (旧形式): 64×64 にして、Classic として読む', () => {
    const out = interpretSkin(64, 32, new Uint8ClampedArray(64 * 32 * 4).fill(255));
    expect(out.pixels).toHaveLength(64 * 64 * 4);
    expect(out.model).toBe('classic');
  });
});

describe('nameFromFileName', () => {
  it('拡張子を除いて、作品の名前にする', () => {
    expect(nameFromFileName('my skin.png')).toBe('my skin');
    expect(nameFromFileName('steve.v2.final.png')).toBe('steve.v2.final');
  });
  it('名前にできない場合 (空・拡張子だけ) は null', () => {
    expect(nameFromFileName('.png')).toBeNull();
    expect(nameFromFileName('   .png')).toBeNull();
  });
  it('長すぎる名前は切り詰められる', () => {
    expect([...nameFromFileName(`${'あ'.repeat(100)}.png`)!]).toHaveLength(40);
  });
});

describe('exportFileName', () => {
  it('作品の名前に .png を付ける (日本語もそのまま)', () => {
    expect(exportFileName('赤い服のスキン')).toBe('赤い服のスキン.png');
  });
  it('ファイル名に使えない文字は _ にする', () => {
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j.png');
  });
  it('先頭のドットは除く (隠しファイルにならないように)。空になれば skin', () => {
    expect(exportFileName('..hidden')).toBe('hidden.png');
    expect(exportFileName('...')).toBe('skin.png');
    expect(exportFileName('   ')).toBe('skin.png');
  });
  it('制御文字 (改行など) も置き換える', () => {
    expect(exportFileName('a\nb')).toBe('a_b.png');
  });
});
