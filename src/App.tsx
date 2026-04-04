import { useRef, useState, useCallback } from 'react'
import './App.css'
import CanvasEditor from './CanvasEditor'
import SkinPreview3D from './SkinPreview3D'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [textureVersion, setTextureVersion] = useState(0)
  const [pose, setPose] = useState<'idle' | 'walk'>('idle')

  const handleTextureUpdate = useCallback(() => {
    setTextureVersion(v => v + 1)
  }, [])

  return (
    < div className="editor-container" >
      {/* タイトル */}
      < h1 > Vextra - Minecraft Skin Editor</h1 >
      {/* 左右レイアウト */}
      < div className="editor-layout" >
        {/* 2Dキャンバス */}
        < div className="editor-main" >
          {/* 付箋と関数を渡す */}
          < CanvasEditor
            canvasRef={canvasRef}
            onTextureUpdate={handleTextureUpdate}
          />
        </div >

        {/* 3Dプレビュー */}
        < div className="editor-preview" >
          {/* 付箋とカウンターを渡す */}
          < SkinPreview3D
            canvasRef={canvasRef}
            textureVersion={textureVersion}
            pose={pose}
          />
          {/* 解説文 */}
          < p className="preview-hint" > ドラッグで回転 / スクロールでズーム</p >
          <button onClick={() => setPose(pose === 'idle' ? 'walk' : 'idle')}>
            ポーズ切替: {pose === 'idle' ? '直立' : '歩行'}
          </button>
        </div >
      </div >
    </div >
  )
}

export default App
