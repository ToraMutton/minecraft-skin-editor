import { test, expect } from '@playwright/test';
import {
  AUTOSAVE_KEY, UNREADABLE_BACKUP_KEY, LAST_OPENED_KEY,
  openWithSkin, makeSkinDataUrl, viewerCenter, paintedPixels, button, drag, clearStorage, settledViewerShot, sameView, createNewProject, addProject,
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
    const input = page.getByLabel('今のスキンに読み込むPNG');

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

  test('マウスを乗せると、その面と塗られるピクセルが強調され、外に出すと消える (描かれはしない)', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);
    const before = await settledViewerShot(page);

    await page.mouse.move(x, y);
    const hovered = await settledViewerShot(page);
    expect(await sameView(page, hovered, before)).toBe(false);
    expect(await paintedPixels(page)).toHaveLength(0);

    await page.mouse.move(5, 5); // 3D表示の外 (ヘッダーの左上)
    expect(await sameView(page, await settledViewerShot(page), before)).toBe(true);
  });

  test('マウスを動かさなくても、ブラシを太くすると強調が広がる', async ({ page }) => {
    await openWithSkin(page);
    const { x, y } = await viewerCenter(page);
    await page.mouse.move(x, y);
    const size1 = await settledViewerShot(page);

    await page.keyboard.press('3');
    expect(await sameView(page, await settledViewerShot(page), size1)).toBe(false);
  });

  test('ガイド表示が off でも、塗られるピクセルの印は出る', async ({ page }) => {
    await openWithSkin(page);
    await button(page, 'ガイド表示').click();
    await page.mouse.move(5, 5); // スイッチの上からマウスをどかしておく
    const before = await settledViewerShot(page);

    const { x, y } = await viewerCenter(page);
    await page.mouse.move(x, y);
    expect(await sameView(page, await settledViewerShot(page), before)).toBe(false);
  });
});

