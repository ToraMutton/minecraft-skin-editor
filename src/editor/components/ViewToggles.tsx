import { Focus, Grid, PenTool, Eye } from 'lucide-react';
import { Button } from './Button';
import { Switch } from './Switch';
import type { ViewMode } from '../viewTypes';

interface Props {
  isAutoFocus: boolean;
  onAutoFocusChange: (on: boolean) => void;
  showGuide: boolean;
  onShowGuideChange: (on: boolean) => void;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

// 3D表示の左上に浮かせる「見え方」の設定 (中央上だとモデルの頭に重なって塗りにくい)
export function ViewToggles({ isAutoFocus, onAutoFocusChange, showGuide, onShowGuideChange, mode, onModeChange }: Props) {
  return (
    <div className="vx-floating">
      <Switch checked={isAutoFocus} onChange={onAutoFocusChange} icon={<Focus size={16} />}>オートフォーカス</Switch>
      <Switch checked={showGuide} onChange={onShowGuideChange} icon={<Grid size={16} />}>ガイド表示</Switch>
      <Button onClick={() => onModeChange(mode === 'edit' ? 'pose' : 'edit')} title="編集モードと鑑賞モードを切り替え">
        {mode === 'edit' ? <><PenTool size={16} /> 編集モード</> : <><Eye size={16} /> 鑑賞モード</>}
      </Button>
    </div>
  );
}
