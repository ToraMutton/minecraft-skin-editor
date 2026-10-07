import { useRef } from 'react';
import { Undo2, Redo2, FolderOpen, Download, LayoutGrid } from 'lucide-react';
import { Button } from './Button';
import { SaveStatusBadge } from './SaveStatusBadge';
import { NewMenu } from './NewMenu';
import type { SaveStatus } from '../../projects/saveStatus';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewStarter: () => void;
  onNewBlank: () => void;
  onNewFromFile: (file: File) => void;
  onOpenProjects: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
}

export function EditorHeader({ canUndo, canRedo, onUndo, onRedo, onNewStarter, onNewBlank, onNewFromFile, onOpenProjects, onImport, onDownload, saveStatus, onRetrySave }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="vx-header">
      <div className="vx-header-group">
        <h1 className="vx-logo">
          <span className="vx-logo-main">VEXTRA</span>
          <span className="vx-logo-sub">Minecraft Skin Editor</span>
        </h1>
        {/* Undo / Redo はどの画面サイズでも見えるようにヘッダーに置く */}
        <Button onClick={onUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)"><Undo2 size={16} /> Undo</Button>
        <Button onClick={onRedo} disabled={!canRedo} title="やり直す (Ctrl+Shift+Z)"><Redo2 size={16} /> Redo</Button>
      </div>

      {/* ファイル操作。目立たせるのは「書き出し」だけ */}
      <div className="vx-header-group">
        <SaveStatusBadge status={saveStatus} onRetry={onRetrySave} />
        <Button onClick={onOpenProjects}><LayoutGrid size={16} /> マイスキン</Button>
        <NewMenu onNewStarter={onNewStarter} onNewBlank={onNewBlank} onNewFromFile={onNewFromFile} />
        <Button onClick={() => fileInputRef.current?.click()} title="今のスキンに、PNGを読み込んで置き換えます (Undoで戻せます)"><FolderOpen size={16} /> 読込</Button>
        <input ref={fileInputRef} type="file" accept="image/png" onChange={onImport} style={{ display: 'none' }} aria-label="今のスキンに読み込むPNG" />
        <Button variant="primary" onClick={onDownload} title="PNGファイルとして書き出します (Minecraftに設定できます)"><Download size={16} /> 書き出し</Button>
      </div>
    </header>
  );
}
