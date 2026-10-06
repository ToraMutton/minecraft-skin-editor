import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';

// 外部ファイル化したものをインポート
import { createSkinModel } from './editor/three/createSkinModel';
import type { SkinPart, PartName } from './editor/three/createSkinModel';
import { pickTexel } from './editor/three/raycast';
import { EditorHeader } from './editor/components/EditorHeader';
import { ToolPanel } from './editor/components/ToolPanel';
import { ColorPanel } from './editor/components/ColorPanel';
import { ViewToggles } from './editor/components/ViewToggles';
import type { ViewMode } from './editor/components/ViewToggles';
import { PartPanel } from './editor/components/PartPanel';
import type { PartVisibility } from './editor/components/PartPanel';
import { useSkinLogic } from './useSkinLogic';

const ALL_VISIBLE: PartVisibility = {
  head: true, body: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true,
};

interface Props {
  onTextureUpdate?: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function CanvasEditor({ onTextureUpdate, canvasRef }: Props) {
  const {
    color, setColor, tool, setTool, brushSize, setBrushSize, mirror, setMirror,
    isDrawing, setIsDrawing, canUndo, canRedo, recentColors, addRecentColor,
    notifyUpdate, pushUndo, handleUndo, handleRedo, floodFill, pickColor, applyTool,
    clearCanvas, newCanvas, downloadImage, handleImport
  } = useSkinLogic(canvasRef, onTextureUpdate);

  // 表示設定系
  const [visibleParts, setVisibleParts] = useState<PartVisibility>(ALL_VISIBLE);
  const [visibleOverlay, setVisibleOverlay] = useState<PartVisibility>(ALL_VISIBLE);

  const [isAutoFocus, setIsAutoFocus] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  const [mode, setMode] = useState<ViewMode>('edit');
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // useRef系
  const containerRef = useRef<HTMLDivElement>(null);

  const threeCtx = useRef<{ camera: THREE.PerspectiveCamera; parts: SkinPart[], controls: OrbitControls } | null>(null);
  const prevActiveCount = useRef(6);

  // --- 3Dキャンバスの初期化と描画ループ ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 16, 60);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 16, 0);
    controls.enablePan = false;

    controls.minDistance = 20;
    controls.maxDistance = 80;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null as any };

