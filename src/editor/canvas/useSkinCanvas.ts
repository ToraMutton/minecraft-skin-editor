import { useState, useRef, useCallback, useEffect } from 'react';
import type { Tool, BrushSize } from './tools';
import { MAX_HISTORY, MAX_RECENT_COLORS, AUTOSAVE_KEY, UNREADABLE_BACKUP_KEY } from './constants';
import { createLayers, cloneLayers } from './layers';
import type { SkinLayers } from './layers';
import { paintPixel, erasePixel, brushPixels, floodFill as floodFillLayers, pickColor as pickLayerColor } from './operations';
import { imageToPixels, decodeImage, renderToCanvas } from './image';
import { History } from './history';
import { strokePoints } from './line';
import { createProject } from '../../projects/project';
import type { SkinProject } from '../../projects/project';
import { appRepository } from '../../projects/localRepository';
import { loadInitialProjectOnce } from '../../projects/startup';
import { useAutosave } from '../../projects/useAutosave';
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
  const repository = appRepository // 作品の保存先 (IndexedDB。アプリで1つを共有する)
  const projectRef = useRef<SkinProject>(createProject()) // 今開いている作品 (最初は素体。起動時に保存済みの作品に置き換わる)
  const layersRef = useRef<SkinLayers>(projectRef.current.layers) // スキンのデータ本体 (= 作品の3層)
  const history = useRef(new History<SkinLayers>(MAX_HISTORY)) // Undo/Redo履歴 (層の複製を積む)
  const [startupWarning, setStartupWarning] = useState<string | null>(null) // 起動時の問題 (保存先が開けないなど)

  // 作品の自動保存。保存する瞬間に、最新の層を作品に入れて渡す
  const { status: saveStatus, markEdited, saveNow } = useAutosave(repository, () => ({ ...projectRef.current, layers: layersRef.current }))
  const lastPoint = useRef<[number, number] | null>(null) // なぞり描きで前回塗った点

  // 層を書き換えたら呼ぶ: 見た目を canvas に反映する
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) renderToCanvas(canvas, layersRef.current);
  }, [canvasRef]);

  // 描いた後に呼ぶ: 自動保存を予約する
  const notifyUpdate = markEdited;

  // 層を丸ごと入れ替える (Undo・全消し・読み込みなど)。作品と画面の両方を、必ず同じ層にそろえる
  const replaceLayers = useCallback((layers: SkinLayers) => {
    layersRef.current = layers;
    projectRef.current = { ...projectRef.current, layers };
    render();
  }, [render]);

  // 起動時に、開く作品を決める (IndexedDB → 昔の自動保存データの移行 → 素体)
  useEffect(() => {
    let cancelled = false; // 読み込み中に画面が閉じられたら、結果を使わない
    render(); // まず素体を表示する (保存済みの作品があれば、読み込み後に置き換わる)

    loadInitialProjectOnce({
      repository,
      readLegacy: () => { try { return localStorage.getItem(AUTOSAVE_KEY); } catch { return null; } },
      backupUnreadable: data => { try { localStorage.setItem(UNREADABLE_BACKUP_KEY, data); } catch { /* 退避できなくても起動は続ける */ } },
      decode: decodeImage,
    }).then(result => {
      if (cancelled) return;
      projectRef.current = result.project;
      layersRef.current = result.project.layers;
      history.current = new History<SkinLayers>(MAX_HISTORY);
      setCanUndo(false); setCanRedo(false);
      setStartupWarning(result.warning ?? null);
      render();
    });
    return () => { cancelled = true; };
  }, [render, repository]);

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
    replaceLayers(previous);
    syncHistoryButtons();
    notifyUpdate();
  }, [replaceLayers, syncHistoryButtons, notifyUpdate]);

  // 1つ先に進む
  const handleRedo = useCallback(() => {
    const next = history.current.redo(layersRef.current);
    if (!next) return;
    replaceLayers(next);
    syncHistoryButtons();
    notifyUpdate();
  }, [replaceLayers, syncHistoryButtons, notifyUpdate]);

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

  // (x, y) にペン/消しゴムを使う
  // connect = true なら、前回の点から線でつなぐ (マウスを速く動かしても途切れないように。同じ面の中だけ)
  const applyTool = useCallback((x: number, y: number, connect = false) => {
    const layers = layersRef.current;
    const rgba = hexToRgba(color);
    for (const [cx, cy] of strokePoints(connect ? lastPoint.current : null, [x, y])) {
      for (const [px, py] of brushPixels(cx, cy, brushSize, mirror)) {
        if (tool === 'eraser') erasePixel(layers, px, py); // 消しゴム: 透明にする
        else paintPixel(layers, px, py, rgba);
      }
    }
    lastPoint.current = [x, y];
    render();
  }, [tool, color, brushSize, mirror, render]);

  // --- 全消し ---

  const clearCanvas = useCallback(() => {
    pushUndo(); // 消す前の状態を履歴に保存
    replaceLayers(createLayers()); // 全体を透明に
    notifyUpdate();
  }, [pushUndo, replaceLayers, notifyUpdate]);

  // --- 新規作成 ---

  // 新しい作品を、素体から作って切り替える。今の作品は保存済みなのでそのまま残る (全消しは完全に透明にするだけ)
  const newCanvas = useCallback(async () => {
    await saveNow(); // 切り替える前に、今の作品を保存する
    const project = createProject();
    projectRef.current = project;
    layersRef.current = project.layers;
    history.current = new History<SkinLayers>(MAX_HISTORY); // 作品が変わるので、Undo履歴もリセット
    syncHistoryButtons();
    render();
    notifyUpdate(); // 新しい作品も保存する
  }, [saveNow, syncHistoryButtons, render, notifyUpdate]);

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
      replaceLayers(createLayers(imageToPixels(img)));
      notifyUpdate();
    };

    // 壊れたファイルなどで画像として読めなかった場合
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('画像を読み込めませんでした');
    };

    img.src = url;
  }, [pushUndo, replaceLayers, notifyUpdate]);

  return {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newCanvas, downloadImage, handleImport,
    saveStatus, saveNow, startupWarning
  };
}
