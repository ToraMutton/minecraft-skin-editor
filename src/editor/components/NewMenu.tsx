import { useEffect, useRef, useState } from 'react';
import { PlusSquare, ChevronDown, UserRound, Square, FileUp, Sparkles } from 'lucide-react';
import { Button } from './Button';

interface Props {
  onNewStarter: () => void; // 素体から
  onNewBlank: () => void; // 白紙から
  onNewFromFile: (file: File) => void; // PNGから
}

// 「新規」メニュー: 素体から / 白紙から / PNGから / Quick Design (準備中)
// 1回のクリックでメニューが開き、もう1回のクリックで作り始められる
export function NewMenu({ onNewStarter, onNewBlank, onNewFromFile }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const enabledItems = () => [...(rootRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? [])];

  // 開いたら、最初の項目にフォーカスする
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLElement>('[role=menuitem]:not([aria-disabled=true])')?.focus();
  }, [open]);

  // メニューの外をクリックしたら閉じる
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // 矢印キーで項目を移動、Esc / Tab で閉じる
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const items = enabledItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Tab') close();
  };

  const choose = (action: () => void) => () => { close(true); action(); };

  return (
    <div className="vx-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <Button
        ref={triggerRef} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        title="新しいスキンを作る (今のスキンは保存されたまま残ります)"
      >
        <PlusSquare size={16} /> 新規 <ChevronDown size={14} />
      </Button>

      {open && (
        <div className="vx-menu-list" role="menu" aria-label="新しいスキンの作り方">
          <button type="button" role="menuitem" className="vx-menu-item" onClick={choose(onNewStarter)}>
            <UserRound size={16} /> 素体から <span className="vx-menu-hint">初期のキャラ</span>
          </button>
          <button type="button" role="menuitem" className="vx-menu-item" onClick={choose(onNewBlank)}>
            <Square size={16} /> 白紙から <span className="vx-menu-hint">透明</span>
          </button>
          <button type="button" role="menuitem" className="vx-menu-item" onClick={() => { close(true); fileInputRef.current?.click(); }}>
            <FileUp size={16} /> PNGから… <span className="vx-menu-hint">64×64</span>
          </button>
          {/* Phase 3 で追加する。今は押せない (aria-disabled で、スクリーンリーダーにも「使えない」と伝わる) */}
          <button type="button" role="menuitem" className="vx-menu-item" aria-disabled="true" tabIndex={-1} onClick={e => e.preventDefault()}>
            <Sparkles size={16} /> Quick Design <span className="vx-menu-hint">準備中</span>
          </button>
        </div>
      )}

      <input
        ref={fileInputRef} type="file" accept="image/png" style={{ display: 'none' }} aria-label="新しいスキンにするPNG"
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onNewFromFile(file); }}
      />
    </div>
  );
}
