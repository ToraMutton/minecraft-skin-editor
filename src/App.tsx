import { useRef, useCallback } from 'react'
import './App.css'
import CanvasEditor from './CanvasEditor'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleTextureUpdate = useCallback(() => {
  }, [])

  return (
    <div className="editor-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* タイトル */}
      <h1>Vextra - Minecraft Skin Editor</h1>

      {/* 1画面レイアウト */}
      <div className="editor-main" style={{ marginTop: '20px' }}>
        <CanvasEditor
          canvasRef={canvasRef}
          onTextureUpdate={handleTextureUpdate}
        />
      </div>
    </div>
  )
}

export default App
