import { User, Layers, Trash2 } from 'lucide-react';
import type { PartName } from '../skin/uv';
import type { PartVisibility } from '../viewTypes';
import { Button } from './Button';

interface Props {
  visibleParts: PartVisibility; // 素の層の表示
  visibleOverlay: PartVisibility; // 上着の層の表示
  onTogglePart: (part: PartName) => void;
  onToggleOverlay: (part: PartName) => void;
  onToggleAllOverlay: () => void;
  onClear: () => void;
}

// 人の形に並べたパーツの表示切り替えボタン (本体 = 素の層、右上の小さい四角 = 上着の層)
// 表示中は緑、非表示は暗い灰色
function PartToggle({ label, width, height, isBase, isOver, onToggleBase, onToggleOver }: {
  label: string; width: number; height: number;
  isBase: boolean; isOver: boolean;
  onToggleBase: () => void; onToggleOver: () => void;
}) {
  return (
    <div className="vx-part" style={{ width, height }}>
      <Button selected={isBase} off={!isBase} onClick={onToggleBase} title={`${label}の素肌を切替`}>
        {label}
      </Button>
      <Button flat selected={isOver} off={!isOver} className="vx-part-badge" onClick={onToggleOver} title={`${label}の上着を切替`}>
        <Layers size={12} />
      </Button>
    </div>
  );
}

export function PartPanel({ visibleParts, visibleOverlay, onTogglePart, onToggleOverlay, onToggleAllOverlay, onClear }: Props) {
  const part = (name: PartName, label: string, width: number, height: number) => (
    <PartToggle
      label={label} width={width} height={height}
      isBase={visibleParts[name]} isOver={visibleOverlay[name]}
      onToggleBase={() => onTogglePart(name)} onToggleOver={() => onToggleOverlay(name)}
    />
  );

  return (
    <>
      <section className="vx-panel">
        <h2 className="vx-panel-title"><User size={16} /> パーツと上着</h2>

        <div className="vx-body-map">
          <div className="vx-body-row">{part('head', '頭', 48, 48)}</div>
          <div className="vx-body-row">
            {part('rightArm', '右', 24, 72)}
            {part('body', '胴', 48, 72)}
            {part('leftArm', '左', 24, 72)}
          </div>
          <div className="vx-body-row">
            {part('rightLeg', '右', 24, 72)}
            {part('leftLeg', '左', 24, 72)}
          </div>
        </div>

        <Button onClick={onToggleAllOverlay}><Layers size={16} /> 上着をすべて切り替え</Button>
      </section>

      {/* 全消しは誤って押さないよう、ほかのボタンから離して一番下に置く */}
      <Button variant="danger" className="vx-push-bottom" onClick={onClear}>
        <Trash2 size={16} /> キャンバスを全消し
      </Button>
    </>
  );
}
