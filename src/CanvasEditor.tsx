import { useState, useEffect } from 'react';

// 外部ファイル化したものをインポート
import type { PartName } from './editor/skin/uv';
import type { PartVisibility, ViewMode } from './editor/viewTypes';
import { SkinViewer } from './editor/three/SkinViewer';
import { EditorHeader } from './editor/components/EditorHeader';
import { ToolPanel } from './editor/components/ToolPanel';
import { ColorPanel } from './editor/components/ColorPanel';
import { ViewToggles } from './editor/components/ViewToggles';
import { PartPanel } from './editor/components/PartPanel';
import { useSkinLogic } from './useSkinLogic';

const ALL_VISIBLE: PartVisibility = {
  head: true, body: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true,
};

interface Props {
  onTextureUpdate?: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function CanvasEditor({ onTextureUpdate, canvasRef }: Props) {
  const {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newCanvas, downloadImage, handleImport
  } = useSkinLogic(canvasRef, onTextureUpdate);

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
  const handlePaintMove = (texX: number, texY: number) => {
    if (!isDrawing) return;
    applyTool(texX, texY);
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input要素などに入力中の場合は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo / Redo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) handleRedo(); // Cmd+Shift+Z
        } else {
          if (canUndo) handleUndo(); // Cmd+Z
        }
      }

      // Redo (Ctrl+Y or Cmd+Y)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) handleRedo();
      }

      // Ctrl/Cmd/Altと一緒に押された場合はブラウザのショートカット(Ctrl+Sなど)なので、ツールは切り替えない
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ツール切り替え
      switch (e.key.toLowerCase()) {
        case 'w': setTool('pen'); break;
        case 'e': setTool('eraser'); break;
        case 'f': setTool('bucket'); break;
        case 's': setTool('picker'); break;
        // ブラシサイズ変更 (1, 2, 3)
        case '1': setBrushSize(1); break;
        case '2': setBrushSize(2); break;
        case '3': setBrushSize(3); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTool, setBrushSize, canUndo, canRedo, handleUndo, handleRedo]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      <EditorHeader
        canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo}
        onNew={() => { if (window.confirm('キャンバスをリセットして新規作成しますか？')) newCanvas(); }}
        onImport={handleImport}
        onDownload={downloadImage}
      />

      {/* --- メインエディタ領域 --- */}
      <div style={{
        display: 'grid', gridTemplateColumns: '280px 1fr 280px', flex: 1,
        minHeight: 0, // これが無いと中身(左サイドバー)の高さまで伸びて、画面の下にはみ出す
        backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}>

        {/* --- 左サイドバー --- */}
        <aside style={{
          minWidth: '220px', maxWidth: '280px', // 幅を固定
          backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto'
        }}>
          {/* ツールはよく使うので上に置く */}
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

        {/* 中央エリア */}
        <main style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#1e1e1e'
        }}>
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
        <aside style={{
          borderLeft: '1px solid #e2e8f0', padding: '24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          backgroundColor: '#ffffff', overflowY: 'auto'
        }}>
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