test.describe('モード切り替えボタン', () => {
  test('今のモードと、押すと切り替わる先が分かる。切り替えてもボタンの幅は変わらない', async ({ page }) => {
    await openWithSkin(page);
    const editButton = page.getByRole('button', { name: '編集モード', exact: true });
    await expect(editButton).toHaveAttribute('title', 'クリックでアニメーションモードへ');
    const width = (await editButton.boundingBox())!.width;

    await editButton.click();
    const poseButton = page.getByRole('button', { name: 'アニメーションモード', exact: true });
    await expect(poseButton).toHaveAttribute('title', 'クリックで編集モードへ');
    expect((await poseButton.boundingBox())!.width).toBe(width);

    await poseButton.click();
    await expect(editButton).toBeVisible();
  });

  test('アニメーションモードでは、モデルを押しても描かれない', async ({ page }) => {
    await openWithSkin(page);
    await page.getByRole('button', { name: '編集モード', exact: true }).click();
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y);
    expect(await paintedPixels(page)).toHaveLength(0);
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
    const patternCount = (await paintedPixels(page)).length;

    await createNewProject(page, '素体から');
    await expect.poll(async () => (await paintedPixels(page)).length).not.toBe(patternCount);
    const starter = await paintedPixels(page);
    expect(starter.length).toBeGreaterThan(1000);

    page.once('dialog', d => void d.accept()); // 「全消しますか？」の確認
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
    await createNewProject(page, '素体から');
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
    await createNewProject(page, '素体から');
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

test.describe('「新規」メニューと書き出し', () => {
  type Page = import('@playwright/test').Page;
  const waitSaved = (page: Page) => expect(page.locator('.vx-save--saved')).toBeVisible({ timeout: 5000 });
  const projectNames = async (page: Page) => {
    await button(page, 'マイスキン').click();
    await expect(page.getByRole('dialog', { name: 'マイスキン' })).toBeVisible();
    await expect(page.getByTestId('project-card').first()).toBeVisible(); // 一覧の読み込み(非同期)が終わるまで待つ。待たないと空に見える
    const names = await page.getByTestId('project-card').getByRole('heading').allTextContents();
    await page.keyboard.press('Escape');
    return names;
  };
  const pngFile = async (page: Page, size: number, name = 'skin.png', paint = true) => ({
    name, mimeType: 'image/png',
    buffer: Buffer.from((await page.evaluate(([n, p]) => {
      const c = document.createElement('canvas'); c.width = c.height = n as number;
      if (p) { const g = c.getContext('2d')!; g.fillStyle = '#ff00aa'; g.fillRect(0, 0, n as number, n as number); }
      return c.toDataURL('image/png');
    }, [size, paint] as const)).split(',')[1], 'base64'),
  });

  test('「新規」を押すと、素体から / 白紙から / PNGから / Quick Design(準備中) が並ぶ', async ({ page }) => {
    await openWithSkin(page);
    await button(page, '新規').click();
    await expect(page.getByRole('menuitem')).toHaveCount(4);
    await expect(page.getByRole('menuitem', { name: /素体から/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /白紙から/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /PNGから/ })).toBeVisible();
    const quick = page.getByRole('menuitem', { name: /Quick Design/ });
    await expect(quick).toHaveAttribute('aria-disabled', 'true');
    await expect(quick).toContainText('準備中');
  });

  test('Quick Design は押しても何も起きない (メニューも閉じず、作品も増えない)', async ({ page }) => {
    await openWithSkin(page);
    await waitSaved(page);
    await button(page, '新規').click();
    await page.getByRole('menuitem', { name: /Quick Design/ }).click({ force: true });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await projectNames(page)).toHaveLength(1);
  });

  test('メニューは、外をクリックしても、Escでも閉じる。矢印キーで項目を移動でき、Escの後はボタンにフォーカスが戻る', async ({ page }) => {
    await openWithSkin(page);
    await button(page, '新規').click();
    await expect(page.getByRole('menuitem', { name: /素体から/ })).toBeFocused(); // 開いたら最初の項目にフォーカス
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: /白紙から/ })).toBeFocused();
    await page.keyboard.press('ArrowDown'); // PNGから
    await page.keyboard.press('ArrowDown'); // Quick Design (使えない) を飛ばして、先頭(モデルの行の Classic)に戻る
    await expect(page.getByRole('menuitemradio', { name: /Classic/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: /素体から/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(button(page, '新規')).toBeFocused();

    await button(page, '新規').click();
    await page.mouse.click(700, 400); // 3D表示のあたり (メニューの外)
    await expect(page.getByRole('menu')).toBeHidden();
  });

  test('「素体から」は、確認なしで、重ならない名前の新しい素体の作品を作る', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    await waitSaved(page);
    let dialogs = 0;
    page.on('dialog', d => { dialogs++; void d.accept(); });
    await createNewProject(page, '素体から');
    await expect.poll(async () => (await paintedPixels(page)).length).toBeGreaterThan(1000);
    await waitSaved(page);
    await createNewProject(page, '素体から');
    await waitSaved(page);
    expect(dialogs).toBe(0); // 確認ダイアログは出ない
    expect(await projectNames(page)).toEqual(['無題のスキン 2', '無題のスキン', '以前のスキン']);
  });

  test('「白紙から」は、完全に透明な新しい作品を作り、元の作品は残る', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    await waitSaved(page);
    await createNewProject(page, '白紙から');
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(0);
    await waitSaved(page);
    expect(await projectNames(page)).toEqual(['無題のスキン', '以前のスキン']);
    // リロードしても白紙の作品が開く
    await page.reload();
    await page.waitForTimeout(900);
    expect(await paintedPixels(page)).toHaveLength(0);
  });

  test('「PNGから」は、PNGを下地にした新しい作品を、ファイル名を付けて作る', async ({ page }) => {
    await openWithSkin(page);
    await waitSaved(page);
    await button(page, '新規').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /PNGから/ }).click();
    await (await chooser).setFiles(await pngFile(page, 64, 'ピンクの服.png'));
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096);
    await waitSaved(page);
    expect(await projectNames(page)).toEqual(['ピンクの服', '以前のスキン']);
  });

  test('「PNGから」で、64×64でない画像・PNGでないファイルは、理由を出して断り、作品は増えない', async ({ page }) => {
    await openWithSkin(page);
    await waitSaved(page);
    const input = page.getByLabel('新しいスキンにするPNG');
    const messages: string[] = [];
    page.on('dialog', d => { messages.push(d.message()); void d.accept(); });

    await input.setInputFiles(await pngFile(page, 32, 'small.png'));
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain('32×32');
    await input.setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a png') });
    await expect.poll(() => messages.length).toBe(2);
    expect(messages[1]).toContain('PNG');
    await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('これは壊れたPNG') });
    await expect.poll(() => messages.length).toBe(3);
    expect(messages[2]).toContain('読み込めません');

    expect(await projectNames(page)).toHaveLength(1);
  });

  test('「読込」は今の作品を置き換え (Undoで戻せる)、「新規→PNGから」と違って作品は増えない', async ({ page }) => {
    await openWithSkin(page);
    await waitSaved(page);
    const before = await paintedPixels(page);
    await page.getByLabel('今のスキンに読み込むPNG').setInputFiles(await pngFile(page, 64));
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096);
    expect(await projectNames(page)).toHaveLength(1);
    await button(page, 'Undo').click();
    expect(await paintedPixels(page)).toEqual(before);
  });

  test('今の作品を保存できないときは、新しい作品を作らず、理由を出す', async ({ page }) => {
    await openWithSkin(page);
    await waitSaved(page);
    const { x, y } = await viewerCenter(page);
    await page.mouse.click(x, y); // 未保存の絵
    const drawn = await paintedPixels(page);
    await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    // alert が開くと、クリックの完了待ちも止まるので、ダイアログは先に受け付ける準備をしておく (閉じるのと並行して進める)
    const shown: string[] = [];
    page.once('dialog', d => { shown.push(d.message()); void d.accept(); });
    await createNewProject(page, '白紙から');
    await expect.poll(() => shown.length).toBe(1);
    expect(shown[0]).toContain('保存できなかった');
    expect(await paintedPixels(page)).toEqual(drawn); // 描いた絵は、そのまま
  });

  test('ヘッダーのボタンは「書き出し」で、作品の名前の PNG がダウンロードされる (中身は画面と同じ)', async ({ page }) => {
    await openWithSkin(page, await makeSkinDataUrl(page, 'pattern'));
    await waitSaved(page);
    await expect(page.locator('.vx-header').getByRole('button', { name: '保存', exact: true })).toHaveCount(0); // 「保存」ボタンは無い
    const download = page.waitForEvent('download');
    await button(page, '書き出し').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('以前のスキン.png');

    // ダウンロードしたPNGは、64×64 で、画面のスキンと同じピクセル
    const bytes = (await (await import('node:fs/promises')).readFile((await file.path())!)).toString('base64');
    const same = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
      const exported = g.getImageData(0, 0, c.width, c.height).data;
      const screen = (document.querySelector('[data-testid=skin-canvas]') as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 64, 64).data;
      return img.width === 64 && img.height === 64 && exported.every((v, i) => v === screen[i]);
    }, bytes);
    expect(same).toBe(true);
  });

  test('作品の名前を変えると、書き出すファイル名も変わる (使えない文字は _ になる)', async ({ page }) => {
    await openWithSkin(page);
    await waitSaved(page);
    await button(page, 'マイスキン').click();
    await page.getByRole('button', { name: /名前を変更/ }).click();
    await page.getByLabel('作品の名前').fill('a/b:c');
    await page.getByLabel('作品の名前').press('Enter');
    await expect(page.getByRole('heading', { name: 'a/b:c' })).toBeVisible();
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await button(page, '書き出し').click();
    expect((await download).suggestedFilename()).toBe('a_b_c.png');
  });
});

