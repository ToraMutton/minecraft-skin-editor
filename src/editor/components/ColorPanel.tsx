import { HexColorPicker } from 'react-colorful';

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

function Swatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button" title={color} aria-label={color} onClick={onClick}
      className={selected ? 'vx-swatch vx-swatch--selected' : 'vx-swatch'}
      style={{ backgroundColor: color }}
    />
  );
}

export function ColorPanel({ color, onColorChange, onColorCommit, onSwatchClick, recentColors, disabled }: Props) {
  // 大文字・小文字の違い(#ff0000 と #FF0000)を無視して、選択中の色か判定する
  const isCurrent = (c: string) => c.toLowerCase() === color.toLowerCase();

  return (
    <section className="vx-panel">
      <h2 className="vx-panel-title">カラー</h2>

      <div className={disabled ? 'vx-picker vx-picker--disabled' : 'vx-picker'} onPointerUp={() => onColorCommit(color)}>
        <HexColorPicker color={color} onChange={onColorChange} />
      </div>

      <div className="vx-hex-row">
        <span className="vx-color-preview" style={{ backgroundColor: color }} />
        <input
          className="vx-input"
          type="text"
          value={color}
          aria-label="カラーコード"
          onChange={e => {
            if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) onColorChange(e.target.value);
          }}
          onBlur={() => {
            if (/^#[0-9a-f]{6}$/i.test(color)) onColorCommit(color);
          }}
          disabled={disabled}
        />
      </div>

      {/* 最近使った色 - 常に表示 */}
      <div className="vx-swatches vx-swatches--recent">
        {recentColors.length === 0 ? (
          <span className="vx-empty">最近使った色がここに出ます</span>
        ) : (
          recentColors.map((c, i) => <Swatch key={`${c}-${i}`} color={c} selected={isCurrent(c)} onClick={() => onSwatchClick(c)} />)
        )}
      </div>

      {/* プリセット (10色×2行) */}
      <div className="vx-swatches vx-swatches--presets">
        {PRESET_COLORS.map(c => <Swatch key={c} color={c} selected={isCurrent(c)} onClick={() => onSwatchClick(c)} />)}
      </div>
    </section>
  );
}