    // Three.js r155以降はライトの強さが物理単位になり、昔の書き方の値(0.7など)だと約1/πの暗さになる
    // 環境光 + 正面からの光 = π にして、カメラに正対する面がテクスチャ本来の色で表示されるようにする
    scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, Math.PI * 0.4); // 向きは描画ループでカメラに合わせる
    scene.add(dir);

    const texture = new THREE.CanvasTexture(canvasRef.current!);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const model = createSkinModel(texture);
    model.parts.forEach(part => scene.add(part.mesh));
    threeCtx.current = { camera, parts: model.parts, controls };

    // 鑑賞モードで手足を振るために取り出しておく
    const limb = (name: PartName) => model.parts.find(p => p.name === name)!.mesh;
    const rArm = limb('rightArm'), lArm = limb('leftArm'), rLeg = limb('rightLeg'), lLeg = limb('leftLeg');

    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      texture.needsUpdate = true;

      // ヘッドライト: 常にカメラの方向から照らし、今見ている面を本来の色で表示する
      dir.position.subVectors(camera.position, controls.target);

      if (modeRef.current === 'pose') {
        const time = Date.now() * 0.005;
        rArm.rotation.x = Math.sin(time) * 0.5; lArm.rotation.x = -Math.sin(time) * 0.5;
        rLeg.rotation.x = -Math.sin(time) * 0.5; lLeg.rotation.x = Math.sin(time) * 0.5;
      } else {
        rArm.rotation.x = 0; lArm.rotation.x = 0; rLeg.rotation.x = 0; lLeg.rotation.x = 0;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      window.removeEventListener('resize', handleResize);
      model.dispose();
      texture.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [canvasRef]);

  // --- 3D直接ペイント処理 (Raycaster) ---

  // 塗れる対象: 表示中のパーツのうち、上着が表示されていれば上着、そうでなければ素の層
  const paintTargets = (parts: SkinPart[]) =>
    parts.filter(part => visibleParts[part.name]).map(part => visibleOverlay[part.name] ? part.overlay : part.mesh);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'pose') return;

    if (e.button !== 0 || !threeCtx.current) return;

    const { camera, parts, controls } = threeCtx.current;
    const texel = pickTexel(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), camera, paintTargets(parts));

    // モデルに当たらなければ、ドラッグは視点の回転に使う
    if (!texel) {
      controls.enabled = true;
      return;
    }

    controls.enabled = false;
    const [texX, texY] = texel;

    if (tool === 'picker') {
      pickColor(texX, texY); // 色を読むだけなので履歴には積まない
    } else if (tool === 'bucket') {
      floodFill(texX, texY, color); // 履歴への保存はfloodFill内で行う
      addRecentColor(color);
    } else {
      pushUndo();
      setIsDrawing(true);
      applyTool(texX, texY);
      if (tool === 'pen') addRecentColor(color);
    }
    notifyUpdate();
  };

  // --- 表示切替と自動カメラズーム処理 ---
  useEffect(() => {
    if (!threeCtx.current) return;
    const { camera, parts, controls } = threeCtx.current;

    const activeMeshes: THREE.Mesh[] = [];
    let activeCount = 0;

    parts.forEach(part => {
      const isActive = visibleParts[part.name];
      const isOverActive = visibleOverlay[part.name];

      part.mesh.visible = isActive;
      part.overlay.visible = isOverActive;
      part.overlayGrid.visible = showGuide && isOverActive;
      part.baseGrid.visible = showGuide && !isOverActive;

      if (isActive) {
        activeMeshes.push(part.mesh);
        activeCount++;
      }
    });

    if (!isAutoFocus) return;

    const isAddingPart = activeCount > prevActiveCount.current;
    prevActiveCount.current = activeCount;

    const currentDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();

    if (activeCount === 6 || activeCount === 0) {
      const targetCenter = new THREE.Vector3(0, 16, 0);
      const targetCamPos = new THREE.Vector3().copy(targetCenter).add(currentDir.multiplyScalar(60));

      gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 0.6, ease: "power2.out" });
      gsap.to(controls.target, { x: targetCenter.x, y: targetCenter.y, z: targetCenter.z, duration: 0.6, ease: "power2.out", onUpdate: () => { controls.update() } });
      return;
    }

    if (isAddingPart) return;

    const box = new THREE.Box3();
    activeMeshes.forEach(mesh => box.expandByObject(mesh));

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    let distance = maxDim * 1.8 + 15;
    distance = Math.min(distance, 60);

    const targetCamPos = new THREE.Vector3().copy(center).add(currentDir.multiplyScalar(distance));

    gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 0.6, ease: "power2.out" });
    gsap.to(controls.target, { x: center.x, y: center.y, z: center.z, duration: 0.6, ease: "power2.out", onUpdate: () => { controls.update() } });

  }, [visibleParts, visibleOverlay, isAutoFocus, showGuide]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'pose' || !isDrawing || !threeCtx.current) return;

    const { camera, parts } = threeCtx.current;
    const texel = pickTexel(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), camera, paintTargets(parts));
    if (!texel) return;

    applyTool(texel[0], texel[1]);
    notifyUpdate();
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    if (threeCtx.current) {
      threeCtx.current.controls.enabled = true;
    }
  };

  // --- パーツの表示切り替え ---
  const togglePart = (part: PartName) => setVisibleParts(p => ({ ...p, [part]: !p[part] }));
  const toggleOverlay = (part: PartName) => setVisibleOverlay(p => ({ ...p, [part]: !p[part] }));
  const toggleAllOverlay = () => {
    const allOver = !(visibleOverlay.head && visibleOverlay.body && visibleOverlay.rightArm && visibleOverlay.leftArm && visibleOverlay.rightLeg && visibleOverlay.leftLeg);
    setVisibleOverlay({ head: allOver, body: allOver, rightArm: allOver, leftArm: allOver, rightLeg: allOver, leftLeg: allOver });
  };

  // --- キーボードショートカット ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input要素などに入力中の場合は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo / Redo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) handleRedo(); // Cmd+Shift+Z
        } else {
          if (canUndo) handleUndo(); // Cmd+Z
        }
      }

      // Redo (Ctrl+Y or Cmd+Y)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) handleRedo();
      }

      // Ctrl/Cmd/Altと一緒に押された場合はブラウザのショートカット(Ctrl+Sなど)なので、ツールは切り替えない
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ツール切り替え
      switch (e.key.toLowerCase()) {
        case 'w': setTool('pen'); break;
        case 'e': setTool('eraser'); break;
        case 'f': setTool('bucket'); break;
        case 's': setTool('picker'); break;
        // ブラシサイズ変更 (1, 2, 3)
        case '1': setBrushSize(1); break;
        case '2': setBrushSize(2); break;
        case '3': setBrushSize(3); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTool, setBrushSize, canUndo, canRedo, handleUndo, handleRedo]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      <EditorHeader
        canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo}
        onNew={() => { if (window.confirm('キャンバスをリセットして新規作成しますか？')) newCanvas(); }}
        onImport={handleImport}
        onDownload={downloadImage}
      />

      {/* --- メインエディタ領域 --- */}
      <div style={{
        display: 'grid', gridTemplateColumns: '280px 1fr 280px', flex: 1,
        minHeight: 0, // これが無いと中身(左サイドバー)の高さまで伸びて、画面の下にはみ出す
        backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}>

        {/* --- 左サイドバー --- */}
        <aside style={{
          minWidth: '220px', maxWidth: '280px', // 幅を固定
          backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto'
        }}>
          {/* ツールはよく使うので上に置く */}
          <ToolPanel
            tool={tool} onToolChange={setTool}
            brushSize={brushSize} onBrushSizeChange={setBrushSize}
            mirror={mirror} onMirrorChange={setMirror}
          />
          <ColorPanel
            color={color} onColorChange={setColor} onColorCommit={addRecentColor}
            onSwatchClick={c => { setColor(c); setTool('pen'); }}
            recentColors={recentColors}
            disabled={tool === 'eraser'}
          />
        </aside>

        {/* 中央エリア */}
        <main style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#1e1e1e'
        }}>
          <ViewToggles
            isAutoFocus={isAutoFocus} onAutoFocusChange={setIsAutoFocus}
            showGuide={showGuide} onShowGuideChange={setShowGuide}
            mode={mode} onModeChange={setMode}
          />

          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              width: '100%', height: '100%',
              touchAction: 'none',
              cursor: mode === 'edit' ? 'crosshair' : 'grab'
            }}
          />

          <canvas ref={canvasRef} width={64} height={64} style={{ display: 'none' }} />
        </main>

        {/* --- 右サイドバー --- */}
        <aside style={{
          borderLeft: '1px solid #e2e8f0', padding: '24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          backgroundColor: '#ffffff', overflowY: 'auto'
        }}>
          <PartPanel
            visibleParts={visibleParts} visibleOverlay={visibleOverlay}
            onTogglePart={togglePart} onToggleOverlay={toggleOverlay} onToggleAllOverlay={toggleAllOverlay}
            onClear={() => { if (window.confirm('本当にキャンバスを全消ししますか？')) clearCanvas(); }}
          />
        </aside>

      </div>
    </div>
  );
}
