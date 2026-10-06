import type { CSSProperties } from 'react';

// ボタンの基本スタイル
export const btnBase: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '8px 12px', cursor: 'pointer',
  border: '1px solid #cbd5e1', borderRadius: '6px',
  fontSize: '13px', color: '#334155', backgroundColor: '#ffffff',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
};

// 3D表示の上に浮かせる丸いボタン
export const pillStyle: CSSProperties = {
  borderRadius: '20px', padding: '8px 16px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
};

// サイドバーの見出し
export const sectionTitle: CSSProperties = {
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '0.08em',
  color: '#94a3b8',
  textTransform: 'uppercase',
  marginBottom: '8px'
};
