import { User, Layers, Trash2 } from 'lucide-react';
import type { PartName } from '../skin/uv';
import { Button } from './Button';

export type PartVisibility = Record<PartName, boolean>;

interface Props {
  visibleParts: PartVisibility; // 素の層の表示
  visibleOverlay: PartVisibility; // 上着の層の表示
  onTogglePart: (part: PartName) => void;
  onToggleOverlay: (part: PartName) => void;
  onToggleAllOverlay: () => void;
  onClear: () => void;
}

// 人の形に並べたパーツの表示切り替えボタン (本体 = 素の層、右上の丸 = 上着の層)
function PartToggle({ label, width, height, isBase, isOver, onToggleBase, onToggleOver }: {
  label: string; width: number; height: number;
  isBase: boolean; isOver: boolean;
  onToggleBase: () => void; onToggleOver: () => void;
}) {
  return (
    <div style={{ position: 'relative', width, height }}>
      <button
        className="btn-sink"
        onClick={onToggleBase}
        title={`${label}の素肌を切替`}
        style={{
          width: '100%', height: '100%',
          backgroundColor: isBase ? '#eff6ff' : '#f1f5f9',
          border: isBase ? '2px solid #3b82f6' : '2px dashed #cbd5e1',
          borderRadius: '6px',
          color: isBase ? '#1d4ed8' : '#94a3b8',
          fontSize: '12px', fontWeight: 'bold',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          cursor: 'pointer', transition: 'all 0.15s ease', padding: 0
        }}
      >
        {label}
      </button>

      <button
        className="btn-sink"
        onClick={onToggleOver}
        title={`${label}の上着を切替`}
        style={{
          position: 'absolute', top: -8, right: -8,
          width: '24px', height: '24px',
          backgroundColor: isOver ? '#3b82f6' : '#f8fafc',
          border: isOver ? '2px solid #1d4ed8' : '2px solid #cbd5e1',
          borderRadius: '50%',
          color: isOver ? '#ffffff' : '#94a3b8',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          cursor: 'pointer', transition: 'transform 0.15s ease', padding: 0,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        <Layers size={12} />
      </button>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px', color: '#1e293b' }}>
        <User size={20} />
        <span style={{ fontSize: '15px', fontWeight: 'bold' }}>パーツと上着の表示</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
          {part('head', '頭', 48, 48)}
        </div>

        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
          {part('rightArm', '右', 24, 72)}
          {part('body', '胴', 48, 72)}
          {part('leftArm', '左', 24, 72)}
        </div>

        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
          {part('rightLeg', '右', 24, 72)}
          {part('leftLeg', '左', 24, 72)}
        </div>
      </div>

      <div style={{ marginTop: '40px', width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Button variant="gray" onClick={onToggleAllOverlay}>
          <Layers size={16} /> 上着をすべて切り替え
        </Button>
      </div>

      {/* 全消しは誤って押さないよう、ほかのボタンから離して一番下に置く */}
      <div style={{ marginTop: 'auto', paddingTop: '24px', width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Button variant="danger" onClick={onClear}>
          <Trash2 size={16} /> キャンバスを全消し
        </Button>
      </div>
    </>
  );
}
