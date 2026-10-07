import { PixelIcon } from './PixelIcon';
import { CHECK_ICON, FLOPPY_ICON, WARNING_ICON } from './pixelIcons';
import type { SaveStatus } from '../../projects/saveStatus';

interface Props {
  status: SaveStatus;
  onRetry: () => void; // 保存に失敗したときの「再試行」
}

// ヘッダーに出す保存状態: ✓ 保存済み / 保存中… / ⚠ 保存失敗
// 保存中はフロッピーが点滅し、失敗は赤い警告が揺れる (動きは theme.css)
export function SaveStatusBadge({ status, onRetry }: Props) {
  if (status.kind === 'error') {
    return (
      <button type="button" className="vx-save vx-save--error" onClick={onRetry} title={`${status.message}。押すと、もう一度保存します`}>
        <span className="vx-save-icon"><PixelIcon {...WARNING_ICON} size={22} /></span>
        <span>保存失敗</span>
        <span className="vx-save-detail">{status.message}</span>
      </button>
    );
  }

  const saving = status.kind === 'saving' || status.kind === 'dirty'; // 未保存も、すぐ保存が始まるので「保存中」と同じ見せ方
  return (
    <div className={saving ? 'vx-save vx-save--saving' : 'vx-save vx-save--saved'} role="status" aria-live="polite">
      <span className="vx-save-icon">
        <PixelIcon {...(saving ? FLOPPY_ICON : CHECK_ICON)} size={22} />
      </span>
      <span>{saving ? '保存中…' : '保存済み'}</span>
    </div>
  );
}
