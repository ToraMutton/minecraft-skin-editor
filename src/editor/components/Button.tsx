import type { ButtonHTMLAttributes, Ref } from 'react';

// ボタンの種類
// default: 通常 / primary: 決定(保存) / danger: 取り消せない操作(全消し)
type Variant = 'default' | 'primary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  selected?: boolean; // 複数の中から1つを選ぶボタン(ツール・太さ)で、選ばれている → 緑
  off?: boolean; // 何かを非表示にしている → 暗い灰色
  flat?: boolean; // 厚みのない小さいボタン
  ref?: Ref<HTMLButtonElement>;
}

// アプリ共通のボタン。見た目は theme.css の .vx-btn で決める
export function Button({ variant = 'default', selected, off, flat, className, ...rest }: ButtonProps) {
  const classes = [
    'vx-btn',
    variant !== 'default' && `vx-btn--${variant}`,
    selected && 'vx-btn--selected',
    off && 'vx-btn--off',
    flat && 'vx-btn--flat',
    className,
  ];
  return <button type="button" className={classes.filter(Boolean).join(' ')} {...rest} />;
}
