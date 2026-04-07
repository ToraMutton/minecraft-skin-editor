import { useRef, useCallback } from 'react'
import './App.css'
import CanvasEditor from './CanvasEditor'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleTextureUpdate = useCallback(() => {
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* タイトル */}
      <header style={{
        backgroundColor: '#1e293b',
        color: '#ffffff',
        padding: '12px 24px',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 20
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', letterSpacing: '1px' }}>
          Vextra - Minecraft Skin Editor
        </h1>
      </header>

      {/* 1画面レイアウト */}
      <div style={{ flex: 1, position: 'relative' }}>
        <CanvasEditor
          canvasRef={canvasRef}
          onTextureUpdate={handleTextureUpdate}
        />
      </div>
    </div>
  )
}

export default App
