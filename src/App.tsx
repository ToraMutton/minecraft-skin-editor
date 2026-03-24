import { useRef, useState, useCallback } from 'react'
import './App.css'
import CanvasEditor from './CanvasEditor'
import SkinPreview3D from './SkinPreview3D'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [textureVersion, setTextureVersion] = useState(0)

  const handleTextureUpdate = useCallback(() => {
    setTextureVersion(v => v + 1)
  }, [])

  return (
    <div className="editor-container">
      <h1>Vextra - Minecraft Skin Editor</h1>
      <div className="editor-layout">
        <div className="editor-main">
          <CanvasEditor
            canvasRef={canvasRef}
            onTextureUpdate={handleTextureUpdate}
          />
        </div>
        <div className="editor-preview">
          <SkinPreview3D
            canvasRef={canvasRef}
            textureVersion={textureVersion}
          />
          <p className="preview-hint">ドラッグで回転 / スクロールでズーム</p>
        </div>
      </div>
    </div>
  )
}

export default App
