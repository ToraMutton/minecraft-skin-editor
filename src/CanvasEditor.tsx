import { useRef, useState } from 'react';

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [color, setColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false); 

  const drawPixel = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (isEraser) {
      // 消しゴム：1ピクセル分を透明にくり抜く
      ctx.clearRect(x, y, 1, 1);
    } else {
      // ペン：選択中の色で塗る
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  };

  // 全消し機能：キャンバス全体を透明にする
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // キャンバスのデータをPNG画像形式のURLに変換
    const dataUrl = canvas.toDataURL('image/png');
    
    // 見えないリンクを裏で作り、自動でクリックさせる
    const link = document.createElement('a');
    link.download = 'NewSkin.png'; // 保存されるデフォルトのファイル名
    link.href = dataUrl;
    link.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
      
      {/* ツールバー（色、消しゴム、全消し） */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input 
          type="color" 
          value={color} 
          onChange={(e) => setColor(e.target.value)} 
          disabled={isEraser} // 消しゴム中は色変更をロック
          style={{ cursor: isEraser ? 'not-allowed' : 'pointer' }}
        />
        <button 
          onClick={() => setIsEraser(!isEraser)}
          style={{ 
            backgroundColor: isEraser ? '#ffcccc' : '#f0f0f0',
            border: '1px solid #ccc',
            padding: '5px 10px',
            cursor: 'pointer'
          }}
        >
          {isEraser ? '消しゴムモード (ON)' : 'ペンモード'}
        </button>
        <button 
          onClick={clearCanvas}
          style={{ padding: '5px 10px', cursor: 'pointer' }}
        >
          全消し 🗑️
        </button>

        {/* ダウンロードボタン */}
        <button 
          onClick={downloadImage}
          style={{ 
            padding: '5px 10px', 
            cursor: 'pointer', 
            backgroundColor: '#e0f7fa', 
            border: '1px solid #ccc' 
          }}
        >
          保存 💾
        </button>
      </div>
    
      {/* キャンバス */}
      <canvas
        ref={canvasRef}
        width={64}
        height={64}
        style={{ 
          width: '512px', 
          height: '512px', 
          imageRendering: 'pixelated',
          border: '2px solid #555',
          cursor: 'crosshair',
          // 背景を透明とグレーの市松模様にする
          backgroundImage: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%)',
          backgroundSize: '32px 32px'
        }}
        onMouseDown={(e) => { setIsDrawing(true); drawPixel(e); }}
        onMouseUp={() => setIsDrawing(false)}
        onMouseLeave={() => setIsDrawing(false)}
        onMouseMove={drawPixel}
      />
    </div>
  );
}
