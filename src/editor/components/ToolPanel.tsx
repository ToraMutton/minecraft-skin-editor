import { Pencil, Eraser, PaintBucket, Pipette, FlipHorizontal } from 'lucide-react';
import type { Tool, BrushSize } from '../canvas/tools';
import { Button } from './Button';
import { sectionTitle } from './styles';

const TOOLS: { tool: Tool; icon: React.ReactNode; title: string }[] = [
  { tool: 'pen', icon: <Pencil size={18} />, title: 'ペン (W)' },
  { tool: 'eraser', icon: <Eraser size={18} />, title: '消しゴム (E)' },
  { tool: 'bucket', icon: <PaintBucket size={18} />, title: 'バケツ (F)' },
  { tool: 'picker', icon: <Pipette size={18} />, title: 'スポイト (S)' },
];

// 太さボタンの中の丸 (サイズ1〜3 → 直径4/8/12px)
const SIZES: BrushSize[] = [1, 2, 3];

interface Props {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  brushSize: BrushSize;
  onBrushSizeChange: (size: BrushSize) => void;
  mirror: boolean;
  onMirrorChange: (mirror: boolean) => void;
}

export function ToolPanel({ tool, onToolChange, brushSize, onBrushSizeChange, mirror, onMirrorChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={sectionTitle}>ツール</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {TOOLS.map(t => (
          <Button key={t.tool} selected={tool === t.tool} onClick={() => onToolChange(t.tool)} title={t.title} style={{ padding: '8px', flex: 1 }}>
            {t.icon}
          </Button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '8px' }}>
        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginLeft: '4px' }}>太さ</span>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          {SIZES.map(s => (
            <Button key={s} selected={brushSize === s} onClick={() => onBrushSizeChange(s)} title={`サイズ ${s}`} style={{ padding: '4px', width: '32px', height: '32px' }}>
              <div style={{ width: `${s * 4}px`, height: `${s * 4}px`, borderRadius: '50%', backgroundColor: 'currentColor' }} />
            </Button>
          ))}
        </div>
      </div>
      <Button pressed={mirror} onClick={() => onMirrorChange(!mirror)}><FlipHorizontal size={16} /> ミラー描画</Button>
    </div>
  );
}
