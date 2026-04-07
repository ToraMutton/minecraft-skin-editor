import { useRef, useCallback } from 'react'
import CanvasEditor from './CanvasEditor'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleTextureUpdate = useCallback(() => { }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <CanvasEditor
        canvasRef={canvasRef}
        onTextureUpdate={handleTextureUpdate}
      />
    </div>
  )
}

export default App
