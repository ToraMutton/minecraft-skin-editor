import { Focus, Grid, PenTool, Play, ChevronRight } from 'lucide-react';
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

// モードごとの名前・アイコンと、押したら切り替わる先
const MODES = {
  edit: { label: '編集モード', Icon: PenTool, next: 'pose' },
  pose: { label: 'アニメーションモード', Icon: Play, next: 'edit' },
} as const satisfies Record<ViewMode, { label: string; Icon: typeof PenTool; next: ViewMode }>;

// 3D表示の左上に浮かせる「見え方」の設定 (中央上だとモデルの頭に重なって塗りにくい)
export function ViewToggles({ isAutoFocus, onAutoFocusChange, showGuide, onShowGuideChange, mode, onModeChange }: Props) {
  const current = MODES[mode];
  const next = MODES[current.next];

  return (
    <div className="vx-floating">
      <Switch checked={isAutoFocus} onChange={onAutoFocusChange} icon={<Focus size={16} />}>オートフォーカス</Switch>
      <Switch checked={showGuide} onChange={onShowGuideChange} icon={<Grid size={16} />}>ガイド表示</Switch>

      {/* 今のモードを色・アイコン・名前で示し、右端に「押すと切り替わる先」を小さく出す */}
      <Button className={`vx-mode vx-mode--${mode}`} onClick={() => onModeChange(current.next)} title={`クリックで${next.label}へ`}>
        <current.Icon size={16} />
        {/* 2つの名前を同じ場所に重ねて置き、今のほうだけ見せる (切り替えてもボタンの幅が変わらないように) */}
        <span className="vx-mode-labels">
          {Object.entries(MODES).map(([key, m]) => (
            <span key={key} className={key === mode ? undefined : 'vx-mode-label--hidden'}>{m.label}</span>
          ))}
        </span>
        <span className="vx-mode-next" aria-hidden="true">
          <ChevronRight size={12} /><next.Icon size={12} />
        </span>
      </Button>
    </div>
  );
}
