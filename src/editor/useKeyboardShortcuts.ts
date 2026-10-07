import { useEffect } from 'react';
import type { Tool, BrushSize } from './canvas/tools';

interface Options {
  enabled?: boolean; // false の間は、ショートカットを無効にする (ダイアログを開いている間など)
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: Tool) => void;
  onBrushSizeChange: (size: BrushSize) => void;
}

// キーボードショートカット
// W/E/F/S: ツール, 1/2/3: 太さ, Ctrl+Z: Undo, Ctrl+Shift+Z・Ctrl+Y: Redo (macOSはCmdでも可)
export function useKeyboardShortcuts({ enabled = true, canUndo, canRedo, onUndo, onRedo, onToolChange, onBrushSizeChange }: Options) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // input要素などに入力中の場合は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo / Redo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo(); // Cmd+Shift+Z
        } else {
          if (canUndo) onUndo(); // Cmd+Z
        }
      }

      // Redo (Ctrl+Y or Cmd+Y)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) onRedo();
      }

      // Ctrl/Cmd/Altと一緒に押された場合はブラウザのショートカット(Ctrl+Sなど)なので、ツールは切り替えない
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ツール切り替え
      switch (e.key.toLowerCase()) {
        case 'w': onToolChange('pen'); break;
        case 'e': onToolChange('eraser'); break;
        case 'f': onToolChange('bucket'); break;
        case 's': onToolChange('picker'); break;
        // ブラシサイズ変更 (1, 2, 3)
        case '1': onBrushSizeChange(1); break;
        case '2': onBrushSizeChange(2); break;
        case '3': onBrushSizeChange(3); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onToolChange, onBrushSizeChange, canUndo, canRedo, onUndo, onRedo]);
}