test.describe('Slim モデルの作品', () => {
  type Page = import('@playwright/test').Page;

  // マイスキンから、名前で作品を開く
  const openByName = async (page: Page, name: string) => {
    await button(page, 'マイスキン').click();
    await page.getByTestId('project-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForTimeout(300); // 3Dの腕の形が切り替わるのを待つ
  };

  // 上着を全部隠して、素の層(下の層)に描けるようにする (上着は腕と胴体で少し重なるので、境目の判定が揺れる)
  const paintBaseLayer = (page: Page) => button(page, '上着をすべて切り替え').click();

  // 3D表示の中心(胴体)から左右に、腕の正面を横切ってなぞる。そのとき塗られた、腕の正面の列 (x) の一覧
  // 正面から見ると腕の正面だけが見える (側面は裏を向いている)。右腕の正面は展開図の x=44〜、左腕の正面は x=36〜
  const armFrontColumns = async (page: Page) => {
    const { box, x, y } = await viewerCenter(page);
    await drag(page, [[x, y], [box.x + 5, y]], 120); // 画面の左 = キャラの右腕
    await drag(page, [[x, y], [box.x + box.width - 5, y]], 120); // 画面の右 = キャラの左腕
    const pixels = await paintedPixels(page);
    const columns = (from: number, to: number, rows: [number, number]) =>
      [...new Set(pixels.filter(([px, py]) => px >= from && px <= to && py >= rows[0] && py <= rows[1]).map(([px]) => px))].sort((a, b) => a - b);
    return { right: columns(44, 55, [20, 31]), left: columns(36, 47, [52, 63]) };
  };

  test('Classic の腕は幅4、Slim の作品を開くと腕が幅3になる (3Dの腕の形が切り替わる)', async ({ page }) => {
    await openWithSkin(page);
    await paintBaseLayer(page);
    await addProject(page, { name: 'Slimの作品', model: 'slim' });
    await addProject(page, { name: 'Classicの作品', model: 'classic' });

    await openByName(page, 'Classicの作品');
    expect(await armFrontColumns(page)).toEqual({ right: [44, 45, 46, 47], left: [36, 37, 38, 39] });

    await openByName(page, 'Slimの作品');
    expect(await armFrontColumns(page)).toEqual({ right: [44, 45, 46], left: [36, 37, 38] });

    await openByName(page, 'Classicの作品'); // 戻すと、また幅4
    expect(await armFrontColumns(page)).toEqual({ right: [44, 45, 46, 47], left: [36, 37, 38, 39] });
  });

  test('リロードしても Slim のまま開く (起動時に腕の形が合う)', async ({ page }) => {
    await openWithSkin(page);
    const id = await addProject(page, { name: 'Slimの作品', model: 'slim' });
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LAST_OPENED_KEY, id]); // 次の起動で、この作品を開く
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    await paintBaseLayer(page);
    expect(await armFrontColumns(page)).toEqual({ right: [44, 45, 46], left: [36, 37, 38] });
  });

  // --- 「新規」メニューで、モデルを選んで作る ---

  const modelRadio = (page: Page, model: 'Classic' | 'Slim') => page.getByRole('menuitemradio', { name: new RegExp(model) });
  const openNewMenu = async (page: Page) => { await button(page, '新規').click(); await expect(page.getByRole('menu')).toBeVisible(); };
  // マイスキンで見える、今開いている作品のモデル表示 (「編集中」の付いたカード)
  const currentModelLabel = async (page: Page) => {
    await button(page, 'マイスキン').click();
    const card = page.getByTestId('project-card').filter({ hasText: '編集中' });
    const label = await card.locator('.vx-project-model').innerText();
    await page.keyboard.press('Escape');
    return label;
  };

  test('「新規」メニューのモデルは、初めは Classic。Slim を選んでもメニューは閉じず、選んだほうに印が付く', async ({ page }) => {
    await openWithSkin(page);
    await openNewMenu(page);
    await expect(modelRadio(page, 'Classic')).toHaveAttribute('aria-checked', 'true');
    await expect(modelRadio(page, 'Slim')).toHaveAttribute('aria-checked', 'false');

    await modelRadio(page, 'Slim').click();
    await expect(page.getByRole('menu')).toBeVisible(); // 閉じない (続けて作り方を選ぶため)
    await expect(modelRadio(page, 'Slim')).toHaveAttribute('aria-checked', 'true');
    await expect(modelRadio(page, 'Classic')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('menuitem')).toHaveCount(4); // 作り方の項目は、これまでどおり4つ
  });

  test('Slim を選んで「素体から」: Slim の作品ができる (腕が幅3、マイスキンにも Slim と出る)', async ({ page }) => {
    await openWithSkin(page);
    await openNewMenu(page);
    await modelRadio(page, 'Slim').click();
    await page.getByRole('menuitem', { name: /素体から/ }).click();
    // 素体は、腕の展開図に合わせて塗られる。右腕の背面は Slim なら x=51〜53 (Classic は 52〜55 なので、x=55 が塗られていない)
    const has = (pixels: [number, number][], x: number, y: number) => pixels.some(([px, py]) => px === x && py === y);
    const pixels = await paintedPixels(page);
    expect(has(pixels, 53, 25)).toBe(true);
    expect(has(pixels, 55, 25)).toBe(false);
    expect(await currentModelLabel(page)).toBe('Slim');
  });

  test('「白紙から」も、選んだモデルで作られる。Classic に戻して作ると Classic', async ({ page }) => {
    await openWithSkin(page);
    await openNewMenu(page);
    await modelRadio(page, 'Slim').click();
    await page.getByRole('menuitem', { name: /白紙から/ }).click();
    expect(await currentModelLabel(page)).toBe('Slim');

    await openNewMenu(page);
    await modelRadio(page, 'Classic').click();
    await page.getByRole('menuitem', { name: /白紙から/ }).click();
    expect(await currentModelLabel(page)).toBe('Classic');
    await paintBaseLayer(page);
    expect(await armFrontColumns(page)).toEqual({ right: [44, 45, 46, 47], left: [36, 37, 38, 39] });
  });

  test('「PNGから」も、選んだモデルで作られる', async ({ page }) => {
    await openWithSkin(page);
    await openNewMenu(page);
    await modelRadio(page, 'Slim').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /PNGから/ }).click();
    const png = Buffer.from((await makeSkinDataUrl(page, 'pattern')).split(',')[1], 'base64');
    await (await chooser).setFiles({ name: 'slim.png', mimeType: 'image/png', buffer: png });
    await expect.poll(async () => (await paintedPixels(page)).length).toBe(4096);
    expect(await currentModelLabel(page)).toBe('Slim');
  });

  test('選んだモデルは、リロードしても覚えている (次の「新規」も同じモデル)', async ({ page }) => {
    await openWithSkin(page);
    await openNewMenu(page);
    await modelRadio(page, 'Slim').click();
    await page.keyboard.press('Escape');

    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await openNewMenu(page);
    await expect(modelRadio(page, 'Slim')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('menuitem', { name: /白紙から/ }).click();
    expect(await currentModelLabel(page)).toBe('Slim');
  });

  test('キーボードだけでモデルを選べる (↑で項目の上のモデルへ、Enterで選ぶ)', async ({ page }) => {
    await openWithSkin(page);
    await openNewMenu(page);
    await expect(page.getByRole('menuitem', { name: /素体から/ })).toBeFocused(); // 開いた直後は、これまでどおり「素体から」
    await page.keyboard.press('ArrowUp'); // 上のモデルの行へ (右端の Slim)
    await expect(modelRadio(page, 'Slim')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(modelRadio(page, 'Slim')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(modelRadio(page, 'Classic')).toBeFocused();
  });
});
