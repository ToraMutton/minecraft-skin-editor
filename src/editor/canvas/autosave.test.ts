import { describe, it, expect } from 'vitest';
import { loadAutosave } from './autosave';
import type { ImageDecoder } from './autosave';

const PNG_URL = 'data:image/png;base64,AAAA';
const pixels64 = () => new Uint8ClampedArray(64 * 64 * 4).fill(7);

// 偽物の読み込み処理 (ブラウザが無くてもテストできるように)
const decodes = (width: number, height: number): ImageDecoder => async () => ({ width, height, pixels: pixels64() });
const fails: ImageDecoder = async () => { throw new Error('壊れた画像'); };

describe('自動保存の読み込み (V1からの移行)', () => {
  it('保存データが無ければ empty (初回起動)', async () => {
    expect(await loadAutosave(null, decodes(64, 64))).toEqual({ status: 'empty' });
    expect(await loadAutosave('', decodes(64, 64))).toEqual({ status: 'empty' });
  });

  it('64×64 の画像なら、その中身を返す', async () => {
    const result = await loadAutosave(PNG_URL, decodes(64, 64));
    expect(result.status).toBe('loaded');
    if (result.status === 'loaded') expect(result.pixels[0]).toBe(7);
  });

  it('画像として読めなければ unreadable (例外で止まらない)', async () => {
    expect((await loadAutosave(PNG_URL, fails)).status).toBe('unreadable');
  });

  it('画像のデータURLでなければ、読み込もうとせずに unreadable', async () => {
    let called = false;
    const spy: ImageDecoder = async () => { called = true; return { width: 64, height: 64, pixels: pixels64() }; };
    for (const bad of ['hello', '{"json": true}', 'https://example.com/a.png', 'data:text/plain,abc']) {
      expect((await loadAutosave(bad, spy)).status, bad).toBe('unreadable');
    }
    expect(called).toBe(false);
  });

  it('64×64 以外の大きさなら、引き伸ばさずに unreadable', async () => {
    for (const [w, h] of [[64, 32], [128, 128], [1, 1]]) {
      const result = await loadAutosave(PNG_URL, decodes(w, h));
      expect(result.status, `${w}×${h}`).toBe('unreadable');
    }
  });
});
