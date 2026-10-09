import { useRef } from 'react';
import type { ReactNode } from 'react';

export interface Choice<T> {
  value: T;
  label: string; // 読み上げ・ツールチップに使う名前
  icon?: ReactNode;
  text?: string; // 見た目に出す文字 (省略すると label)
  colors?: string[]; // 色見本 (CSSの色)。複数なら縦帯に並べる
}

interface Props<T> {
  label: string; // グループの名前
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'chips' | 'swatches';
  disabled?: boolean;
}

// 1つだけ選ぶ選択肢のグループ (ラジオボタンの見た目を変えたもの)
//   ・Tab で入ると、選ばれている項目に止まる。矢印キーで隣へ移動すると、その場で選ばれる (ラジオボタンの標準の動き)
//   ・色見本は、色だけでは伝わらないので、名前をツールチップと読み上げに付ける
export function ChoiceGroup<T>({ label, choices, value, onChange, variant = 'chips', disabled }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, choices.findIndex(c => c.value === value));

  const move = (to: number) => {
    const next = (to + choices.length) % choices.length;
    refs.current[next]?.focus();
    onChange(choices[next].value);
  };
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(index + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(choices.length - 1); }
  };

  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={`vx-choice vx-choice--${variant}`}>
      {choices.map((c, i) => {
        const on = i === selected;
        const face = c.colors
          ? <span className="vx-choice-colors" style={{ background: c.colors.length === 1 ? c.colors[0] : `linear-gradient(90deg, ${c.colors.map((col, k) => `${col} ${(k / c.colors!.length) * 100}% ${((k + 1) / c.colors!.length) * 100}%`).join(', ')})` }} />
          : <>{c.icon}{c.text ?? c.label}</>;
        return (
          <button
            key={i} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} aria-label={c.colors ? c.label : undefined}
            title={c.label} tabIndex={on ? 0 : -1} disabled={disabled} className={`vx-choice-item${c.colors ? ' vx-choice-item--color' : ''}`}
            onClick={() => onChange(c.value)} onKeyDown={e => onKeyDown(e, i)}
          >
            {face}
          </button>
        );
      })}
    </div>
  );
}

interface MultiChoice<T extends string> { value: T; label: string }

interface MultiProps<T extends string> {
  label: string; // グループの名前
  choices: MultiChoice<T>[];
  value: T[] | undefined; // undefined = おまかせ / [] = なし / 並び = その組み合わせ
  onChange: (value: T[] | undefined) => void;
  normalize: (list: T[]) => T[]; // 組み合わせを整える (一緒に付けられないものを外すなど)
  conflicts: (value: T, selected: T[]) => boolean; // 今の選択と一緒に付けられないものか (そのボタンを押せなくする)
}

// 複数選べる選択肢のグループ (アクセサリー用)
//   「おまかせ」「なし」は、それぞれ1つの選び方。小物を押すと、おまかせから「その組み合わせ」に変わり、全部外すと「なし」になる
//   一緒に付けられない組み合わせ (帽子とカチューシャなど) は、押せなくして、理由をツールチップに出す
export function MultiChoiceGroup<T extends string>({ label, choices, value, onChange, normalize, conflicts }: MultiProps<T>) {
  const selected = value ?? [];
  const toggle = (item: T) => {
    const next = selected.includes(item) ? selected.filter(v => v !== item) : [...selected, item];
    onChange(normalize(next));
  };
  return (
    <div role="group" aria-label={label} className="vx-choice vx-choice--chips">
      <button type="button" aria-pressed={value === undefined} className="vx-choice-item" onClick={() => onChange(undefined)}>おまかせ</button>
      <button type="button" aria-pressed={value !== undefined && value.length === 0} className="vx-choice-item" onClick={() => onChange([])}>なし</button>
      {choices.map(c => {
        const on = selected.includes(c.value);
        const blocked = !on && conflicts(c.value, selected);
        return (
          <button
            key={c.value} type="button" aria-pressed={on} disabled={blocked} className="vx-choice-item"
            title={blocked ? '今選んでいるものとは、一緒に付けられません' : c.label} onClick={() => toggle(c.value)}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
