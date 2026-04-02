import { useRef, useState, useEffect, useCallback } from 'react';

// 使えるツール定義
type Tool = 'pen' | 'eraser' | 'bucket' | 'picker';

// 定数
const MAX_HISTORY = 30;
const MAX_RECENT_COLORS = 16;
const AUTOSAVE_KEY = 'vextora-mc-skin-editor-canvas';
const AUTOSAVE_DELAY = 1000;

// ブラシサイズ型
type BrushSize = 1 | 2 | 3;


// スキンのパーツ定義
interface SkinPart {
  name: string;
  x: number; y: number; w: number; h: number;
}

const SKIN_PARTS: SkinPart[] = [
  { name: '頭', x: 0, y: 0, w: 32, h: 16 },
  { name: '右足', x: 0, y: 16, w: 16, h: 16 },
  { name: '胴体', x: 16, y: 16, w: 24, h: 16 },
  { name: '右腕', x: 40, y: 16, w: 16, h: 16 },
  { name: '左足', x: 16, y: 48, w: 16, h: 16 },
  { name: '左腕', x: 32, y: 48, w: 16, h: 16 },
  { name: '頭(over)', x: 32, y: 0, w: 32, h: 16 },
  { name: '右足(over)', x: 0, y: 32, w: 16, h: 16 },
  { name: '胴体(over)', x: 16, y: 32, w: 24, h: 16 },
  { name: '右腕(over)', x: 40, y: 32, w: 16, h: 16 },
  { name: '左足(over)', x: 0, y: 48, w: 16, h: 16 },
  { name: '左腕(over)', x: 48, y: 48, w: 16, h: 16 },
];

// ミラー描画用の対応マッピング
interface MirrorMapping {
  src: SkinPart;
  dst: SkinPart;
}

const MIRROR_PAIRS: MirrorMapping[] = [
  { src: SKIN_PARTS[3], dst: SKIN_PARTS[5] },   // 右腕 → 左腕
  { src: SKIN_PARTS[5], dst: SKIN_PARTS[3] },   // 左腕 → 右腕

  { src: SKIN_PARTS[1], dst: SKIN_PARTS[4] },   // 右足 → 左足
  { src: SKIN_PARTS[4], dst: SKIN_PARTS[1] },   // 左足 → 右足


  { src: SKIN_PARTS[9], dst: SKIN_PARTS[11] },  // 右腕over → 左腕over
  { src: SKIN_PARTS[11], dst: SKIN_PARTS[9] },  // 左腕over → 右腕over

  { src: SKIN_PARTS[7], dst: SKIN_PARTS[10] },  // 右足over → 左足over
  { src: SKIN_PARTS[10], dst: SKIN_PARTS[7] },  // 左足over → 右足over
];


// クリックしたピクセルがどのパーツかを返す
function getPartName(px: number, py: number): string {
  for (const part of SKIN_PARTS) {
    if (
      px >= part.x &&
      px < part.x + part.w &&
      py >= part.y &&
      py < part.y + part.h
    ) {
      return part.name;
    }
  }
  return '未使用領域';
}

// 色コードを数値に変換する関数
function hexToRgba(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  // 変換失敗(mがnull)なら黒を返す
  if (!m) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
    a: 255
  };
}

// 数値を色コードに変換する関数
function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// 描いたピクセルのミラー先座標を返す関数
function getMirrorCoord(x: number, y: number): [number, number] | null {
  for (const { src, dst } of MIRROR_PAIRS) {
    if (x >= src.x && x < src.x + src.w && y >= src.y && y < src.y + src.h) {
      // パーツ内の相対座標
      const relX = x - src.x;
      const relY = y - src.y;
      // 左右反転してミラー先に変換
      const mirrorX = dst.x + (dst.w - 1 - relX);
      const mirrorY = dst.y + relY;
      return [mirrorX, mirrorY];
    }
  }
  return null;
}


