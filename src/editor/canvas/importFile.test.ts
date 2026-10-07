import { describe, it, expect } from 'vitest';
import { validateSkinImage, nameFromFileName, exportFileName } from './importFile';

describe('validateSkinImage', () => {
  it('64×64 の PNG なら問題なし (null)', () => {
    expect(validateSkinImage('image/png', 64, 64)).toBeNull();
  });
  it('PNG 以外は、種類の理由で断る', () => {
    for (const type of ['image/jpeg', 'image/gif', 'text/plain', '']) expect(validateSkinImage(type, 64, 64), type).toBe('PNG画像を選んでください');
  });
  it('大きさが違えば、引き伸ばさずに、選んだ画像の大きさを添えて断る', () => {
    expect(validateSkinImage('image/png', 128, 64)).toBe('64×64のスキン画像を選んでください (選択した画像: 128×64)');
    expect(validateSkinImage('image/png', 64, 32)).toContain('64×32'); // 旧形式 (64×32) のスキン
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
