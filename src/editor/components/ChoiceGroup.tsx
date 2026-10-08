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
