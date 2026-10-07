import { test, expect } from '@playwright/test';
import {
  AUTOSAVE_KEY, UNREADABLE_BACKUP_KEY,
  openWithSkin, makeSkinDataUrl, viewerCenter, paintedPixels, button, drag, clearStorage, settledViewerShot, sameView,
} from './helpers';

test.describe('描画と Undo / Redo', () => {
  test('ペンで描いて、ボタンとキーボードの両方で Undo / Redo できる', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);

    await page.mouse.click(x, y);
    expect(await paintedPixels(page)).toHaveLength(1);

    await button(page, 'Undo').click();
    expect(await paintedPixels(page)).toHaveLength(0);
    await button(page, 'Redo').click();
    expect(await paintedPixels(page)).toHaveLength(1);

    await page.keyboard.press('Control+z');
    expect(await paintedPixels(page)).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');
    expect(await paintedPixels(page)).toHaveLength(1);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    expect(await paintedPixels(page)).toHaveLength(1);
  });

  test('同じ色のバケツを何回押しても、Undo は1回で元に戻る', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);

    await page.keyboard.press('f');
    for (let i = 0; i < 5; i++) await page.mouse.click(x, y + i * 3);
    expect(await paintedPixels(page)).toHaveLength(4096); // 透明な所がつながっているので全体が塗られる

    await button(page, 'Undo').click();
    expect(await paintedPixels(page)).toHaveLength(0);
    await expect(button(page, 'Undo')).toBeDisabled();
  });

  test('100回まで Undo できる', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);
    for (let i = 0; i < 105; i++) await page.mouse.click(x - 40 + (i % 7) * 12, y - 100 + Math.floor(i / 7) * 12);

    let count = 0;
    while (await button(page, 'Undo').isEnabled()) {
      await button(page, 'Undo').click();
      count++;
    }
    expect(count).toBe(100);
  });
});

test.describe('キーボードショートカット', () => {
  test('Ctrl+S / Ctrl+F ではツールが変わらず、S / W では変わる', async ({ page }) => {
    await openWithSkin(page);
    const selectedTool = () => page.locator('.vx-tools .vx-btn--selected').getAttribute('title');

    expect(await selectedTool()).toBe('ペン (W)');
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Control+f');
    expect(await selectedTool()).toBe('ペン (W)');
    await page.keyboard.press('s');
    expect(await selectedTool()).toBe('スポイト (S)');
    await page.keyboard.press('w');
    expect(await selectedTool()).toBe('ペン (W)');
  });
});

test.describe('読み込みと自動保存', () => {
  test('64×64 のPNGは読み込め、それ以外の大きさは理由を出して断る', async ({ page }) => {
    await openWithSkin(page);
    const input = page.locator('header input[type=file]');

    const skin = Buffer.from((await makeSkinDataUrl(page, 'pattern')).split(',')[1], 'base64');
    await input.setInputFiles({ name: 'skin.png', mimeType: 'image/png', buffer: skin });
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096);

    const big = Buffer.from((await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64; return c.toDataURL();
    })).split(',')[1], 'base64');
    const dialog = page.waitForEvent('dialog');
    await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
    const message = (await dialog).message();
    expect(message).toContain('64×64');
    expect(message).toContain('128×64');
  });

  test('描いてからリロードすると、自動保存から復元される', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);
    await page.keyboard.press('3');
    await page.mouse.click(x, y);
    const before = await paintedPixels(page);
    expect(before.length).toBeGreaterThan(0);

    await page.waitForTimeout(1300); // 自動保存は描いてから1秒後
    await page.reload();
    await expect.poll(() => paintedPixels(page)).toEqual(before);
  });

  test('壊れた自動保存データでも起動して描け、読めなかったデータは退避されて残る', async ({ page }) => {
    for (const broken of ['こんにちは', 'data:image/png;base64,AAAAAAAA', '{"layers":[1,2,3]}']) {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto('/');
      await clearStorage(page); // 前のデータで作られた作品が残っていると、昔のデータを見に行かないので毎回消す
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [AUTOSAVE_KEY, broken]);
      await page.reload();
      await page.waitForTimeout(900);

      const { x, y } = await viewerCenter(page);
      await page.mouse.click(x, y);
      expect(await paintedPixels(page), broken).not.toHaveLength(0);
      await page.waitForTimeout(1300); // 自動保存で上書きされた後も…
      expect(await page.evaluate(key => localStorage.getItem(key), UNREADABLE_BACKUP_KEY), broken).toBe(broken); // …退避は残る
      expect(errors, broken).toEqual([]);
      page.removeAllListeners('pageerror');
    }
  });
});

