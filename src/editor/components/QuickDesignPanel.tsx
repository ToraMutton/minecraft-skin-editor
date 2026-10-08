import { Dices, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { Switch } from './Switch';

interface Props {
  seed: number; // 今の絵を作った乱数の種 (案の番号として見せる)
  keepPaint: boolean;
  onKeepPaintChange: (keep: boolean) => void;
  onRegenerate: () => void; // 同じ条件で、新しい案を作る
  onChangeConditions: () => void; // 条件を変える (ダイアログを開く)
}

// Quick Design で作った作品の「もう一度作る」パネル
export function QuickDesignPanel({ seed, keepPaint, onKeepPaintChange, onRegenerate, onChangeConditions }: Props) {
  return (
    <section className="vx-panel" aria-label="Quick Design">
      <h2 className="vx-panel-title"><Sparkles size={16} /> Quick Design</h2>
      <div className="vx-qdpanel-body">
        <p className="vx-qdpanel-code" title="この絵を作ったときの番号。同じ条件で同じ番号なら、同じ絵になります">案 #{seed.toString(36)}</p>
        <Button variant="primary" onClick={onRegenerate} title={keepPaint ? '同じ条件で別の案に作り直します (手描きは残ります。Undoで戻せます)' : '同じ条件で別の案に作り直します (手描きも消えます。Undoで戻せます)'}>
          <Dices size={16} /> もう一度作る
        </Button>
        <Button onClick={onChangeConditions} title="質問を開いて、条件を変えて作り直します"><SlidersHorizontal size={16} /> 条件を変える…</Button>
        <Switch checked={keepPaint} onChange={onKeepPaintChange}>手描きを残す</Switch>
      </div>
    </section>
  );
}
