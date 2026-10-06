import { Focus, Grid, PenTool, Eye } from 'lucide-react';
import { Button } from './Button';
import { pillStyle } from './styles';
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
    <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', whiteSpace: 'nowrap' }}>
      <Button pressed={isAutoFocus} pressedColor="#ffe0b2" onClick={() => onAutoFocusChange(!isAutoFocus)} style={pillStyle}>
        <Focus size={16} />
        {isAutoFocus ? 'オートフォーカス: ON' : 'オートフォーカス: OFF'}
      </Button>

      <Button pressed={showGuide} onClick={() => onShowGuideChange(!showGuide)} style={pillStyle}>
        <Grid size={16} /> ガイド表示
      </Button>

      <Button
        onClick={() => onModeChange(mode === 'edit' ? 'pose' : 'edit')}
        style={{
          backgroundColor: mode === 'pose' ? '#f1f5f9' : '#eff6ff',
          color: mode === 'pose' ? '#64748b' : '#1d4ed8',
          border: mode === 'pose' ? '1px solid #cbd5e1' : '1px solid #3b82f6',
          ...pillStyle
        }}
      >
        {mode === 'edit' ? <><PenTool size={16} /> 編集モード</> : <><Eye size={16} /> 鑑賞モード</>}
      </Button>
    </div>
  );
}