test.describe('なぞり描き', () => {
  test('速くなぞっても線が途切れない', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);
    await drag(page, [[x, y - 120], [x, y + 20]], 2); // 2回のマウス移動で縦に大きく動かす

    const rows = new Set((await paintedPixels(page)).map(p => p[1]));
    const span = Math.max(...rows) - Math.min(...rows) + 1;
    expect(rows.size).toBe(span); // すき間の行が無い
    expect(span).toBeGreaterThan(4);
  });
});

test.describe('3D表示', () => {
  test('ガイド表示を切り替えた直後でも、ドラッグで回転できる', async ({ page }) => {
    // 切り替えて1秒待ってから回した画面と、直後に回した画面が同じなら、カメラは引き戻されていない
    const rotateAfter = async (wait: number) => {
      await openWithSkin(page);
      const { box } = await viewerCenter(page);
      const before = await settledViewerShot(page); // 押す前に撮る (押した後に待つと、カメラのアニメーションが終わってしまい、「直後」にならない)
      await button(page, 'ガイド表示').click();
      await page.waitForTimeout(wait);
      const sx = box.x + box.width - 20, sy = box.y + box.height - 15;
      await drag(page, [[sx, sy], [sx - box.height / 4, sy]], 10);
      return { before, after: await settledViewerShot(page) };
    };
    const afterWait = await rotateAfter(1000);
    const immediately = await rotateAfter(0);
    expect(await sameView(page, afterWait.after, afterWait.before)).toBe(false); // ドラッグでちゃんと回っている (同じ画面同士の比較で、うっかり合格しないように)
    expect(await sameView(page, immediately.after, afterWait.after)).toBe(true);
  });
});

test.describe('素体スキン', () => {
  test('初めて起動したときは、素体が表示される (保存データなし)', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await page.waitForTimeout(900);

    const painted = await paintedPixels(page);
    // 素の層は全面が塗られている (上着の層は空)。素の層の面積は 64×64 のうち使われている部分
    expect(painted.length).toBeGreaterThan(1000);
    // 頭の正面 (8〜15, 8〜15) の目の位置が青い
    const iris = await page.getByTestId('skin-canvas').evaluate((c: HTMLCanvasElement) =>
      [...c.getContext('2d')!.getImageData(10, 12, 1, 1).data]);
    expect(iris).toEqual([47, 95, 208, 255]);
  });

  test('壊れた保存データで始めたときも、素体が表示される', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.evaluate(([key]) => localStorage.setItem(key, 'こんにちは'), [AUTOSAVE_KEY]);
    await page.reload();
    await page.waitForTimeout(900);
    expect((await paintedPixels(page)).length).toBeGreaterThan(1000);
  });

  test('「新規」は新しい素体の作品を作り、「全消し」は完全に透明にする。全消しは Undo で戻せる', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    page.on('dialog', d => d.accept());
    const patternCount = (await paintedPixels(page)).length;

    await button(page, '新規').click();
    await expect.poll(async () => (await paintedPixels(page)).length).not.toBe(patternCount);
    const starter = await paintedPixels(page);
    expect(starter.length).toBeGreaterThan(1000);

    await button(page, 'キャンバスを全消し').click();
    expect(await paintedPixels(page)).toHaveLength(0);
    await button(page, 'Undo').click(); // 全消し → 素体
    expect(await paintedPixels(page)).toEqual(starter);
    // 新しい作品なので、元の模様の作品の Undo 履歴には戻らない (作品ごとに履歴が分かれる)
    await expect(button(page, 'Undo')).toBeDisabled();
  });

  test('素体の上に描いても、Undo すれば素体のまま (素体は下地として守られる)', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await page.waitForTimeout(900);
    const before = await paintedPixels(page);

    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y);
    await button(page, 'Undo').click();
    expect(await paintedPixels(page)).toEqual(before);
  });
});

