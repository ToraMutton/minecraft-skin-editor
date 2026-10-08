import { useEffect, useRef } from 'react';

// ダイアログ共通の動き (マイスキン・Quick Design で共有)
//   ・開いたら、ダイアログ(または initialFocus)にフォーカスを移す
//   ・Esc で onEscape を呼ぶ。ダイアログ内の要素が消えるとフォーカスが外れて、ダイアログ自身では Esc を受け取れなくなるので、画面全体で受け取る
//   ・Tab は、ダイアログの中だけを回る (外のエディタにフォーカスが逃げない)
const FOCUSABLE = 'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), [tabindex="0"]';

export function useDialog(onEscape: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape);
  useEffect(() => { escapeRef.current = onEscape; }, [onEscape]);

  // 開いたら、ダイアログにフォーカスを移す (キーボードで操作できるように)
  useEffect(() => { dialogRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      escapeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return { dialogRef, onKeyDown };
}
