import { Shirt } from 'lucide-react';
import { Button } from './Button';
import type { SkinModel } from '../skin/layout';

const MODELS: { id: SkinModel; label: string; arm: number }[] = [
  { id: 'classic', label: 'Classic', arm: 4 },
  { id: 'slim', label: 'Slim', arm: 3 },
];

interface Props {
  model: SkinModel; // 今の作品のモデル
  onChange: (model: SkinModel) => void; // もう一方を押すと、今の作品をそのモデルに変換する
}

// 今の作品のモデル (腕の太さ)。もう一方を押すと、腕の絵を移して変換する (Undoで戻せる)
export function ModelPanel({ model, onChange }: Props) {
  return (
    <section className="vx-panel">
      <h2 className="vx-panel-title"><Shirt size={16} /> モデル</h2>
      <div className="vx-model-row">
        {MODELS.map(m => {
          const current = m.id === model;
          // Classic → Slim は、腕の外側の1列が消える (Undoで戻せる)
          const title = current
            ? `今のモデル (腕${m.arm}px)`
            : `${m.label}に変換します (腕が${m.arm}pxになります${m.id === 'slim' ? '。腕の外側の1列は消えます' : ''})。Undoで戻せます`;
          return (
            <Button key={m.id} selected={current} aria-pressed={current} title={title} onClick={() => onChange(m.id)}>
              {m.label}
              <span className="vx-model-hint">腕{m.arm}px</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
