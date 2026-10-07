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

// 2枚のスクリーンショットが「ほぼ同じ」か (3D描画には、色が1段階違う画素が数個出る程度のゆらぎがある)
async function nearlySame(page: Page, a: Buffer, b: Buffer, tolerancePixels = 50): Promise<boolean> {
  if (a.equals(b)) return true;
  const differing = await page.evaluate(async ([x, y]) => {
    const load = async (s: string) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const [ia, ib] = [await load(x), await load(y)];
    if (ia.width !== ib.width || ia.height !== ib.height) return Infinity;
    const read = (img: HTMLImageElement) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data;
    };
    const [da, db] = [read(ia), read(ib)];
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 8) n++; // 色差8以下は同じとみなす
    }
    return n;
  }, [a.toString('base64'), b.toString('base64')]);
  return differing <= tolerancePixels;
}

// 3D表示が落ち着く(アニメーションが終わる)まで待ってから、その画面を返す
// 固定の時間で待つと、PCが忙しいときにアニメーションの途中を撮ってしまうので、連続した2枚がほぼ同じになるまで待つ
export async function settledViewerShot(page: Page, timeoutMs = 8000): Promise<Buffer> {
  const viewer = page.getByTestId('skin-viewer');
  const deadline = Date.now() + timeoutMs;
  let previous = await viewer.screenshot();
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    const current = await viewer.screenshot();
    if (await nearlySame(page, current, previous)) return current;
    previous = current;
  }
  return previous;
}

// 2つの3D表示のスクリーンショットが「ほぼ同じ」か
export function sameView(page: Page, a: Buffer, b: Buffer) {
  return nearlySame(page, a, b);
}

// 「新規」メニューから、新しい作品を作る (素体 / 白紙)
export async function createNewProject(page: Page, how: '素体から' | '白紙から') {
  await button(page, '新規').click();
  await page.getByRole('menuitem', { name: new RegExp(how) }).click();
}
