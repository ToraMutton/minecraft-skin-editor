import { useRef, useState, useEffect } from 'react';

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null); // ガイドライン用のキャンバス参照

  const [color, setColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  const [showGuide, setShowGuide] = useState(true); // ガイドの表示状態

  // ガイドラインの描画処理
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 一旦クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ガイド表示ONの時のみ枠線を描画
    if (showGuide) {
      ctx.lineWidth = 1;

      // === ベースレイヤー（赤）===
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';

      // 上半分 (y=0〜31): 頭・胴体・右腕・右足
      ctx.strokeRect(0, 0, 32, 16);    // 頭
      ctx.strokeRect(16, 16, 24, 16);  // 胴体
      ctx.strokeRect(40, 16, 16, 16);  // 右腕
      ctx.strokeRect(0, 16, 16, 16);   // 右足

      // 下半分 (y=48〜63): 左腕・左足
      ctx.strokeRect(32, 48, 16, 16);  // 左腕
      ctx.strokeRect(16, 48, 16, 16);  // 左足

      // === オーバーレイヤー（装飾、緑）===
      ctx.strokeStyle = 'rgba(0, 180, 0, 0.5)';

      // 頭オーバーレイ (y=0〜15)
      ctx.strokeRect(32, 0, 32, 16);   // 頭（装飾レイヤー）

      // 胴体・腕・足のオーバーレイ (y=32〜47)
      ctx.strokeRect(0, 32, 16, 16);   // 右足（装飾レイヤー）
      ctx.strokeRect(16, 32, 24, 16);  // 胴体（装飾レイヤー）
      ctx.strokeRect(40, 32, 16, 16);  // 右腕（装飾レイヤー）

      // 左腕・左足のオーバーレイ (y=48〜63)
      ctx.strokeRect(0, 48, 16, 16);   // 左足（装飾レイヤー）
      ctx.strokeRect(48, 48, 16, 16);  // 左腕（装飾レイヤー）

      // === 顔の正面ハイライト（青）===
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
      ctx.strokeRect(8, 8, 8, 8);      // 顔の正面（8x8）
    }
  }, [showGuide]);

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

      {/* ツールバー（色、消しゴム、全消し、ダウンロード、ガイド切替） */}
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

        {/* ガイド切り替えボタン */}
        <button
          onClick={() => setShowGuide(!showGuide)}
          style={{
            padding: '5px 10px',
            cursor: 'pointer',
            backgroundColor: showGuide ? '#fff3e0' : '#f0f0f0',
            border: '1px solid #ccc'
          }}
        >
          {showGuide ? 'ガイド表示 (ON)' : 'ガイド表示 (OFF)'}
        </button>
      </div>

      {/* キャンバスエリア（描画用とガイド用を重ねる） */}
      <div style={{ position: 'relative', width: '512px', height: '512px', border: '2px solid #555' }}>

        {/* 描画用キャンバス */}
        <canvas
          ref={canvasRef}
          width={64}
          height={64}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            imageRendering: 'pixelated',
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

        {/* ガイド用キャンバス（pointerEvents: 'none' でクリックを下のキャンバスに貫通させる） */}
        <canvas
          ref={overlayRef}
          width={64}
          height={64}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
