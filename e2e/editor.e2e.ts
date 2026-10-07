import { test, expect } from '@playwright/test';
import {
  AUTOSAVE_KEY, UNREADABLE_BACKUP_KEY,
  openWithSkin, makeSkinDataUrl, viewerCenter, paintedPixels, button, drag,
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
      await page.evaluate(([key, value]) => { localStorage.clear(); localStorage.setItem(key, value); }, [AUTOSAVE_KEY, broken]);
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
      await button(page, 'ガイド表示').click();
      await page.waitForTimeout(wait);
      const before = await page.getByTestId('skin-viewer').screenshot();
      const sx = box.x + box.width - 20, sy = box.y + box.height - 15;
      await drag(page, [[sx, sy], [sx - box.height / 4, sy]], 10);
      await page.waitForTimeout(1000);
      return { before, after: await page.getByTestId('skin-viewer').screenshot() };
    };
    const afterWait = await rotateAfter(1000);
    const immediately = await rotateAfter(0);
    expect(afterWait.after.equals(afterWait.before)).toBe(false); // ドラッグでちゃんと回っている (同じ画面同士の比較で、うっかり合格しないように)
    expect(immediately.after.equals(afterWait.after)).toBe(true);
  });
});
