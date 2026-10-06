import { useState, useRef, useCallback, useEffect } from 'react';
import type { Tool, BrushSize } from './tools';
import { MAX_HISTORY, MAX_RECENT_COLORS, AUTOSAVE_KEY, AUTOSAVE_DELAY } from './constants';
import { createLayers, cloneLayers } from './layers';
import type { SkinLayers } from './layers';
import { paintPixel, erasePixel, brushPixels, floodFill as floodFillLayers, pickColor as pickLayerColor } from './operations';
import { imageToPixels, renderToCanvas } from './image';
import { History } from './history';
import { hexToRgba, rgbaToHex } from '../../shared/color';

// スキン画像の編集・Undo/Redo・自動保存・読み込み/書き出しをまとめたhook
//
// データの本体は layersRef の3つの層 (下地・手描き・消去マスク)。
// canvasRef の <canvas> は、層を重ねた見た目を書き込む「表示先」で、
// 3D表示のテクスチャ・PNG書き出し・自動保存はこの canvas を使う
export function useSkinCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
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
  const layersRef = useRef<SkinLayers>(createLayers()) // スキンのデータ本体
  const history = useRef(new History<SkinLayers>(MAX_HISTORY)) // Undo/Redo履歴 (層の複製を積む)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 自動保存タイマー

  // 層を書き換えたら呼ぶ: 見た目を canvas に反映する
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) renderToCanvas(canvas, layersRef.current);
  }, [canvasRef]);

  // 描いた後に呼ぶ: 自動保存を予約する
  const notifyUpdate = useCallback(() => {
    // 自動保存(デバウンス)
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current); // 前回のタイマーをキャンセル
    }

    // 新しくタイマーをセット(1000ミリ秒後に実行)
    autosaveTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          // 見た目(合成結果)を画像としてブラウザに保存
          localStorage.setItem(AUTOSAVE_KEY, canvas.toDataURL('image/png'));
        } catch {
          /* localStorageが満杯の場合は無視 */
        }
      }
    }, AUTOSAVE_DELAY);
  }, [canvasRef]);

  // 起動時にlocalStorageから復元する (保存されている画像を下地にする)
  useEffect(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return;

    const img = new Image();
    img.onload = () => {
      layersRef.current = createLayers(imageToPixels(img));
      render();
    };
    img.src = saved;
  }, [render]);

  // --- 履歴操作 ---

  // Undo/Redo ボタンの状態を履歴に合わせる
  const syncHistoryButtons = useCallback(() => {
    setCanUndo(history.current.canUndo);
    setCanRedo(history.current.canRedo);
  }, []);

  // 変更する前に呼ぶ: 履歴に積む (snapshot を省略すると、今の状態を積む)
  const pushUndo = useCallback((snapshot: SkinLayers = cloneLayers(layersRef.current)) => {
    history.current.push(snapshot);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  // 1つ前に戻る
  const handleUndo = useCallback(() => {
    const previous = history.current.undo(layersRef.current);
    if (!previous) return;
    layersRef.current = previous;
    render();
    syncHistoryButtons();
    notifyUpdate();
  }, [render, syncHistoryButtons, notifyUpdate]);

  // 1つ先に進む
  const handleRedo = useCallback(() => {
    const next = history.current.redo(layersRef.current);
    if (!next) return;
    layersRef.current = next;
    render();
    syncHistoryButtons();
    notifyUpdate();
  }, [render, syncHistoryButtons, notifyUpdate]);

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
    const before = cloneLayers(layersRef.current);
    // 実際に色が変わったときだけ履歴に保存する
    if (floodFillLayers(layersRef.current, startX, startY, hexToRgba(fillColor))) {
      pushUndo(before);
      render();
    }
  }, [pushUndo, render]);

  // --- スポイト ---

  const pickColor = (x: number, y: number) => {
    // 透明なら無視
    const picked = pickLayerColor(layersRef.current, x, y);
    if (!picked) return;
    const hex = rgbaToHex(picked.r, picked.g, picked.b);

    // 状態を更新
    setColor(hex); // 現在の色を変更
    addRecentColor(hex); // 最近使った色に追加
    setTool('pen'); // penに自動切り替え
  };

  // --- 描画(ブラシサイズ＆ミラー対応) ---

  const applyTool = useCallback((x: number, y: number) => {
    const layers = layersRef.current;
    const rgba = hexToRgba(color);
    for (const [px, py] of brushPixels(x, y, brushSize, mirror)) {
      if (tool === 'eraser') erasePixel(layers, px, py); // 消しゴム: 透明にする
      else paintPixel(layers, px, py, rgba);
    }
    render();
  }, [tool, color, brushSize, mirror, render]);

  // --- 全消し ---

  const clearCanvas = useCallback(() => {
    pushUndo(); // 消す前の状態を履歴に保存
    layersRef.current = createLayers(); // 全体を透明に
    render();
    notifyUpdate();
  }, [pushUndo, render, notifyUpdate]);

  // --- 新規作成 ---

  const newCanvas = useCallback(() => {
    pushUndo();
    layersRef.current = createLayers();
    render();
    localStorage.removeItem(AUTOSAVE_KEY); // オートセーブのデータも削除
    notifyUpdate();
  }, [pushUndo, render, notifyUpdate]);

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
    e.target.value = ''; // 同じファイルを再度選べるようにリセット
    if (!file) return; // ファイルがなければ終了

    // PNG以外は受け付けない
    if (file.type !== 'image/png') {
      alert('PNG画像を選んでください');
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image(); // ブラウザ組み込みの画像オブジェクトを作成

    // 画像読み込みが完了したら実行
    img.onload = () => {
      URL.revokeObjectURL(url);

      // 64×64以外は引き伸ばさずに拒否する
      if (img.naturalWidth !== 64 || img.naturalHeight !== 64) {
        alert(`64×64のスキン画像を選んでください (選択した画像: ${img.naturalWidth}×${img.naturalHeight})`);
        return;
      }

      // 読み込んだスキンは下地にする
      pushUndo();
      layersRef.current = createLayers(imageToPixels(img));
      render();
      notifyUpdate();
    };

    // 壊れたファイルなどで画像として読めなかった場合
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('画像を読み込めませんでした');
    };

    img.src = url;
  }, [pushUndo, render, notifyUpdate]);

  return {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newCanvas, downloadImage, handleImport
  };
}
