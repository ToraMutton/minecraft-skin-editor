import { useRef, useState, useEffect, useCallback } from 'react';

// 使えるツール一覧
type Tool = 'pen' | 'eraser' | 'bucket' | 'picker';

// Undo/Redo の上限
const MAX_HISTORY = 30;
// 最近使った色の上限
const MAX_RECENT_COLORS = 16;

// スキンのパーツ定義（パーツ名と範囲）
interface SkinPart {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// 64x64スキンのUVマップに基づくパーツ一覧
const SKIN_PARTS: SkinPart[] = [
  // ベースレイヤー
  { name: '頭', x: 0, y: 0, w: 32, h: 16 },
  { name: '右足', x: 0, y: 16, w: 16, h: 16 },
  { name: '胴体', x: 16, y: 16, w: 24, h: 16 },
  { name: '右腕', x: 40, y: 16, w: 16, h: 16 },
  // ベースの左半身
  { name: '左足', x: 16, y: 48, w: 16, h: 16 },
  { name: '左腕', x: 32, y: 48, w: 16, h: 16 },
  // 装飾レイヤー
  { name: '頭（装飾）', x: 32, y: 0, w: 32, h: 16 },
  { name: '右足（装飾）', x: 0, y: 32, w: 16, h: 16 },
  { name: '胴体（装飾）', x: 16, y: 32, w: 24, h: 16 },
  { name: '右腕（装飾）', x: 40, y: 32, w: 16, h: 16 },
  { name: '左足（装飾）', x: 0, y: 48, w: 16, h: 16 },
  { name: '左腕（装飾）', x: 48, y: 48, w: 16, h: 16 },
];

// 座標がどのパーツに属するかを返す
function getPartName(px: number, py: number): string {
  for (const part of SKIN_PARTS) {
    if (px >= part.x && px < part.x + part.w && py >= part.y && py < part.y + part.h) {
      return part.name;
    }
  }
  return '未使用領域';
}

// HEXカラー → RGBA
function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
    a: 255,
  };
}

