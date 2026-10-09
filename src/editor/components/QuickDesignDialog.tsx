import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Dices, Heart, RotateCcw, Smile, Sparkles, X, Zap } from 'lucide-react';
import { Button } from './Button';
import { Switch } from './Switch';
import { ChoiceGroup, MultiChoiceGroup } from './ChoiceGroup';
import type { Choice } from './ChoiceGroup';
import { SkinFigures } from './SkinFigures';
import { useDialog } from './useDialog';
import { getLayout } from '../skin/layout';
import type { SkinModel } from '../skin/layout';
import type { Pixels } from '../canvas/layers';
import { designSkin, randomSeed, countAnswered, normalizeAccessories, ANSWER_COUNT, ACCESSORIES } from '../../generator';
import type { SpecAnswers, Generation, Accessory } from '../../generator';
import { cssColor } from '../../generator/color';
import { HAIR_PALETTE, SKIN_NAMES, SKIN_TONES, TOP_COLORS, BOTTOM_COLORS, ACCESSORY_COLORS } from '../../generator/palettes';

export interface QuickDesignResult {
  pixels: Pixels;
  generation: Generation;
  model: SkinModel;
  keepPaint: boolean;
}

interface Props {
  mode: 'create' | 'redo'; // create: 新しい作品を作る / redo: 今の作品の絵を作り直す (条件を変える)
  initialAnswers: SpecAnswers;
  initialSeed?: number;
  model: SkinModel; // 作るスキンのモデル (redo のときは今の作品のモデルで、変えられない)
  initialKeepPaint?: boolean; // redo: 「手描きを残す」の最初の状態
  onClose: () => void;
  onSubmit: (result: QuickDesignResult) => void;
}

const AUTO = { value: undefined, label: 'おまかせ', icon: <Dices size={14} /> };
const auto = <T,>(): Choice<T | undefined> => AUTO as Choice<T | undefined>;

// 質問ごとの選択肢 (最初は必ず「おまかせ」)
const MOODS: Choice<SpecAnswers['mood']>[] = [
  auto(), { value: 'cute', label: 'かわいい', icon: <Heart size={14} /> }, { value: 'cool', label: 'クール', icon: <Zap size={14} /> }, { value: 'simple', label: 'シンプル', icon: <Smile size={14} /> },
];
const HAIR: Choice<SpecAnswers['hair']>[] = [auto(), { value: 'short', label: 'ショート' }, { value: 'medium', label: 'ミディアム' }, { value: 'long', label: 'ロング' }, { value: 'ponytail', label: 'ポニーテール' }, { value: 'twintails', label: 'ツインテール' }, { value: 'bun', label: 'お団子' }];
const EYES: Choice<SpecAnswers['eyes']>[] = [auto(), { value: 'classic', label: 'ふつう' }, { value: 'lashes', label: 'ぱっちり' }, { value: 'sharp', label: 'つり目' }, { value: 'kawaii', label: '大きな目' }, { value: 'vertical', label: '縦目' }, { value: 'sideways', label: '横目' }];
const MOUTH: Choice<SpecAnswers['mouth']>[] = [auto(), { value: true, label: 'あり' }, { value: false, label: 'なし' }];
const ACCESSORY_LABELS: Record<Accessory, string> = { hat: '帽子', headband: 'カチューシャ', ribbon: 'リボン', glasses: 'メガネ', earrings: 'イヤリング', scarf: 'マフラー', gloves: '手袋' };
const ACCESSORY_CHOICES = ACCESSORIES.map(value => ({ value, label: ACCESSORY_LABELS[value] }));
// 帽子は、カチューシャ・リボンと一緒に付けられない (頭の上で重なる)
const accessoryConflicts = (item: Accessory, selected: Accessory[]) =>
  item === 'hat' ? selected.includes('headband') || selected.includes('ribbon') : (item === 'headband' || item === 'ribbon') && selected.includes('hat');
