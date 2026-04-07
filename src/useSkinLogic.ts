import { useState, useRef, useCallback, useEffect } from 'react';
import type { Tool, BrushSize } from './skinUtils';
import {
  MAX_HISTORY, MAX_RECENT_COLORS, AUTOSAVE_KEY, AUTOSAVE_DELAY,
  hexToRgba, rgbaToHex, getMirrorCoord
} from './skinUtils';

export function useSkinLogic(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onTextureUpdate?: () => void
) {
  // 描画ツール系
  const [color, setColor] = useState('#000000') // 現在の色
  const [tool, setTool] = useState<Tool>('pen') // 現在のツール
  const [brushSize, setBrushSize] = useState<BrushSize>(1) // ブラシサイズ

  // 表示設定系
  const [mirror, setMirror] = useState(false) // ミラー

  // UI状態系
  const [isDrawing, setIsDrawing] = useState(false) // 描画中かどうか
  const [canUndo, setCanUndo] = useState(false) // Undo可能か
  const [canRedo, setCanRedo] = useState(false) // Redo可能か
  const [recentColors, setRecentColors] = useState<string[]>([]) //最近の色

  // 裏のメモ帳
  const undoStack = useRef<ImageData[]>([]) // Undo履歴
  const redoStack = useRef<ImageData[]>([]) // Redo履歴
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 自動保存タイマー

  // 3Dプレビューにテクスチャ変更を通知 + 自動保存
  const notifyUpdate = useCallback(() => {
    // 親コンポーネントに変更を通知
    onTextureUpdate?.();

    // 自動保存(デバウンス)
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current); // 前回のタイマーをキャンセル
    }

    // 新しくタイマーをセット(1000ミリ秒後に実行)
    autosaveTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          // キャンバスの内容を画像としてブラウザに保存
          localStorage.setItem(AUTOSAVE_KEY, canvas.toDataURL('image/png'));
        } catch {
          /* localStorageが満杯の場合は無視 */
        }
      }
    }, AUTOSAVE_DELAY);
  }, [onTextureUpdate, canvasRef]);

  // 起動時にlocalStorageからキャンバスを復元
  useEffect(() => {
    // localStorageをチェック
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return;

    // キャンバスを準備
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 画像を読み込む
    const img = new Image(); // 空の画像オブジェクトを作成
    img.onload = () => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      onTextureUpdate?.();
    };
    img.src = saved;
  }, [onTextureUpdate, canvasRef]);

  // --- 履歴操作 ---

  // 現在の状態をUndo履歴に保存する関数
  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 状態を履歴に積む
    undoStack.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    );

    // 履歴が30件を超えたら古いものを削除
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();

    // 新しく描くとredoStackを空に
    redoStack.current = [];
    // ボタンの状態を更新
    setCanUndo(true);
    setCanRedo(false);
  }, [canvasRef]);

  // Undo履歴を使って1つ前に戻る
  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // undoStackが空なら何もしない
    if (undoStack.current.length === 0) return;

    // 現在の状態をredoStackに積む
    redoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    // undoStackから1つ取り出してcanvasに反映
    ctx.putImageData(undoStack.current.pop()!, 0, 0);

    // ボタンの状態を更新
    // まだundoStackに履歴があればtrueのまま、なければfalse
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    notifyUpdate();
  }, [canvasRef, notifyUpdate]);

  // Redo履歴を使って1つ先に進む
  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (redoStack.current.length === 0) return;

    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoStack.current.pop()!, 0, 0);

    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    notifyUpdate();
  }, [canvasRef, notifyUpdate]);

  // --- 最近使った色 ---

  const addRecentColor = useCallback((c: string) => {
    setRecentColors(prev => {
      // prevの中からcと違う色だけ残す
      const filtered = prev.filter(e => e !== c);
      // 配列を展開し、1つの配列にまとめる
      return [c, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);

  // --- バケツ ---

  const floodFill = useCallback((startX: number, startY: number, fillColor: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height); // putImageDataで再利用するため
    const data = imageData.data; // ピクセルの読み書き用
    const fill = hexToRgba(fillColor);

    // クリックした座標からdata配列のインデックスを計算
    const idx = (startY * width + startX) * 4;
    // クリックした座標の色を取得
    const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];
    // クリックした色と塗りたい色が同じなら何もしない
    if (tR === fill.r && tG === fill.g && tB === fill.b && tA === fill.a) return;

    // ---

    // キューにクリックした座標をいれて開始
    const queue: [number, number][] = [[startX, startY]];

    // 64 × 64 = 4096個の0が並んだ配列
    // 0 → まだ訪れていない
    // 1 → 既に訪れた
    const visited = new Uint8Array(width * height);

    // キューが空になるまで繰り返す
    while (queue.length > 0) {
      // 先端の座標を取り出す
      const [cx, cy] = queue.pop()!;

      // キャンバス範囲外チェック
      if (cx < 0 || cx >= 64 || cy < 0 || cy >= 64) continue;
      // 訪問済みチェック
      const pos = cy * width + cx; // visited配列用に2次元座標を1次元インデックスに変換
      if (visited[pos]) continue; // 0 → Falsy, 1 → Truthy
      visited[pos] = 1; // 訪れた印をつける(1を代入)

      // 色チェック
      const i = pos * 4;
      // クリックした色と違う色なら次のループへ
      if (data[i] !== tR || data[i + 1] !== tG || data[i + 2] !== tB || data[i + 3] !== tA) continue;

      // 塗る
      data[i] = fill.r
      data[i + 1] = fill.g
      data[i + 2] = fill.b
      data[i + 3] = fill.a

      // 右、左、下、上をキューに追加して次のループで処理
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  }, [canvasRef]);

  // --- スポイト ---

  const pickColor = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1ピクセルだけ取得
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    // 透明なら無視
    if (pixel[3] === 0) return;
    const hex = rgbaToHex(pixel[0], pixel[1], pixel[2]);

    // 状態を更新
    setColor(hex); // 現在の色を変更
    addRecentColor(hex); // 最近使った色に追加
    setTool('pen'); // penに自動切り替え
  };

  // --- 描画(ブラシサイズ＆ミラー対応) ---

  // 1点を中心にブラスサイズ分のピクセルを塗る
  const applyToolAt = useCallback((x: number, y: number, ctx: CanvasRenderingContext2D) => {
    // ブラシサイズの半径
    const half = Math.floor(brushSize / 2);

    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = x + dx, py = y + dy;
        // キャンバス外なら次のループへ
        if (px < 0 || px >= 64 || py < 0 || py >= 64) continue;

        if (tool === 'eraser') {
          ctx.clearRect(px, py, 1, 1); // 消しゴム: 透明にする
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(px, py, 1, 1); // 1×1ピクセルを塗る
        }
      }
    }
  }, [tool, color, brushSize]);

  // ミラーも考慮して塗るver
  const applyTool = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    applyToolAt(x, y, ctx);

    // ミラー描画
    if (mirror) {
      const half = Math.floor(brushSize / 2);

      for (let dy = -half; dy < brushSize - half; dy++) {
        for (let dx = -half; dx < brushSize - half; dx++) {
          const px = x + dx, py = y + dy;
          // ミラー先座標を取得
          const mc = getMirrorCoord(px, py);

          // ミラー先座標が存在する場合だけ
          if (mc) {
            if (tool === 'eraser') {
              ctx.clearRect(mc[0], mc[1], 1, 1);
            } else {
              ctx.fillStyle = color;
              ctx.fillRect(mc[0], mc[1], 1, 1);
            }
          }
        }
      }
    }
  }, [canvasRef, applyToolAt, mirror, brushSize, tool, color]);

  // --- 全消し ---

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndo(); // 消す前の状態を履歴に保存
    ctx.clearRect(0, 0, 64, 64); // キャンバス全体を透明に
    notifyUpdate(); // 3Dプレビューに通知
  }, [canvasRef, pushUndo, notifyUpdate]);

  // --- 新規作成 ---

  const newCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndo();
    ctx.clearRect(0, 0, 64, 64);
    localStorage.removeItem(AUTOSAVE_KEY); // オートセーブのデータも削除
    notifyUpdate();
  }, [canvasRef, pushUndo, notifyUpdate]);

  // --- PNG保存 ---

  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 画像保存をブラウザだけで完結させる流れ
    const link = document.createElement('a'); // aタグを動的に作成
    link.download = 'NewSkin.png'; // ダウンロードファイル名を設定
    link.href = canvas.toDataURL('image/png'); // キャンバスをPNG形式の文字列に変換
    link.click(); // プログラムからクリックしてダウンロード開始
  }, [canvasRef]);

  // --- 画像インポート ---

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; // 選ばれたファイルが複数の場合でも最初の1枚を対象にする
    if (!file) return; // ファイルがなければ終了

    const img = new Image(); // ブラウザ組み込みの画像オブジェクトを作成

    // 画像読み込みが完了したら実行
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      pushUndo();
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      notifyUpdate();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = ''; // 同じファイルを再度選べるようにリセット
  }, [canvasRef, pushUndo, notifyUpdate]);

  return {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newCanvas, downloadImage, handleImport
  };
}