test.describe('作品の保存 (IndexedDB)', () => {
  // IndexedDB に入っている作品の数と、いちばん新しい作品の名前
  const storedProjects = (page: import('@playwright/test').Page) => page.evaluate(() => new Promise<{ count: number; names: string[] }>(resolve => {
    const open = indexedDB.open('vextra');
    open.onerror = () => resolve({ count: 0, names: [] });
    open.onupgradeneeded = () => { open.transaction!.abort(); resolve({ count: 0, names: [] }); }; // まだ無い
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('projects')) { db.close(); resolve({ count: 0, names: [] }); return; }
      const all = db.transaction('projects').objectStore('projects').getAll();
      all.onsuccess = () => { db.close(); resolve({ count: all.result.length, names: all.result.map(p => p.name) }); };
    };
  }));

  test('描くと IndexedDB に保存され、localStorage の昔のデータが書き換えられない', async ({ page }) => {
    await openWithSkin(page);
    const legacyBefore = await page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY);
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y);
    await expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });

    expect((await storedProjects(page)).count).toBe(1);
    // 昔のデータは読むだけで、書き換えも削除もしない (作品を失わないため)
    expect(await page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY)).toBe(legacyBefore);
  });

  test('リロードすると、IndexedDB から復元される (昔のデータを消しても同じ絵が戻る)', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);
    await page.keyboard.press('3');
    await page.mouse.click(x, y);
    await expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });
    const drawn = await paintedPixels(page);

    await page.evaluate(() => localStorage.clear()); // 昔のデータを消しても、IndexedDB から戻るはず
    await page.reload();
    await expect.poll(() => paintedPixels(page)).toEqual(drawn);
  });

  test('昔のデータは、最初の1回だけ作品として取り込まれる (リロードしても作品が増えない)', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    await expect.poll(async () => (await storedProjects(page)).count).toBe(1);
    await page.reload();
    await page.reload();
    await page.waitForTimeout(1200);
    const stored = await storedProjects(page);
    expect(stored.count).toBe(1);
    expect(stored.names).toEqual(['以前のスキン']);
  });

  test('「新規」で作品が増え、元の作品は残る。リロードすると新しい作品が開く', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    page.on('dialog', d => d.accept());
    await button(page, '新規').click();
    await expect.poll(async () => (await storedProjects(page)).count).toBe(2);
    await expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });
    const starter = await paintedPixels(page);

    await page.reload();
    await expect.poll(() => paintedPixels(page)).toEqual(starter); // 最後に更新した = 新しい素体の作品が開く
    expect((await storedProjects(page)).count).toBe(2);
  });

  test('保存状態の表示が、描くと「保存中」を経て「保存済み」になる', async ({ page }) => {
    await openWithSkin(page);
    await expect(page.locator('.vx-save--saved')).toBeVisible();
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y);
    await expect(page.locator('.vx-save--saving')).toBeVisible(); // 描いた直後は保存中の見た目
    await expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });
  });

  test('保存に失敗したら、失敗の表示が出る。押すと再試行して保存済みになる', async ({ page }) => {
    await openWithSkin(page);
    await expect(page.locator('.vx-save--saved')).toBeVisible();
    // 保存(put)を一時的に失敗させる: IndexedDB の書き込みを容量不足にする
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      (window as unknown as { __restorePut: () => void }).__restorePut = () => { IDBObjectStore.prototype.put = original; };
      IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); };
    });
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y);
    await expect(page.locator('.vx-save--error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.vx-save--error')).toContainText('容量');

    await page.evaluate(() => (window as unknown as { __restorePut: () => void }).__restorePut()); // 直った
    await page.locator('.vx-save--error').click();
    await expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });
  });

  test('保存先が開けなくても、編集はできる (警告が出る)', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); }); // IndexedDBが使えないブラウザ
    await page.goto('/');
    await page.waitForTimeout(900);
    await expect(page.locator('.vx-banner')).toContainText('保存');
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y);
    expect(await paintedPixels(page)).not.toHaveLength(0);
  });
});

