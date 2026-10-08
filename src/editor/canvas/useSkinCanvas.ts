import { useState, useRef, useCallback, useEffect } from 'react';
import type { Tool, BrushSize } from './tools';
import { MAX_HISTORY, MAX_RECENT_COLORS, AUTOSAVE_KEY, UNREADABLE_BACKUP_KEY, LAST_PROJECT_KEY } from './constants';
import { createLayers, cloneLayers } from './layers';
import type { SkinLayers } from './layers';
import { paintPixel, erasePixel, brushPixels, floodFill as floodFillLayers, pickColor as pickLayerColor } from './operations';
import { decodeImage, renderToCanvas } from './image';
import { readSkinFile, exportFileName } from './importFile';
import { History } from './history';
import { strokePoints } from './line';
import { getLayout } from '../skin/layout';
import { createProject, uniqueName } from '../../projects/project';
import type { NewProjectOptions } from '../../projects/project';
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
  const { status: saveStatus, markEdited, saveNow, flush, discardPending, resetStatus } = useAutosave(repository, () => ({ ...projectRef.current, layers: layersRef.current }))
  // 画面に出す、今の作品の情報 (名前など。projectRef は変わっても画面は再描画されないので、別に持つ)
  const [projectInfo, setProjectInfo] = useState({ id: projectRef.current.id, name: projectRef.current.name })
  const [layout, setLayout] = useState(() => getLayout(projectRef.current.model)) // 今の作品のモデルの形式 (3D表示などに渡す)
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

  // 別の作品に差し替える (起動・作品を開く・新規・削除の後)。Undo履歴は作品ごとなので、リセットする
  const loadProject = useCallback((project: SkinProject) => {
    projectRef.current = project;
    layersRef.current = project.layers;
    history.current = new History<SkinLayers>(MAX_HISTORY);
    lastPoint.current = null;
    setCanUndo(false); setCanRedo(false);
    setProjectInfo({ id: project.id, name: project.name });
    setLayout(getLayout(project.model));
    try { localStorage.setItem(LAST_PROJECT_KEY, project.id); } catch { /* 記録できなくても、作品は開ける */ }
    render();
  }, [render]);

  // 起動時に、開く作品を決める (IndexedDB → 昔の自動保存データの移行 → 素体)
  useEffect(() => {
    let cancelled = false; // 読み込み中に画面が閉じられたら、結果を使わない
    render(); // まず素体を表示する (保存済みの作品があれば、読み込み後に置き換わる)

    loadInitialProjectOnce({
      repository,
      readLegacy: () => { try { return localStorage.getItem(AUTOSAVE_KEY); } catch { return null; } },
      readLastOpenedId: () => { try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; } },
      backupUnreadable: data => { try { localStorage.setItem(UNREADABLE_BACKUP_KEY, data); } catch { /* 退避できなくても起動は続ける */ } },
      decode: decodeImage,
    }).then(result => {
      if (cancelled) return;
      loadProject(result.project);
      setStartupWarning(result.warning ?? null);
    });
    return () => { cancelled = true; };
  }, [render, repository, loadProject]);

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
    const layout = getLayout(projectRef.current.model); // 今の作品のモデルの形式
    for (const [cx, cy] of strokePoints(layout, connect ? lastPoint.current : null, [x, y])) {
      for (const [px, py] of brushPixels(layout, cx, cy, brushSize, mirror)) {
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

  // 新しい作品を作って切り替える。今の作品は保存済みなのでそのまま残る (全消しは、今の作品を完全に透明にするだけ)
  // 作り始め方: 素体 / 白紙 / 読み込んだPNGの画素。名前は「無題のスキン」「無題のスキン 2」…と、重ならないように付ける
  // 今の作品を保存できなかったときは、切り替えずに false を返す (切り替えると、保存できていない絵を失うため)
  const newProject = useCallback(async (options: Pick<NewProjectOptions, 'start' | 'name' | 'model'> = {}): Promise<boolean> => {
    if (!(await flush())) return false;
    let existing: string[] = [];
    try { existing = (await repository.list()).map(p => p.name); } catch { /* 一覧を読めなくても、作品は作れる (名前が重なるだけ) */ }
    loadProject(createProject({ ...options, name: uniqueName(options.name ?? '無題のスキン', existing) }));
    resetStatus();
    markEdited(); // 新しい作品も保存する
    return true;
  }, [flush, repository, loadProject, resetStatus, markEdited]);

  // --- PNG保存 ---

  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 画像保存をブラウザだけで完結させる流れ
    const link = document.createElement('a'); // aタグを動的に作成
    link.download = exportFileName(projectRef.current.name); // ダウンロードファイル名は、作品の名前から作る
    link.href = canvas.toDataURL('image/png'); // キャンバスをPNG形式の文字列に変換
    link.click(); // プログラムからクリックしてダウンロード開始
  }, [canvasRef]);

  // --- 画像インポート ---

  // 「読込」: 今の作品に、PNGを下地として読み込んで置き換える (Undoで戻せる)
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; // 選ばれたファイルが複数の場合でも最初の1枚を対象にする
    e.target.value = ''; // 同じファイルを再度選べるようにリセット
    if (!file) return; // ファイルがなければ終了

    const result = await readSkinFile(file);
    if (!result.ok) { alert(result.message); return; }
    pushUndo();
    replaceLayers(createLayers(result.pixels)); // 読み込んだスキンは下地にする
    notifyUpdate();
  }, [pushUndo, replaceLayers, notifyUpdate]);

  // 「新規 → PNGから」: PNGを下地にした、新しい作品を作る。名前はファイル名から付ける
  const newProjectFromFile = useCallback(async (file: File, model?: NewProjectOptions['model']): Promise<{ ok: true } | { ok: false; message: string }> => {
    const result = await readSkinFile(file);
    if (!result.ok) return result;
    const created = await newProject({ start: result.pixels, name: result.name ?? '読み込んだスキン', model });
    return created ? { ok: true } : { ok: false, message: '今のスキンを保存できなかったため、新しいスキンを作れません' };
  }, [newProject]);

  return {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newProject, newProjectFromFile, downloadImage, handleImport,
    saveStatus, saveNow, startupWarning,
    // 作品の管理 (useProjectManager が使う)
    layout, projectInfo, setProjectInfo, projectRef, loadProject, flush, discardPending, resetStatus, markEdited, repository
  };
}