interface Props {
  // テクスチャ更新を親に通知するコールバック
  onTextureUpdate?: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function CanvasEditor({ onTextureUpdate, canvasRef }: Props) {
  // 描画ツール系
  const [color, setColor] = useState('#000000') // 現在の色
  const [tool, setTool] = useState<Tool>('pen') // 現在のツール
  const [brushSize, setBrushSize] = useState<BrushSize>(1) // ブラシサイズ

  // 表示設定系
  const [showGuide, setShowGuide] = useState(true) // ガイド表示
  const [showGrid, setShowGrid] = useState(false) // グリッド表示
  const [mirror, setMirror] = useState(false) // ミラー

  // UI状態系
  const [isDrawing, setIsDrawing] = useState(false) // 描画中かどうか
  const [canUndo, setCanUndo] = useState(false) // Undo可能か
  const [canRedo, setCanRedo] = useState(false) // Redo可能か
  const [recentColors, setRecentColors] = useState<string[]>([]) //最近の色
  const [hoverPart, setHoverPart] = useState('') // ホバー中のパーツ名

  // ズーム&パン系
  const [zoom, setZoom] = useState(1) // ズーム倍率
  const [pan, setPan] = useState({ x: 0, y: 0 }) // パン位置
  const [isPanning, setIsPanning] = useState(false) // パン中かどうか

  // useRef系
  // 直接掴む
  const overlayRef = useRef<HTMLCanvasElement>(null) // ガイド用canvas
  const fileInputRef = useRef<HTMLInputElement>(null) // ファイル入力
  const containerRef = useRef<HTMLDivElement>(null) // div要素

  // 裏のメモ帳
  const undoStack = useRef<ImageData[]>([]) // Undo履歴
  const redoStack = useRef<ImageData[]>([]) // Redo履歴
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 自動保存タイマー
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 }) // パン開始位置


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

  // --- ガイドライン＆グリッド描画 ---

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスの解像度設定
    // CSSで指定しているサイズと一致させる
    const displaySize = 512;
    canvas.width = displaySize;
    canvas.height = displaySize;

    // スキンの1pxが、画面上の何px分か (512 / 64 = 8)
    const scale = 8;

    // 全範囲掃除
    ctx.clearRect(0, 0, displaySize, displaySize);

    // グリッド描画
    if (showGrid) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        // 縦線
        ctx.moveTo(i * scale, 0);
        ctx.lineTo(i * scale, displaySize);
        // 横戦
        ctx.moveTo(0, i * scale);
        ctx.lineTo(displaySize, i * scale);
      }
      ctx.stroke();
    }

    if (showGuide) {
      ctx.lineWidth = 2;

      // メイングループ
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
      ctx.strokeRect(0 * scale, 0 * scale, 32 * scale, 16 * scale);   // 頭
      ctx.strokeRect(16 * scale, 16 * scale, 24 * scale, 16 * scale); // 胴体
      ctx.strokeRect(40 * scale, 16 * scale, 16 * scale, 16 * scale); // 右腕
      ctx.strokeRect(0 * scale, 16 * scale, 16 * scale, 16 * scale);  // 右足
      ctx.strokeRect(32 * scale, 48 * scale, 16 * scale, 16 * scale); // 左腕
      ctx.strokeRect(16 * scale, 48 * scale, 16 * scale, 16 * scale); // 左足

      // オーバーレイ
      ctx.strokeStyle = 'rgba(0, 180, 0, 0.5)';
      ctx.strokeRect(32 * scale, 0 * scale, 32 * scale, 16 * scale);  // 頭(over)
      ctx.strokeRect(0 * scale, 32 * scale, 16 * scale, 16 * scale);  // 右足(over)
      ctx.strokeRect(16 * scale, 32 * scale, 24 * scale, 16 * scale); // 胴体(over)
      ctx.strokeRect(40 * scale, 32 * scale, 16 * scale, 16 * scale); // 右腕(over)
      ctx.strokeRect(0 * scale, 48 * scale, 16 * scale, 16 * scale);  // 左足(over)
      ctx.strokeRect(48 * scale, 48 * scale, 16 * scale, 16 * scale); // 左腕(over)

      // おまけ(削除するかも)
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
      ctx.strokeRect(8 * scale, 8 * scale, 8 * scale, 8 * scale);
    }
  }, [showGuide, showGrid]);

  // --- 座標変換(ズーム＆パン対応) ---

  const toPixelCoords = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // canvasの画面上の位置を取得
    const rect = canvas.getBoundingClientRect();

    // canvas内の相対座標 × 縮小比率(64 / 512)
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    // キャンバス外は無視
    if (x < 0 || x >= 64 || y < 0 || y >= 64) return null;
    return [x, y];
  };

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
      const [cx, cy] = queue.shift()!;

      // キャンバス範囲外チェック
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

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

  // --- マウスイベント ---

  // クリックしたとき
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 右クリック or 中ボタンでパン開始
    if (e.button === 2 || e.button === 1) {
      e.preventDefault(); // ブラウザのデフォルト動作をキャンセル
      setIsPanning(true); // パン中のフラグをtrueに

      // クリックした位置、そのときのパン位置をを記録
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    const coords = toPixelCoords(e);
    if (!coords) return; // キャンバス外は無視
    const [x, y] = coords;

    if (tool === 'picker') {
      pickColor(x, y);
      return; // キャンバスを変更しないためpushUndoは不要
    }

    pushUndo(); // 描く前に現在の状態を保存

    if (tool === 'bucket') { // バケツの場合
      floodFill(x, y, color);
      addRecentColor(color);
      notifyUpdate();
    } else {
      // ペンか消しゴムの場合
      setIsDrawing(true); // 描画中フラグをtrueに → MouseMoveで使用
      applyTool(x, y);
      if (tool === 'pen') addRecentColor(color); // ペンなら色追加(消しゴムは色追加なし)
      notifyUpdate();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // パン中
    if (isPanning) {
      const dx = e.clientX - panStart.current.x; // x方向の移動量
      const dy = e.clientY - panStart.current.y; // y方向の移動量
      setPan({
        x: panStart.current.panX + dx,
        y: panStart.current.panY + dy,
      });
      return;
    }

    // 常時ホバー中のパーツ名を更新
    const coords = toPixelCoords(e);
    if (!coords) return;
    setHoverPart(getPartName(coords[0], coords[1]));

    // 描画中なら描く
    if (isDrawing) {
      applyTool(coords[0], coords[1]);
      notifyUpdate();
    }
  };

  // マウスを離したときの挙動管理関数
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 右/中クリックを離す → パン終了
    if (e.button === 2 || e.button === 1) {
      setIsPanning(false);
      return;
    }
    // 左クリックを離す → 描画終了
    setIsDrawing(false);
  };

  // キャンバス外に出たとき全フラグをリセット
  const handleMouseLeave = () => {
    setIsDrawing(false);
    setIsPanning(false);
    setHoverPart('');
  };

  // マウスホイールでズームイン/アウト
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); // デフォルト動作(ページスクロール)をキャンセル
    setZoom(prev => {
      const next = prev + (e.deltaY < 0 ? 0.5 : -0.5);
      return Math.max(1, Math.min(16, next)); // 範囲指定
    });
  };

  // ダブルクリックでズームリセット
  const handleDoubleClick = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // 右クリックメニュー無効化
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };


  // --- 全消し ---

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndo(); // 消す前の状態を履歴に保存
    ctx.clearRect(0, 0, 64, 64); // キャンバス全体を透明に
    notifyUpdate(); // 3Dプレビューに通知
  };


  // --- 新規作成 ---

  const newCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndo();
    ctx.clearRect(0, 0, 64, 64);
    localStorage.removeItem(AUTOSAVE_KEY); // オートセーブのデータも削除
    notifyUpdate();
  };

  // --- PNG保存 ---

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 画像保存をブラウザだけで完結させる流れ
    const link = document.createElement('a'); // aタグを動的に作成
    link.download = 'NewSkin.png'; // ダウンロードファイル名を設定
    link.href = canvas.toDataURL('image/png'); // キャンバスをPNG形式の文字列に変換
    link.click(); // プログラムからクリックしてダウンロード開始
  };

  // --- 画像インポート ---

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    };
    img.src = URL.createObjectURL(file);
    e.target.value = ''; // 同じファイルを再度選べるようにリセット
  };

  // --- ツール定義 ---

  const toolConfig: Record<Tool, { label: string; cursor: string }> = {
    pen: { label: 'ペン ✏️', cursor: 'crosshair' },
    eraser: { label: '消しゴム 🧹', cursor: 'cell' },
    bucket: { label: 'バケツ 🪣', cursor: 'cell' },
    picker: { label: 'スポイト 💧', cursor: 'copy' },
  };

  const colorDisabled = tool === 'eraser';

  // --- スタイル ---

  // ボタン基本デザイン
  const btn: React.CSSProperties = {
    padding: '4px 8px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '12px',
  };

  // 現在のツール判定
  const toolBtn = (t: Tool): React.CSSProperties => ({
    ...btn,
    backgroundColor: tool === t ? '#cce5ff' : '#f0f0f0',
    border: tool === t ? '2px solid #4a90d9' : '1px solid #ccc',
    fontWeight: tool === t ? 'bold' : 'normal',
  });

  // トグルボタン
  const toggleBtn = (active: boolean, color?: string): React.CSSProperties => ({
    ...btn,
    backgroundColor: active ? (color || '#e8eaf6') : '#f0f0f0', // color指定
    fontWeight: active ? 'bold' : 'normal',
  });

  // ブラシの太さ
  const sizeBtn = (s: BrushSize): React.CSSProperties => ({
    ...btn,
    width: '28px',
    textAlign: 'center',
    backgroundColor: brushSize === s ? '#ffe0b2' : '#f0f0f0',
    border: brushSize === s ? '2px solid #f57c00' : '1px solid #ccc',
    fontWeight: brushSize === s ? 'bold' : 'normal',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>

      {/* ===== ツールバー 1行目: ツール選択 ===== */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* カラーピッカー */}
        <input
          type="color"
          value={color}
          onChange={(e) => { setColor(e.target.value); addRecentColor(e.target.value); }}
          disabled={colorDisabled}
          style={{ cursor: colorDisabled ? 'not-allowed' : 'pointer', width: '32px', height: '28px' }}
        />

        {/* ペン、消しゴム、バケツ、スポイト */}
        {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map(t => (
          <button key={t} onClick={() => setTool(t)} style={toolBtn(t)}>
            {toolConfig[t].label}
          </button>
        ))}

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* ブラシサイズ */}
        <span style={{ fontSize: '11px', color: '#888' }}>筆</span>
        {([1, 2, 3] as BrushSize[]).map(s => (
          <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)}>
            {s}
          </button>
        ))}

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* ミラー */}
        <button onClick={() => setMirror(!mirror)} style={toggleBtn(mirror, '#e1bee7')}>
          🪞 {mirror ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ===== ツールバー 2行目: 操作ボタン ===== */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>

        {/* Undo / Redo ボタン */}
        <button onClick={handleUndo} disabled={!canUndo}
          style={{ ...btn, opacity: canUndo ? 1 : 0.4 }} title="元に戻す">↩️</button>
        <button onClick={handleRedo} disabled={!canRedo}
          style={{ ...btn, opacity: canRedo ? 1 : 0.4 }} title="やり直す">↪️</button>

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* 新規作成 */}
        <button onClick={newCanvas} style={btn}>新規 📄</button>

        {/* 全消し */}
        <button onClick={clearCanvas} style={btn}>全消し 🗑️</button>

        {/* 読込 */}
        <button onClick={() => fileInputRef.current?.click()} style={{ ...btn, backgroundColor: '#fff3e0' }}>
          読込 📂
        </button>

        <input ref={fileInputRef} type="file" accept=".png" onChange={handleImport} style={{ display: 'none' }} />

        {/* 保存 */}
        <button onClick={downloadImage} style={{ ...btn, backgroundColor: '#e0f7fa' }}>保存 💾</button>

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* グリッド切り替え */}
        <button onClick={() => setShowGrid(!showGrid)} style={toggleBtn(showGrid)}>
          グリッド {showGrid ? 'ON' : 'OFF'}
        </button>

        {/* ガイド切り替え */}
        <button onClick={() => setShowGuide(!showGuide)} style={toggleBtn(showGuide, '#fff3e0')}>
          ガイド {showGuide ? 'ON' : 'OFF'}
        </button>

        {/* ズーム倍率(拡大時のみ) */}
        {zoom > 1 && (
          <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>
            🔍 {zoom.toFixed(1)}x
          </span>
        )}
      </div>

      {/* ===== 最近使った色パレット ===== */}
      {/* 最近使った色が1つ以上あるときだけ表示 */}
      {recentColors.length > 0 && (
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {recentColors.map((c, i) => (
            <button key={`${c}-${i}`}
              onClick={() => { setColor(c); setTool('pen'); }}
              title={c}
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: c,
                border: c === color ? '2px solid #333' : '1px solid #aaa',
                borderRadius: '3px',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* ===== キャンバスエリア ===== */}
      <div
        ref={containerRef}
        style={{
          width: '512px', height: '512px',
          border: '2px solid #555',
          overflow: 'hidden',
          position: 'relative',
        }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        {/* ズーム＆パン用ラッパー */}
        <div style={{
          width: '512px', height: '512px',
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: 'center center',
          position: 'relative',
        }}>
          {/* 描画用キャンバス */}
          <canvas
            ref={canvasRef}
            width={64} height={64}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              imageRendering: 'pixelated',
              cursor: isPanning ? 'grabbing' : toolConfig[tool].cursor,
              backgroundImage: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%)',
              backgroundSize: '32px 32px',
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            onDoubleClick={handleDoubleClick}
          />

          {/* ガイド＆グリッド */}
          <canvas
            ref={overlayRef}
            width={64} height={64}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              imageRendering: 'pixelated',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* ===== パーツ名 + 座標 ===== */}
      <div style={{ height: '18px', fontSize: '13px', color: '#888', fontFamily: 'monospace' }}>
        {hoverPart && `📍 ${hoverPart}`}
        {zoom > 1 && ' | ホイール: ズーム | 右ドラッグ: パン | ダブルクリック: リセット'}
      </div>
    </div>
  );
}