test.describe('マイスキン (作品の一覧)', () => {
  type Page = import('@playwright/test').Page;
  const openProjects = async (page: Page) => {
    await button(page, 'マイスキン').click();
    await expect(page.getByRole('dialog', { name: 'マイスキン' })).toBeVisible();
  };
  const cards = (page: Page) => page.getByTestId('project-card');
  const cardOf = (page: Page, name: string) => cards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });
  const waitSaved = (page: Page) => expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });

  // 作品を2つ用意する: 1つ目はペンで1点描いた作品、2つ目は「新規」で作った素体の作品
  async function twoProjects(page: Page) {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    await waitSaved(page);
    page.once('dialog', d => void d.accept()); // 「新規」の確認ダイアログ
    await button(page, '新規').click();
    await expect.poll(async () => (await paintedPixels(page)).length).toBeGreaterThan(1000);
    await waitSaved(page);
  }

  test('開くと、作品が新しく更新した順に並び、今の作品に「編集中」と出る', async ({ page }) => {
    await twoProjects(page);
    await openProjects(page);
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText('編集中'); // 新しく作った素体の作品が先頭
    await expect(cards(page).first().getByRole('heading')).toHaveText('無題のスキン');
    await expect(cards(page).nth(1).getByRole('heading')).toHaveText('以前のスキン');
  });

  test('別の作品を開くと絵が切り替わり、Undo履歴は作品ごとに分かれる。リロードしても、その作品が開く', async ({ page }) => {
    await twoProjects(page);
    const starter = await paintedPixels(page);
    await openProjects(page);
    await cardOf(page, '以前のスキン').getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096); // 模様の作品 (全面)
    await expect(button(page, 'Undo')).toBeDisabled();

    await page.reload(); // 最後に開いた作品 (更新は古い方) が開く
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096);
    expect(await paintedPixels(page)).not.toEqual(starter);
  });

  test('開く前に描いた絵は、切り替えても失われず、戻ると残っている', async ({ page }) => {
    await twoProjects(page);
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y); // 素体の作品に1点描く (保存を待たずにすぐ切り替える)
    const drawn = await paintedPixels(page);
    await openProjects(page);
    await cardOf(page, '以前のスキン').getByRole('button', { name: '開く' }).click();
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096);

    await openProjects(page);
    await cardOf(page, '無題のスキン').getByRole('button', { name: '開く' }).click();
    await expect.poll(() => paintedPixels(page)).toEqual(drawn);
  });

  test('名前を変更できる。空の名前は断られ、開いている作品でも反映される', async ({ page }) => {
    await twoProjects(page);
    await openProjects(page);
    // 開いている作品 (無題のスキン) の名前を変える
    await cardOf(page, '無題のスキン').getByRole('button', { name: /名前を変更/ }).click();
    await page.getByLabel('作品の名前').fill('   ');
    await page.getByLabel('作品の名前').press('Enter');
    await expect(page.getByRole('alert')).toContainText('名前を入力');
    await page.getByLabel('作品の名前').fill('  青い服  のスキン ');
    await page.getByLabel('作品の名前').press('Enter');
    await expect(cardOf(page, '青い服 のスキン')).toHaveCount(1);
    await expect(cardOf(page, '青い服 のスキン')).toContainText('編集中');

    // 開いていない作品の名前を変える
    await cardOf(page, '以前のスキン').getByRole('button', { name: /名前を変更/ }).click();
    await page.getByLabel('作品の名前').fill('旧スキン');
    await page.getByRole('button', { name: '決定' }).click();
    await expect(cardOf(page, '旧スキン')).toHaveCount(1);

    // 閉じて開き直しても、リロードしても、名前は残る
    await page.reload();
    await openProjects(page);
    await expect(cards(page).getByRole('heading').allTextContents()).resolves.toEqual(['青い服 のスキン', '旧スキン']);
  });

  test('名前の変更は、Escで取り消せる (ダイアログは閉じない)', async ({ page }) => {
    await twoProjects(page);
    await openProjects(page);
    await cardOf(page, '無題のスキン').getByRole('button', { name: /名前を変更/ }).click();
    await page.getByLabel('作品の名前').fill('消えるはずの名前');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(cardOf(page, '無題のスキン')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('複製すると、同じ絵の「のコピー」ができ、元の作品はそのまま。複製は何度でもできる', async ({ page }) => {
    await twoProjects(page);
    await openProjects(page);
    await cardOf(page, '以前のスキン').getByRole('button', { name: /を複製/ }).click();
    await expect(cardOf(page, '以前のスキン のコピー')).toHaveCount(1);
    await cardOf(page, '以前のスキン').getByRole('button', { name: /を複製/ }).click();
    await expect(cardOf(page, '以前のスキン のコピー 2')).toHaveCount(1);
    await expect(cards(page)).toHaveCount(4);
    // 開いている作品は変わらない
    await expect(cardOf(page, '無題のスキン')).toContainText('編集中');

    await cardOf(page, '以前のスキン のコピー').getByRole('button', { name: '開く' }).click();
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096); // 元と同じ模様
  });

  test('削除は確認ダイアログが出て、「キャンセル」なら消えない。「OK」で消える', async ({ page }) => {
    await twoProjects(page);
    await openProjects(page);

    page.once('dialog', d => { expect(d.message()).toContain('以前のスキン'); void d.dismiss(); });
    await cardOf(page, '以前のスキン').getByRole('button', { name: /を削除/ }).click();
    await expect(cards(page)).toHaveCount(2); // キャンセルしたので残っている

    page.once('dialog', d => void d.accept());
    await cardOf(page, '以前のスキン').getByRole('button', { name: /を削除/ }).click();
    await expect(cards(page)).toHaveCount(1);
  });

  test('開いている作品を削除すると、残っている作品に切り替わり、消した作品が保存で復活しない', async ({ page }) => {
    await twoProjects(page);
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y); // 保存の予約を残した状態にする (これが復活の原因になりやすい)
    await openProjects(page);

    page.once('dialog', d => void d.accept());
    await cardOf(page, '無題のスキン').getByRole('button', { name: /を削除/ }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('編集中');
    await expect(cards(page).first().getByRole('heading')).toHaveText('以前のスキン');

    await page.waitForTimeout(2500); // 保存の予約が走るはずの時間を待つ
    await page.reload();
    await openProjects(page);
    await expect(cards(page)).toHaveCount(1); // 消した作品は復活していない
  });

  test('今の作品を保存できないときは、別の作品に切り替えず、理由を出す (保存できていない絵を失わない)', async ({ page }) => {
    await twoProjects(page);
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y); // 未保存の絵を作る
    const drawn = await paintedPixels(page);
    await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); }; }); // 以降の保存が失敗する

    await button(page, 'マイスキン').click();
    // 保存に失敗しているので、一覧を開いても反映できないが、画面は開く
    await expect(page.getByRole('dialog', { name: 'マイスキン' })).toBeVisible();
    await cardOf(page, '以前のスキン').getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('alert')).toContainText('切り替えられません');
    await expect(page.getByRole('dialog')).toBeVisible(); // 閉じない
    await page.keyboard.press('Escape');
    expect(await paintedPixels(page)).toEqual(drawn); // 描いた絵は、そのまま画面にある
    await expect(page.locator('.vx-save--error')).toBeVisible();
  });

  test('最後の1つを削除すると、新しい素体の作品が自動で作られる', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    await waitSaved(page);
    await openProjects(page);
    page.once('dialog', d => void d.accept());
    await cards(page).first().getByRole('button', { name: /を削除/ }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().getByRole('heading')).toHaveText('無題のスキン');
    expect((await paintedPixels(page)).length).toBeGreaterThan(1000);
    expect((await paintedPixels(page)).length).not.toBe(4096); // 素体になっている (模様ではない)
  });

  test('マイスキンを開いている間は、キーボードのショートカットが効かない。閉じると効く', async ({ page }) => {
    await openWithSkin(page);
    await openProjects(page);
    await page.keyboard.press('e'); // 消しゴム
    await expect(page.locator('.vx-tools .vx-btn--selected')).toHaveAttribute('title', 'ペン (W)');
    await page.keyboard.press('Escape');
    await page.keyboard.press('e');
    await expect(page.locator('.vx-tools .vx-btn--selected')).toHaveAttribute('title', '消しゴム (E)');
  });

  test('Tab キーのフォーカスが、ダイアログの外に出ない', async ({ page }) => {
    await openWithSkin(page);
    await openProjects(page);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    }
  });

  test('サムネイルに、作品の絵(正面)が描かれている', async ({ page }) => {
    await twoProjects(page);
    await openProjects(page);
    const filled = await cards(page).first().locator('canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, 16, 32).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    });
    expect(filled).toBeGreaterThan(200); // 素体の正面は、16×32のうち約 (8×8 + 16×12 + 8×12) ピクセル
  });
});
