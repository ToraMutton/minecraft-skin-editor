// --- 定数 ---
export const MAX_HISTORY = 100; // Undoできる回数 (1回あたり約36KBなので、100回で約3.6MB)
export const MAX_RECENT_COLORS = 16;
export const AUTOSAVE_KEY = 'vextora-mc-skin-editor-canvas';
export const UNREADABLE_BACKUP_KEY = 'vextora-mc-skin-editor-unreadable-backup'; // 読めなかった自動保存データの退避先
export const AUTOSAVE_DELAY = 1000;
export const LAST_PROJECT_KEY = 'vextra-last-opened-project'; // 最後に開いた作品の id (次に起動したとき、同じ作品を開くため)
