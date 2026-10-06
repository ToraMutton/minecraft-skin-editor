import type { PartName } from './skin/uv';

// パーツごとの表示/非表示
export type PartVisibility = Record<PartName, boolean>;

// edit: 塗れる / pose: 手足が動く鑑賞用
export type ViewMode = 'edit' | 'pose';