const TOPS: Choice<SpecAnswers['top']>[] = [auto(), { value: 'tshirt', label: 'Tシャツ' }, { value: 'hoodie', label: 'パーカー' }, { value: 'jacket', label: 'ジャケット' }];
const STRIPES: Choice<SpecAnswers['stripes']>[] = [auto(), { value: true, label: 'あり' }, { value: false, label: 'なし' }];
const BOTTOMS: Choice<SpecAnswers['bottom']>[] = [auto(), { value: 'pants', label: 'ズボン' }, { value: 'shorts', label: 'ショートパンツ' }];
const MODELS: Choice<SkinModel>[] = [{ value: 'classic', label: 'Classic (腕4px)' }, { value: 'slim', label: 'Slim (腕3px)' }];
const SKIN: Choice<number | undefined>[] = [auto(), ...SKIN_TONES.map((c, i) => ({ value: i as number | undefined, label: SKIN_NAMES[i], colors: [cssColor(c)] }))];
const HAIR_COLOR: Choice<number | undefined>[] = [auto(), ...HAIR_PALETTE.map((h, i) => ({ value: i as number | undefined, label: h.name, colors: [cssColor(h.color)] }))];
const swatches = (list: { name: string; color: Parameters<typeof cssColor>[0] }[]): Choice<number | undefined>[] => [auto(), ...list.map((c, i) => ({ value: i as number | undefined, label: c.name, colors: [cssColor(c.color)] }))];
const TOP_COLOR = swatches(TOP_COLORS);
const BOTTOM_COLOR = swatches(BOTTOM_COLORS);
const ACCESSORY_COLOR = swatches(ACCESSORY_COLORS);

