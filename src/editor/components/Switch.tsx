import type { ReactNode } from 'react';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
  children: ReactNode; // ラベル
}

// ON/OFFのスイッチ (行全体が押せる)
// role="switch" と aria-checked で、スクリーンリーダーにもON/OFFが伝わる
export function Switch({ checked, onChange, icon, children }: Props) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="vx-switch" onClick={() => onChange(!checked)}>
      {icon}
      <span>{children}</span>
      <span className="vx-switch-track" />
    </button>
  );
}
