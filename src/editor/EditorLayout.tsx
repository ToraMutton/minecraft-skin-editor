import { useRef, useState } from 'react';
import '@fontsource/dotgothic16'; // ドット絵風フォント (OFLライセンス。npmから入れて自分のサイトから配信する)
import './theme.css';

import type { PartName } from './skin/uv';
import type { PartVisibility, ViewMode } from './viewTypes';
import { useSkinCanvas } from './canvas/useSkinCanvas';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { SkinViewer } from './three/SkinViewer';
import { EditorHeader } from './components/EditorHeader';
import { ToolPanel } from './components/ToolPanel';
import { ColorPanel } from './components/ColorPanel';
import { ViewToggles } from './components/ViewToggles';
import { PartPanel } from './components/PartPanel';

const ALL_VISIBLE: PartVisibility = {
  head: true, body: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true,
};

// エディタ画面全体: 状態を持ち、各パネルと3D表示に配る
export function EditorLayout() {
  // スキン画像の本体 (64×64)。画面には出さず、3D表示のテクスチャとして使う
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newCanvas, downloadImage, handleImport
  } = useSkinCanvas(canvasRef);

  // 表示設定系
  const [visibleParts, setVisibleParts] = useState<PartVisibility>(ALL_VISIBLE);
  const [visibleOverlay, setVisibleOverlay] = useState<PartVisibility>(ALL_VISIBLE);

  const [isAutoFocus, setIsAutoFocus] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  const [mode, setMode] = useState<ViewMode>('edit');

  // --- 3Dモデル上で押された・なぞられたピクセルに、今のツールを使う ---
  const handlePaintStart = (texX: number, texY: number) => {
    if (tool === 'picker') {
      pickColor(texX, texY); // 色を読むだけなので履歴には積まない
    } else if (tool === 'bucket') {
      floodFill(texX, texY, color); // 履歴への保存はfloodFill内で行う
      addRecentColor(color);
    } else {
      pushUndo();
      setIsDrawing(true);
      applyTool(texX, texY);
      if (tool === 'pen') addRecentColor(color);
    }
    notifyUpdate();
  };

  // なぞって描けるのはペンと消しゴムだけ (isDrawing は押したときに立つ)
  const handlePaintMove = (texX: number, texY: number, connected: boolean) => {
    if (!isDrawing) return;
    applyTool(texX, texY, connected); // 途切れずになぞっていれば、前の点から線でつなぐ
    notifyUpdate();
  };

  const handlePaintEnd = () => setIsDrawing(false);

  // --- パーツの表示切り替え ---
  const togglePart = (part: PartName) => setVisibleParts(p => ({ ...p, [part]: !p[part] }));
  const toggleOverlay = (part: PartName) => setVisibleOverlay(p => ({ ...p, [part]: !p[part] }));
  const toggleAllOverlay = () => {
    const allOver = !(visibleOverlay.head && visibleOverlay.body && visibleOverlay.rightArm && visibleOverlay.leftArm && visibleOverlay.rightLeg && visibleOverlay.leftLeg);
    setVisibleOverlay({ head: allOver, body: allOver, rightArm: allOver, leftArm: allOver, rightLeg: allOver, leftLeg: allOver });
  };

  // --- キーボードショートカット ---
  useKeyboardShortcuts({
    canUndo, canRedo, onUndo: handleUndo, onRedo: handleRedo,
    onToolChange: setTool, onBrushSizeChange: setBrushSize,
  });

  return (
    <div className="vx-app">

      <EditorHeader
        canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo}
        onNew={() => { if (window.confirm('キャンバスをリセットして新規作成しますか？')) newCanvas(); }}
        onImport={handleImport}
        onDownload={downloadImage}
      />

      {/* --- メインエディタ領域 (左 | 3D | 右) --- */}
      <div className="vx-workspace">

        {/* --- 左サイドバー: ツールはよく使うので上に置く --- */}
        <aside className="vx-sidebar">
          <ToolPanel
            tool={tool} onToolChange={setTool}
            brushSize={brushSize} onBrushSizeChange={setBrushSize}
            mirror={mirror} onMirrorChange={setMirror}
          />
          <ColorPanel
            color={color} onColorChange={setColor} onColorCommit={addRecentColor}
            onSwatchClick={c => { setColor(c); setTool('pen'); }}
            recentColors={recentColors}
            disabled={tool === 'eraser'}
          />
        </aside>

        {/* --- 中央: 3D表示 --- */}
        <main className="vx-viewport">
          <ViewToggles
            isAutoFocus={isAutoFocus} onAutoFocusChange={setIsAutoFocus}
            showGuide={showGuide} onShowGuideChange={setShowGuide}
            mode={mode} onModeChange={setMode}
          />

          <SkinViewer
            canvasRef={canvasRef}
            visibleParts={visibleParts} visibleOverlay={visibleOverlay}
            showGuide={showGuide} isAutoFocus={isAutoFocus} mode={mode}
            onPaintStart={handlePaintStart} onPaintMove={handlePaintMove} onPaintEnd={handlePaintEnd}
          />

          <canvas ref={canvasRef} width={64} height={64} style={{ display: 'none' }} />
        </main>

        {/* --- 右サイドバー --- */}
        <aside className="vx-sidebar">
          <PartPanel
            visibleParts={visibleParts} visibleOverlay={visibleOverlay}
            onTogglePart={togglePart} onToggleOverlay={toggleOverlay} onToggleAllOverlay={toggleAllOverlay}
            onClear={() => { if (window.confirm('本当にキャンバスを全消ししますか？')) clearCanvas(); }}
          />
        </aside>

      </div>
    </div>
  );
}
