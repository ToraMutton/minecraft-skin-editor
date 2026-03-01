import { useRef, useEffect, useState } from 'react';

export default function CanvasEditor() {
  // キャンバス本体にアクセスするための参照
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 今選んでいる色 & マウスが押されているかどうかの状態
  const [color, setColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);

  // ドットを塗るメインの関数
  const drawPixel = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return; // クリックされてない時は塗らない
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 画面上のクリック位置を、64x64のピクセル座標に変換する計算
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    // 選択中の色で、1ピクセルを塗る
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      {/* 色を選ぶカラーパレット */}
      <input 
        type="color" 
        value={color} 
        onChange={(e) => setColor(e.target.value)} 
      />
      
      {/* 64x64のマイクラスキン用キャンバス */}
      <canvas
        ref={canvasRef}
        width={64}
        height={64}
        style={{ 
          width: '512px', 
          height: '512px', 
          imageRendering: 'pixelated',
          border: '2px solid #ccc',
          cursor: 'crosshair'
        }}
        onMouseDown={(e) => { setIsDrawing(true); drawPixel(e); }}
        onMouseUp={() => setIsDrawing(false)}
        onMouseLeave={() => setIsDrawing(false)}
        onMouseMove={drawPixel}
      />
    </div>
  );
}
