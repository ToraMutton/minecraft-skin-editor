import { defineConfig } from '@playwright/test';

// E2Eテスト: 実際のブラウザでアプリを操作して確かめる (npm run test:e2e)
// ブラウザはパソコンに入っている Chrome を使う (Playwright用のブラウザをダウンロードしなくて済む)
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts', // Vitest のテスト (*.test.ts) と混ざらないように名前を分ける
  workers: 2, // 3D描画をソフトウェアで行うので重い。並列数は控えめに
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5180',
    channel: 'chrome',
    viewport: { width: 1440, height: 790 },
    // GPUの無い環境でもWebGL(3D表示)を動かすためのソフトウェア描画
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  // テストの前に開発サーバーを起動する (もう起動していればそれを使う)
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
  },
});
