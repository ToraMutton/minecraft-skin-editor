import { useRef, useState, useEffect, useCallback } from 'react';

// 使えるツール定義
type Tool = 'pen' | 'eraser' | 'bucket' | 'picker';

// 定数
const MAX_HISTORY = 30;
const MAX_RECENT_COLORS = 16;
const AUTOSAVE_KEY = 'mc-skin-editor-canvas';
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

function getPartName(px: number, py: number): string {
  for (const part of SKIN_PARTS) {
    if (px >= part.x && px < part.x + part.w && py >= part.y && py < part.y + part.h) {
      return part.name;
    }
  }
  return '未使用領域';
}

function hexToRgba(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0, a: 255 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 255 };
}

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ミラー座標を計算する
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
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Undo/Redo 履歴
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [color, setColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [showGuide, setShowGuide] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [hoverPart, setHoverPart] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 3Dプレビューにテクスチャ変更を通知 + 自動保存
  const notifyUpdate = useCallback(() => {
    onTextureUpdate?.();

    // 自動保存（デバウンス）
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          localStorage.setItem(AUTOSAVE_KEY, canvas.toDataURL('image/png'));
        } catch { /* localStorageが満杯の場合は無視 */ }
      }
    }, AUTOSAVE_DELAY);
  }, [onTextureUpdate, canvasRef]);

  // 起動時にlocalStorageからキャンバスを復元
  useEffect(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      onTextureUpdate?.();
    };
    img.src = saved;
  }, [canvasRef, onTextureUpdate]);

  // --- 履歴操作 ---

  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [canvasRef]);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (undoStack.current.length === 0) return;

    redoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(undoStack.current.pop()!, 0, 0);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    notifyUpdate();
  }, [canvasRef, notifyUpdate]);

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

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // --- 最近使った色 ---

  const addRecentColor = useCallback((c: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(e => e !== c);
      return [c, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);

  // --- ガイドライン＆グリッド描画 ---

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 1; i < 64; i++) {
        ctx.moveTo(i, 0); ctx.lineTo(i, 64);
        ctx.moveTo(0, i); ctx.lineTo(64, i);
      }
      ctx.stroke();
    }

    if (showGuide) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.strokeRect(0, 0, 32, 16);
      ctx.strokeRect(16, 16, 24, 16);
      ctx.strokeRect(40, 16, 16, 16);
      ctx.strokeRect(0, 16, 16, 16);
      ctx.strokeRect(32, 48, 16, 16);
      ctx.strokeRect(16, 48, 16, 16);

      ctx.strokeStyle = 'rgba(0, 180, 0, 0.5)';
      ctx.strokeRect(32, 0, 32, 16);
      ctx.strokeRect(0, 32, 16, 16);
      ctx.strokeRect(16, 32, 24, 16);
      ctx.strokeRect(40, 32, 16, 16);
      ctx.strokeRect(0, 48, 16, 16);
      ctx.strokeRect(48, 48, 16, 16);

      ctx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
      ctx.strokeRect(8, 8, 8, 8);
    }
  }, [showGuide, showGrid]);

  // --- 座標変換（ズーム＆パン対応） ---

  const toPixelCoords = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
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
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const fill = hexToRgba(fillColor);

    const idx = (startY * width + startX) * 4;
    const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];
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
      data[i] = fill.r; data[i + 1] = fill.g; data[i + 2] = fill.b; data[i + 3] = fill.a;
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
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    if (pixel[3] === 0) return;
    const hex = rgbaToHex(pixel[0], pixel[1], pixel[2]);
    setColor(hex);
    addRecentColor(hex);
    setTool('pen');
  };

  // --- 描画（ブラシサイズ＆ミラー対応） ---

  const applyToolAt = useCallback((x: number, y: number, ctx: CanvasRenderingContext2D) => {
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = x + dx, py = y + dy;
        if (px < 0 || px >= 64 || py < 0 || py >= 64) continue;
        if (tool === 'eraser') {
          ctx.clearRect(px, py, 1, 1);
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
  }, [tool, color, brushSize]);

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
          const mc = getMirrorCoord(px, py);
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

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 右クリック or 中ボタンでパン開始
    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    const coords = toPixelCoords(e);
    if (!coords) return;
    const [x, y] = coords;

    if (tool === 'picker') {
      pickColor(x, y);
      return;
    }

    pushUndo();

    if (tool === 'bucket') {
      floodFill(x, y, color);
      addRecentColor(color);
      notifyUpdate();
    } else {
      setIsDrawing(true);
      applyTool(x, y);
      if (tool === 'pen') addRecentColor(color);
      notifyUpdate();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // パン中
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }

    const coords = toPixelCoords(e);
    if (!coords) return;
    setHoverPart(getPartName(coords[0], coords[1]));

    if (isDrawing) {
      applyTool(coords[0], coords[1]);
      notifyUpdate();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || e.button === 1) {
      setIsPanning(false);
      return;
    }
    setIsDrawing(false);
  };

  const handleMouseLeave = () => {
    setIsDrawing(false);
    setIsPanning(false);
    setHoverPart('');
  };

  // ズーム（ホイール）
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => {
      const next = prev + (e.deltaY < 0 ? 0.5 : -0.5);
      return Math.max(1, Math.min(16, next));
    });
  };

  // ズームリセット（ダブルクリック）
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
    pushUndo();
    ctx.clearRect(0, 0, 64, 64);
    notifyUpdate();
  };

  // --- 新規作成 ---

  const newCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, 64, 64);
    localStorage.removeItem(AUTOSAVE_KEY);
    notifyUpdate();
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
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      notifyUpdate();
    };
    img.src = URL.createObjectURL(file);
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

  // --- スタイル ---

  const btn: React.CSSProperties = {
    padding: '4px 8px', cursor: 'pointer',
    border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px',
  };

  const toolBtn = (t: Tool): React.CSSProperties => ({
    ...btn,
    backgroundColor: tool === t ? '#cce5ff' : '#f0f0f0',
    border: tool === t ? '2px solid #4a90d9' : '1px solid #ccc',
    fontWeight: tool === t ? 'bold' : 'normal',
  });

  const toggleBtn = (active: boolean, color?: string): React.CSSProperties => ({
    ...btn,
    backgroundColor: active ? (color || '#e8eaf6') : '#f0f0f0',
    fontWeight: active ? 'bold' : 'normal',
  });

  const sizeBtn = (s: BrushSize): React.CSSProperties => ({
    ...btn,
    width: '28px', textAlign: 'center',
    backgroundColor: brushSize === s ? '#ffe0b2' : '#f0f0f0',
    border: brushSize === s ? '2px solid #f57c00' : '1px solid #ccc',
    fontWeight: brushSize === s ? 'bold' : 'normal',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>

      {/* ===== ツールバー 1行目: ツール選択 ===== */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          type="color" value={color}
          onChange={(e) => { setColor(e.target.value); addRecentColor(e.target.value); }}
          disabled={colorDisabled}
          style={{ cursor: colorDisabled ? 'not-allowed' : 'pointer', width: '32px', height: '28px' }}
        />

        {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map(t => (
          <button key={t} onClick={() => setTool(t)} style={toolBtn(t)}>
            {toolConfig[t].label}
          </button>
        ))}

        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* ブラシサイズ */}
        <span style={{ fontSize: '11px', color: '#888' }}>筆</span>
        {([1, 2, 3] as BrushSize[]).map(s => (
          <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)}>
            {s}
          </button>
        ))}

        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* ミラー */}
        <button onClick={() => setMirror(!mirror)} style={toggleBtn(mirror, '#e1bee7')}>
          🪞 {mirror ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ===== ツールバー 2行目: 操作ボタン ===== */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={handleUndo} disabled={!canUndo}
          style={{ ...btn, opacity: canUndo ? 1 : 0.4 }} title="元に戻す (Ctrl+Z)">↩️</button>
        <button onClick={handleRedo} disabled={!canRedo}
          style={{ ...btn, opacity: canRedo ? 1 : 0.4 }} title="やり直す (Ctrl+Y)">↪️</button>

        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        <button onClick={newCanvas} style={btn}>新規 📄</button>
        <button onClick={clearCanvas} style={btn}>全消し 🗑️</button>
        <button onClick={() => fileInputRef.current?.click()} style={{ ...btn, backgroundColor: '#fff3e0' }}>
          読込 📂</button>
        <input ref={fileInputRef} type="file" accept=".png" onChange={handleImport} style={{ display: 'none' }} />
        <button onClick={downloadImage} style={{ ...btn, backgroundColor: '#e0f7fa' }}>保存 💾</button>

        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        <button onClick={() => setShowGrid(!showGrid)} style={toggleBtn(showGrid)}>
          グリッド {showGrid ? 'ON' : 'OFF'}
        </button>
        <button onClick={() => setShowGuide(!showGuide)} style={toggleBtn(showGuide, '#fff3e0')}>
          ガイド {showGuide ? 'ON' : 'OFF'}
        </button>

        {zoom > 1 && (
          <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>
            🔍 {zoom.toFixed(1)}x
          </span>
        )}
      </div>

      {/* ===== 最近使った色パレット ===== */}
      {recentColors.length > 0 && (
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {recentColors.map((c, i) => (
            <button key={`${c}-${i}`}
              onClick={() => { setColor(c); setTool('pen'); }}
              title={c}
              style={{
                width: '20px', height: '20px', backgroundColor: c,
                border: c === color ? '2px solid #333' : '1px solid #aaa',
                borderRadius: '3px', cursor: 'pointer', padding: 0,
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
