import { Pencil, Eraser, PaintBucket, Pipette, FlipHorizontal } from 'lucide-react';
import type { Tool, BrushSize } from '../canvas/tools';
import { Button } from './Button';
import { Switch } from './Switch';

const TOOLS: { tool: Tool; icon: React.ReactNode; title: string }[] = [
  { tool: 'pen', icon: <Pencil size={20} />, title: 'ペン (W)' },
  { tool: 'eraser', icon: <Eraser size={20} />, title: '消しゴム (E)' },
  { tool: 'bucket', icon: <PaintBucket size={20} />, title: 'バケツ (F)' },
  { tool: 'picker', icon: <Pipette size={20} />, title: 'スポイト (S)' },
];

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
    <section className="vx-panel">
      <h2 className="vx-panel-title">ツール</h2>
      <div className="vx-tools">
        {TOOLS.map(t => (
          <Button key={t.tool} selected={tool === t.tool} onClick={() => onToolChange(t.tool)} title={t.title} aria-label={t.title}>
            {t.icon}
          </Button>
        ))}
      </div>
      <div className="vx-size-row">
        <span className="vx-label">太さ</span>
        <div className="vx-sizes">
          {SIZES.map(s => (
            <Button key={s} selected={brushSize === s} onClick={() => onBrushSizeChange(s)} title={`サイズ ${s}`} aria-label={`サイズ ${s}`}>
              {/* 太さ1〜3 → 一辺4/8/12pxの四角 */}
              <span className="vx-size-dot" style={{ width: s * 4, height: s * 4 }} />
            </Button>
          ))}
        </div>
      </div>
      <Switch checked={mirror} onChange={onMirrorChange} icon={<FlipHorizontal size={16} />}>ミラー描画</Switch>
    </section>
  );
}
