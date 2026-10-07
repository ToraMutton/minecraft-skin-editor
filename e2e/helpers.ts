// E2Eテストで共通に使う道具
import type { Page } from '@playwright/test';

export const AUTOSAVE_KEY = 'vextora-mc-skin-editor-canvas';
export const UNREADABLE_BACKUP_KEY = 'vextora-mc-skin-editor-unreadable-backup';

// 64×64 のPNGを、ブラウザのcanvasで作ってデータURLで返す
// paint を省略すると完全に透明なPNG
export async function makeSkinDataUrl(page: Page, paint?: 'pattern'): Promise<string> {
  return page.evaluate(kind => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    if (kind === 'pattern') {
      // 全体を塗り分けた、見分けやすい模様
      for (let y = 0; y < 64; y += 4) {
        for (let x = 0; x < 64; x += 4) {
          ctx.fillStyle = `rgb(${x * 4}, ${y * 4}, ${(x + y) * 2})`;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    return c.toDataURL('image/png');
  }, paint);
}

// ブラウザに保存されているものを全部消す (localStorage と IndexedDB)
// 前のテストで保存された作品が、次のテストに影響しないようにするため
export async function clearStorage(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase('vextra');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
}

// 指定したスキン(データURL)が「昔の自動保存」として残っている状態でアプリを開く。省略すると透明なスキン
// (起動時にそれが最初の作品として取り込まれる。テストごとに同じ状態から始めるため)
export async function openWithSkin(page: Page, dataUrl?: string) {
  await page.goto('/');
  const skin = dataUrl ?? await makeSkinDataUrl(page);
  await clearStorage(page);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [AUTOSAVE_KEY, skin]);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900); // 起動時のカメラのアニメーション(0.6秒)が終わるのを待つ
}

// 3D表示の領域と、その中心
export async function viewerCenter(page: Page) {
  const box = (await page.getByTestId('skin-viewer').boundingBox())!;
  return { box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// スキン画像(64×64)の中で、塗られている(透明でない)ピクセルの一覧
export async function paintedPixels(page: Page): Promise<[number, number][]> {
  return page.getByTestId('skin-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, 64, 64).data;
    const out: [number, number][] = [];
    for (let p = 0; p < 4096; p++) if (d[p * 4 + 3]) out.push([p % 64, Math.floor(p / 64)]);
    return out;
  });
}

// ボタンを、表示されている文字か title で探す
export function button(page: Page, label: string) {
  return page.locator('button', { hasText: label }).or(page.locator(`button[title="${label}"]`)).first();
}

// マウスで (from) から順に points をなぞる。steps が少ないほど速く動かしたことになる
export async function drag(page: Page, points: [number, number][], steps: number) {
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...p, { steps });
  await page.mouse.up();
}