export function QuickDesignDialog({ mode, initialAnswers, initialSeed, model: initialModel, initialKeepPaint = true, onClose, onSubmit }: Props) {
  const redo = mode === 'redo';
  const [answers, setAnswers] = useState<SpecAnswers>(initialAnswers);
  const [model, setModel] = useState<SkinModel>(initialModel);
  const [keepPaint, setKeepPaint] = useState(initialKeepPaint);
  // 見た案の履歴 (◀ で戻れる)。🎲 は新しい案を、今の位置の次に足す
  const [seeds, setSeeds] = useState<number[]>(() => [initialSeed ?? randomSeed()]);
  const [index, setIndex] = useState(0);
  const seed = seeds[index];

  const { dialogRef, onKeyDown } = useDialog(onClose);
  const createRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { createRef.current?.focus(); }, []); // 開いたらすぐ Enter で作れるように、「作る」にフォーカス

  const layout = getLayout(model);
  const design = useMemo(() => designSkin(answers, seed, layout), [answers, seed, layout]);

  const set = <K extends keyof SpecAnswers>(key: K, value: SpecAnswers[K]) =>
    setAnswers(prev => { const next = { ...prev }; if (value === undefined) delete next[key]; else next[key] = value; return next; });
  const rollDice = () => { setSeeds(prev => [...prev.slice(0, index + 1), randomSeed()]); setIndex(index + 1); };

  const answered = countAnswered(answers);
  const stripesOff = answers.top !== undefined && answers.top !== 'tshirt'; // 縞はTシャツだけ

  return (
    <div className="vx-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="vx-modal vx-qd" role="dialog" aria-modal="true" aria-labelledby="vx-qd-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="vx-modal-header">
          <div>
            <h2 id="vx-qd-title" className="vx-panel-title"><Sparkles size={18} /> Quick Design{redo && ' — 条件を変える'}</h2>
            <p className="vx-qd-lead">選んだ項目はそのとおりに、「おまかせ」の項目は組み合わせを考えて作ります。全部おまかせでもOK。</p>
          </div>
          <Button onClick={onClose} title="閉じる (Esc)" aria-label="閉じる"><X size={16} /></Button>
        </div>

        <div className="vx-qd-body">
          <div className="vx-qd-questions">
            <section className="vx-qd-section">
              <h3>雰囲気</h3>
              <ChoiceGroup label="雰囲気" choices={MOODS} value={answers.mood} onChange={v => set('mood', v)} />
            </section>
            <section className="vx-qd-section">
              <h3>髪</h3>
              <Row label="髪型"><ChoiceGroup label="髪型" choices={HAIR} value={answers.hair} onChange={v => set('hair', v)} /></Row>
              <Row label="髪の色"><ChoiceGroup label="髪の色" variant="swatches" choices={HAIR_COLOR} value={answers.hairColor} onChange={v => set('hairColor', v)} /></Row>
            </section>
            <section className="vx-qd-section">
              <h3>顔</h3>
              <Row label="肌の色"><ChoiceGroup label="肌の色" variant="swatches" choices={SKIN} value={answers.skin} onChange={v => set('skin', v)} /></Row>
              <Row label="目"><ChoiceGroup label="目" choices={EYES} value={answers.eyes} onChange={v => set('eyes', v)} /></Row>
              <Row label="口"><ChoiceGroup label="口" choices={MOUTH} value={answers.mouth} onChange={v => set('mouth', v)} /></Row>
            </section>
            <section className="vx-qd-section">
              <h3>小物</h3>
              <Row label="アクセサリー" hint="いくつでも">
                <MultiChoiceGroup label="アクセサリー" choices={ACCESSORY_CHOICES} value={answers.accessories} onChange={v => set('accessories', v)} normalize={normalizeAccessories} conflicts={accessoryConflicts} />
              </Row>
              <Row label="小物の色"><ChoiceGroup label="小物の色" variant="swatches" choices={ACCESSORY_COLOR} value={answers.accessoryColor} onChange={v => set('accessoryColor', v)} /></Row>
            </section>
            <section className="vx-qd-section">
              <h3>服</h3>
              <Row label="上着"><ChoiceGroup label="上着" choices={TOPS} value={answers.top} onChange={v => set('top', v)} /></Row>
              <Row label="上着の色"><ChoiceGroup label="上着の色" variant="swatches" choices={TOP_COLOR} value={answers.topColor} onChange={v => set('topColor', v)} /></Row>
              <Row label="縞" hint={stripesOff ? 'Tシャツのときだけ' : undefined}><ChoiceGroup label="縞" choices={STRIPES} value={stripesOff ? undefined : answers.stripes} onChange={v => set('stripes', v)} disabled={stripesOff} /></Row>
              <Row label="下"><ChoiceGroup label="下" choices={BOTTOMS} value={answers.bottom} onChange={v => set('bottom', v)} /></Row>
              <Row label="下の色"><ChoiceGroup label="下の色" variant="swatches" choices={BOTTOM_COLOR} value={answers.bottomColor} onChange={v => set('bottomColor', v)} /></Row>
            </section>
          </div>

          <aside className="vx-qd-preview" aria-label="プレビュー">
            <div className="vx-qd-stage" key={seed}>
              <SkinFigures pixels={design.pixels} layout={layout} />
            </div>
            <div className="vx-qd-dice">
              <Button onClick={() => setIndex(index - 1)} disabled={index === 0} title="前の案" aria-label="前の案"><ChevronLeft size={16} /></Button>
              <Button onClick={rollDice} title="別の案を作る"><Dices size={16} /> 別の案</Button>
              <Button onClick={() => setIndex(index + 1)} disabled={index >= seeds.length - 1} title="次の案" aria-label="次の案"><ChevronRight size={16} /></Button>
            </div>
            <p className="vx-qd-count" aria-live="polite">案 {index + 1} / {seeds.length} · 指定 {answered}・おまかせ {ANSWER_COUNT - answered}</p>
            <Button flat onClick={() => setAnswers({})} disabled={answered === 0} title="選んだ項目を全部「おまかせ」に戻す"><RotateCcw size={14} /> 全部おまかせに戻す</Button>
            <div className="vx-qd-model">
              <span className="vx-label">モデル</span>
              <ChoiceGroup label="モデル" choices={MODELS} value={model} onChange={setModel} disabled={redo} />
              {redo && <p className="vx-qd-note">今の作品のモデルで作り直します。変えるときは、右サイドバーの「モデル」から変換できます。</p>}
            </div>
          </aside>
        </div>

        <div className="vx-qd-footer">
          <Button onClick={onClose}>キャンセル</Button>
          <div className="vx-qd-footer-right">
            {redo && <Switch checked={keepPaint} onChange={setKeepPaint}>手描きを残す</Switch>}
            <Button ref={createRef} variant="primary" onClick={() => onSubmit({ pixels: design.pixels, generation: design.generation, model, keepPaint })}>
              <Check size={16} /> {redo ? 'この条件で作り直す' : 'この内容で作る'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 質問の1行: 左に名前、右に選択肢
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="vx-qd-row">
      <span className="vx-label">{label}{hint && <small className="vx-qd-hint"> ({hint})</small>}</span>
      {children}
    </div>
  );
}
