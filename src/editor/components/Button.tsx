import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { btnBase } from './styles';

// ボタンの種類
// default: 通常 / dark: ヘッダー用 / primary: 決定(保存) / gray: 補助 / danger: 取り消せない操作(全消し)
type Variant = 'default' | 'dark' | 'primary' | 'gray' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  // 複数の中から1つを選ぶボタン(ツール・太さ)で、選ばれているか
  selected?: boolean;
  // ON/OFFを切り替えるボタン(ミラー・ガイドなど)で、ONか
  pressed?: boolean;
  pressedColor?: string; // ONのときの背景色
}

const VARIANT_CLASS: Record<Variant, string> = {
  default: '', dark: 'btn-dark', primary: 'btn-primary', gray: 'btn-gray', danger: 'btn-hover',
};

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  default: {}, dark: {}, primary: {},
  gray: { justifyContent: 'center', backgroundColor: '#f1f5f9' },
  danger: { color: '#ef4444', borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
};

// 選択中・ONのときの見た目 (選択中は枠が太く、ONは枠の色だけ変わる)
function stateStyle(selected: boolean | undefined, pressed: boolean | undefined, pressedColor: string): CSSProperties {
  if (selected !== undefined) {
    return {
      backgroundColor: selected ? '#eff6ff' : '#ffffff',
      border: selected ? '2px solid #3b82f6' : '1px solid #cbd5e1',
      color: selected ? '#1d4ed8' : '#334155',
    };
  }
  if (pressed !== undefined) {
    return {
      backgroundColor: pressed ? pressedColor : '#ffffff',
      border: pressed ? '1px solid #3b82f6' : '1px solid #cbd5e1',
      color: pressed ? '#1d4ed8' : '#334155',
    };
  }
  return {};
}

// アプリ共通のボタン。見た目はここに集めておき、デザイン変更はこのファイルだけで済むようにする
export function Button({ variant = 'default', selected, pressed, pressedColor = '#eff6ff', className, style, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={['btn-sink', VARIANT_CLASS[variant], className].filter(Boolean).join(' ')}
      style={{ ...btnBase, ...VARIANT_STYLE[variant], ...stateStyle(selected, pressed, pressedColor), ...style }}
      {...rest}
    />
  );
}