// RGBA → HEXカラー
function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo 履歴（再レンダリング不要なのでrefで持つ）
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const [color, setColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [showGuide, setShowGuide] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [hoverPart, setHoverPart] = useState('');

  // --- 履歴操作 ---

  // 現在のキャンバスをUndoスタックに積む
  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();

    // 新しい操作をしたらRedoは破棄
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // Undo
  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (undoStack.current.length === 0) return;

    // 現在の状態をRedoスタックに退避
    redoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const prev = undoStack.current.pop()!;
    ctx.putImageData(prev, 0, 0);

    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, []);

  // Redo
  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (redoStack.current.length === 0) return;

    // 現在の状態をUndoスタックに退避
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const next = redoStack.current.pop()!;
    ctx.putImageData(next, 0, 0);

    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  // キーボードショートカット: Ctrl+Z=Undo, Ctrl+Y/Ctrl+Shift+Z=Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // --- 最近使った色 ---

  const addRecentColor = useCallback((c: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(existing => existing !== c);
      return [c, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);

  // --- ガイドライン＆グリッド描画 ---

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ピクセルグリッド
    if (showGrid) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 1; i < 64; i++) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 64);
        ctx.moveTo(0, i);
        ctx.lineTo(64, i);
      }
      ctx.stroke();
    }

    // ガイドライン
    if (showGuide) {
      ctx.lineWidth = 1;

      // ベースレイヤー（赤）
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.strokeRect(0, 0, 32, 16);
      ctx.strokeRect(16, 16, 24, 16);
      ctx.strokeRect(40, 16, 16, 16);
      ctx.strokeRect(0, 16, 16, 16);
      ctx.strokeRect(32, 48, 16, 16);
      ctx.strokeRect(16, 48, 16, 16);

      // 装飾レイヤー（緑）
      ctx.strokeStyle = 'rgba(0, 180, 0, 0.5)';
      ctx.strokeRect(32, 0, 32, 16);
      ctx.strokeRect(0, 32, 16, 16);
      ctx.strokeRect(16, 32, 24, 16);
      ctx.strokeRect(40, 32, 16, 16);
      ctx.strokeRect(0, 48, 16, 16);
      ctx.strokeRect(48, 48, 16, 16);

      // 顔の正面（青）
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
      ctx.strokeRect(8, 8, 8, 8);
    }
  }, [showGuide, showGrid]);

  // --- 座標変換 ---

  const toPixelCoords = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    return [x, y];
  };

  // --- バケツ塗りつぶし（BFS） ---

  const floodFill = useCallback((startX: number, startY: number, fillColor: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const fill = hexToRgba(fillColor);

    // クリック地点の色を取得
    const idx = (startY * width + startX) * 4;
    const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];

    // 同じ色なら何もしない
    if (tR === fill.r && tG === fill.g && tB === fill.b && tA === fill.a) return;

    const queue: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(width * height);

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

      const pos = cy * width + cx;
      if (visited[pos]) continue;
      visited[pos] = 1;

      const i = pos * 4;
      if (data[i] !== tR || data[i + 1] !== tG || data[i + 2] !== tB || data[i + 3] !== tA) continue;

      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = fill.a;

      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // --- スポイト ---

  const pickColor = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    // 透明ピクセルは無視
    if (pixel[3] === 0) return;

    const hex = rgbaToHex(pixel[0], pixel[1], pixel[2]);
    setColor(hex);
    addRecentColor(hex);
    // 色を拾ったらペンに自動切替
    setTool('pen');
  };

  // --- 1ピクセル描画 ---

  const applyTool = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'eraser') {
      ctx.clearRect(x, y, 1, 1);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  };

  // --- マウスイベント ---

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = toPixelCoords(e);
    if (!coords) return;
    const [x, y] = coords;

    if (tool === 'picker') {
      pickColor(x, y);
      return;
    }

    // 描画系は操作前にスナップショット保存
    pushUndo();

    if (tool === 'bucket') {
      floodFill(x, y, color);
      addRecentColor(color);
    } else {
      setIsDrawing(true);
      applyTool(x, y);
      if (tool === 'pen') addRecentColor(color);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = toPixelCoords(e);
    if (!coords) return;

    // ホバー中のパーツ名を更新
    setHoverPart(getPartName(coords[0], coords[1]));

    if (isDrawing) {
      applyTool(coords[0], coords[1]);
    }
  };

  const handleMouseUp = () => setIsDrawing(false);
  const handleMouseLeave = () => {
    setIsDrawing(false);
    setHoverPart('');
  };

  // --- 全消し ---

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // --- PNG保存 ---

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'NewSkin.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // --- 画像インポート ---

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      pushUndo();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 64, 64);
    };
    img.src = URL.createObjectURL(file);

    // 同じファイルを再度選べるようにリセット
    e.target.value = '';
  };

  // --- ツール定義 ---

  const toolConfig: Record<Tool, { label: string; cursor: string }> = {
    pen: { label: 'ペン ✏️', cursor: 'crosshair' },
    eraser: { label: '消しゴム 🧹', cursor: 'crosshair' },
    bucket: { label: 'バケツ 🪣', cursor: 'cell' },
    picker: { label: 'スポイト 💧', cursor: 'copy' },
  };

  const colorDisabled = tool === 'eraser';

  // --- ボタンスタイル ---

  const btnBase: React.CSSProperties = {
    padding: '5px 10px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '13px',
  };

  const toolBtn = (t: Tool): React.CSSProperties => ({
    ...btnBase,
    backgroundColor: tool === t ? '#cce5ff' : '#f0f0f0',
    border: tool === t ? '2px solid #4a90d9' : '1px solid #ccc',
    fontWeight: tool === t ? 'bold' : 'normal',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>

      {/* ===== ツールバー ===== */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* カラーピッカー */}
        <input
          type="color"
          value={color}
          onChange={(e) => { setColor(e.target.value); addRecentColor(e.target.value); }}
          disabled={colorDisabled}
          style={{ cursor: colorDisabled ? 'not-allowed' : 'pointer', width: '36px', height: '30px' }}
        />

        {/* ツール切替 */}
        {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map((t) => (
          <button key={t} onClick={() => setTool(t)} style={toolBtn(t)}>
            {toolConfig[t].label}
          </button>
        ))}

        {/* 区切り */}
        <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc' }} />

        {/* Undo / Redo */}
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          style={{ ...btnBase, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'not-allowed' }}
          title="元に戻す (Ctrl+Z)"
        >
          ↩️
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          style={{ ...btnBase, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? 'pointer' : 'not-allowed' }}
          title="やり直す (Ctrl+Y)"
        >
          ↪️
        </button>

        {/* 区切り */}
        <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc' }} />

        {/* 全消し */}
        <button onClick={clearCanvas} style={btnBase}>
          全消し 🗑️
        </button>

        {/* 読込 */}
        <button onClick={() => fileInputRef.current?.click()} style={{ ...btnBase, backgroundColor: '#fff3e0' }}>
          読込 📂
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png"
          onChange={handleImport}
          style={{ display: 'none' }}
        />

        {/* 保存 */}
        <button onClick={downloadImage} style={{ ...btnBase, backgroundColor: '#e0f7fa' }}>
          保存 💾
        </button>

        {/* 区切り */}
        <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc' }} />

        {/* グリッド切替 */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          style={{ ...btnBase, backgroundColor: showGrid ? '#e8eaf6' : '#f0f0f0' }}
        >
          {showGrid ? 'グリッド (ON)' : 'グリッド (OFF)'}
        </button>

        {/* ガイド切替 */}
        <button
          onClick={() => setShowGuide(!showGuide)}
          style={{ ...btnBase, backgroundColor: showGuide ? '#fff3e0' : '#f0f0f0' }}
        >
          {showGuide ? 'ガイド (ON)' : 'ガイド (OFF)'}
        </button>
      </div>

      {/* ===== 最近使った色パレット ===== */}
      {recentColors.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {recentColors.map((c, i) => (
            <button
              key={`${c}-${i}`}
              onClick={() => { setColor(c); setTool('pen'); }}
              title={c}
              style={{
                width: '22px',
                height: '22px',
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
      <div style={{ position: 'relative', width: '512px', height: '512px', border: '2px solid #555' }}>
        {/* 描画用キャンバス */}
        <canvas
          ref={canvasRef}
          width={64}
          height={64}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            imageRendering: 'pixelated',
            cursor: toolConfig[tool].cursor,
            backgroundImage: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%)',
            backgroundSize: '32px 32px',
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
        />

        {/* ガイド＆グリッド用オーバーレイ */}
        <canvas
          ref={overlayRef}
          width={64}
          height={64}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ===== パーツ名表示 ===== */}
      <div style={{
        height: '20px',
        fontSize: '14px',
        color: '#888',
        fontFamily: 'monospace',
      }}>
        {hoverPart && `📍 ${hoverPart}`}
      </div>
    </div>
  );
}
