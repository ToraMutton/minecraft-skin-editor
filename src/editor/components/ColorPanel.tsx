import { HexColorPicker } from 'react-colorful';
import { sectionTitle } from './styles';

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9900FF', '#FF00FF',
  '#8B4513', '#D2B48C', '#FFC0CB', '#FFD700', '#ADFF2F', '#87CEEB'
];

interface Props {
  color: string;
  onColorChange: (color: string) => void; // ピッカーや入力欄で色が変わったとき
  onColorCommit: (color: string) => void; // 色を決めたとき (最近使った色に追加する)
  onSwatchClick: (color: string) => void; // 最近使った色・プリセットを押したとき
  recentColors: string[];
  disabled: boolean; // 消しゴム中は色を選べない
}

export function ColorPanel({ color, onColorChange, onColorCommit, onSwatchClick, recentColors, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={sectionTitle}>カラー</div>

      <div onPointerUp={() => onColorCommit(color)} style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <HexColorPicker color={color} onChange={onColorChange} style={{ width: '100%', height: '130px' }} />
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: color, border: '1px solid #cbd5e1', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)', flexShrink: 0 }} />
        <input
          type="text"
          value={color}
          onChange={e => {
            if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) onColorChange(e.target.value);
          }}
          onBlur={() => {
            if (/^#[0-9a-f]{6}$/i.test(color)) onColorCommit(color);
          }}
          disabled={disabled}
          style={{
            width: '100%', padding: '6px 10px',
            fontFamily: 'monospace', fontSize: '13px',
            border: '1px solid #cbd5e1', borderRadius: '6px',
            backgroundColor: '#f8fafc',
            outline: 'none'
          }}
        />
      </div>

      {/* 最近使った色パレット - 常に表示 */}
      <div style={{
        minHeight: '44px',
        display: 'flex', gap: '4px', flexWrap: 'wrap',
        alignItems: 'center',
        padding: '8px',
        backgroundColor: '#f1f5f9',
        borderRadius: '8px'
      }}>
        {recentColors.length === 0 ? (
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>最近使った色がここに出ます</span>
        ) : (
          recentColors.map((c, i) => (
            <button key={`${c}-${i}`} onClick={() => onSwatchClick(c)} title={c}
              className="btn-sink"
              style={{ width: '20px', height: '20px', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            />
          ))
        )}
      </div>

      {/* プリセットパレット (10色×2行) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
        {PRESET_COLORS.map((c) => (
          <button key={c} onClick={() => onSwatchClick(c)} title={c}
            className="btn-sink"
            style={{ aspectRatio: '1', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
          />
        ))}
      </div>
    </div>
  );
}
