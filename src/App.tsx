import './App.css'
import CanvasEditor from './CanvasEditor.tsx'

function App() {
  return (
    <div className="editor-container">
      <h1>Minecraft Skin Editor</h1>
      <div className="canvas-area">
        <CanvasEditor />
      </div>
    </div>
  )
}

export default App
