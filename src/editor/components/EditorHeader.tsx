import { useRef } from 'react';
import { Undo2, Redo2, FolderOpen, Download, PlusSquare } from 'lucide-react';
import { Button } from './Button';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
}

export function EditorHeader({ canUndo, canRedo, onUndo, onRedo, onNew, onImport, onDownload }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header style={{
      backgroundColor: '#1e293b', color: '#ffffff', padding: '12px 24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>
          Vextra - Minecraft Skin Editor
        </h1>
        {/* Undo / Redo はどの画面サイズでも見えるようにヘッダーに置く */}
        <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #334155', paddingLeft: '24px' }}>
          <Button variant="dark" onClick={onUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)" style={{ opacity: canUndo ? 1 : 0.4 }}><Undo2 size={16} /> Undo</Button>
          <Button variant="dark" onClick={onRedo} disabled={!canRedo} title="やり直す (Ctrl+Shift+Z)" style={{ opacity: canRedo ? 1 : 0.4 }}><Redo2 size={16} /> Redo</Button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', borderLeft: '1px solid #334155', paddingLeft: '12px' }}>
        {/* ファイル操作をグループ化 */}
        <Button variant="dark" onClick={onNew}>
          <PlusSquare size={16} /> 新規
        </Button>

        <Button variant="dark" onClick={() => fileInputRef.current?.click()}>
          <FolderOpen size={16} /> 読込
        </Button>
        <input ref={fileInputRef} type="file" accept="image/png" onChange={onImport} style={{ display: 'none' }} />
        <Button variant="primary" onClick={onDownload}>
          <Download size={16} /> 保存
        </Button>
      </div>
    </header>
  );
}
