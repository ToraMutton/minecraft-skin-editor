import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { HexColorPicker } from 'react-colorful';

// 外部ファイル化したものをインポート
import type { Tool, BrushSize } from './skinUtils';
import { SKIN_UV, SKIN_UV_OVER, applyPartUV, createGridTexture } from './skinUtils';
import { useSkinLogic } from './useSkinLogic';

import {
  Pencil, Eraser, PaintBucket, Pipette,
  Undo2, Redo2, Trash2, FolderOpen, Download,
  FlipHorizontal, Grid, PenTool, Eye, Focus, User, Layers, PlusSquare
} from 'lucide-react';

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9900FF', '#FF00FF',
  '#8B4513', '#D2B48C', '#FFC0CB', '#FFD700', '#ADFF2F', '#87CEEB'
];

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
  const [visibleParts, setVisibleParts] = useState({
    head: true, body: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true,
  });

  const [visibleOverlay, setVisibleOverlay] = useState({
    head: true, body: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true,
  });

  const [isAutoFocus, setIsAutoFocus] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  const [mode, setMode] = useState<'edit' | 'pose'>('edit');
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // useRef系
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const threeCtx = useRef<{ camera: THREE.PerspectiveCamera; parts: THREE.Mesh[], controls: OrbitControls } | null>(null);
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    const texture = new THREE.CanvasTexture(canvasRef.current!);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const baseMaterial = new THREE.MeshLambertMaterial({ map: texture, transparent: false, side: THREE.FrontSide });
    const overlayMaterial = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.1, side: THREE.FrontSide });

    const baseGridTex = createGridTexture('rgba(129, 212, 250, 0.4)');
    const overGridTex = createGridTexture('rgba(255, 255, 255, 0.5)');

    const baseGridMaterial = new THREE.MeshBasicMaterial({ map: baseGridTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const overGridMaterial = new THREE.MeshBasicMaterial({ map: overGridTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

    const createPart = (name: string, geo: THREE.BoxGeometry, overGeo: THREE.BoxGeometry, pos: THREE.Vector3) => {
      const mesh = new THREE.Mesh(geo, baseMaterial.clone());
      mesh.name = name;
      mesh.position.copy(pos);
      scene.add(mesh);

      const overMesh = new THREE.Mesh(overGeo, overlayMaterial.clone());
      overMesh.name = name + 'Over';
      mesh.add(overMesh);
      return mesh;
    };

    const headGeo = new THREE.BoxGeometry(8, 8, 8); applyPartUV(headGeo, SKIN_UV.head); headGeo.translate(0, 4, 0);
    const headOverGeo = new THREE.BoxGeometry(9, 9, 9); applyPartUV(headOverGeo, SKIN_UV_OVER.head); headOverGeo.translate(0, 4, 0);
    const head = createPart('head', headGeo, headOverGeo, new THREE.Vector3(0, 24, 0));

    const bodyGeo = new THREE.BoxGeometry(8, 12, 4); applyPartUV(bodyGeo, SKIN_UV.body);
    const bodyOverGeo = new THREE.BoxGeometry(8.5, 12.5, 4.5); applyPartUV(bodyOverGeo, SKIN_UV_OVER.body);
    const body = createPart('body', bodyGeo, bodyOverGeo, new THREE.Vector3(0, 18, 0));

    const armGeo = new THREE.BoxGeometry(4, 12, 4); armGeo.translate(0, -6, 0);
    const armOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5); armOverGeo.translate(0, -6, 0);

    const rArmGeo = armGeo.clone(); applyPartUV(rArmGeo, SKIN_UV.rightArm);
    const rArmOverGeo = armOverGeo.clone(); applyPartUV(rArmOverGeo, SKIN_UV_OVER.rightArm);
    const rArm = createPart('rightArm', rArmGeo, rArmOverGeo, new THREE.Vector3(-6, 24, 0));

    const lArmGeo = armGeo.clone(); applyPartUV(lArmGeo, SKIN_UV.leftArm);
    const lArmOverGeo = armOverGeo.clone(); applyPartUV(lArmOverGeo, SKIN_UV_OVER.leftArm);
    const lArm = createPart('leftArm', lArmGeo, lArmOverGeo, new THREE.Vector3(6, 24, 0));

    const rLegGeo = armGeo.clone(); applyPartUV(rLegGeo, SKIN_UV.rightLeg);
    const rLegOverGeo = armOverGeo.clone(); applyPartUV(rLegOverGeo, SKIN_UV_OVER.rightLeg);
    const rLeg = createPart('rightLeg', rLegGeo, rLegOverGeo, new THREE.Vector3(-2, 12, 0));

    const lLegGeo = armGeo.clone(); applyPartUV(lLegGeo, SKIN_UV.leftLeg);
    const lLegOverGeo = armOverGeo.clone(); applyPartUV(lLegOverGeo, SKIN_UV_OVER.leftLeg);
    const lLeg = createPart('leftLeg', lLegGeo, lLegOverGeo, new THREE.Vector3(2, 12, 0));

    const parts = [head, body, rArm, lArm, rLeg, lLeg];
    threeCtx.current = { camera, parts, controls };

    parts.forEach(part => {
      const baseGrid = new THREE.Mesh(part.geometry, baseGridMaterial);
      baseGrid.name = part.name + 'BaseGrid';
      part.add(baseGrid);

      const overMesh = part.children.find(c => c.name === part.name + 'Over') as THREE.Mesh;
      if (overMesh) {
        const overGrid = new THREE.Mesh(overMesh.geometry, overGridMaterial);
        overGrid.name = part.name + 'OverGrid';
        overMesh.add(overGrid);
      }
    });

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
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (object.material instanceof THREE.Material) object.material.dispose();
        }
      });
      baseMaterial.dispose(); overlayMaterial.dispose(); baseGridMaterial.dispose(); overGridMaterial.dispose(); baseGridTex.dispose(); overGridTex.dispose(); texture.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [canvasRef]);

  // --- 3D直接ペイント処理 (Raycaster) ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'pose') return;

    if (e.button !== 0 || !threeCtx.current) return;

    const { camera, parts, controls } = threeCtx.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const targetMeshes: THREE.Mesh[] = [];
    parts.forEach(part => {
      const partKey = part.name as keyof typeof visibleParts;
      const isBaseVisible = visibleParts[partKey];
      const isOverVisible = visibleOverlay[partKey];

      if (isBaseVisible) {
        if (isOverVisible) {
          const overMesh = part.children.find(c => c.name === part.name + 'Over');
          if (overMesh) targetMeshes.push(overMesh as THREE.Mesh);
        } else {
          targetMeshes.push(part);
        }
      }
    });

    const intersects = raycaster.intersectObjects(targetMeshes, false);

    if (intersects.length > 0) {
      controls.enabled = false;

      const hit = intersects[0];
      if (!hit.uv) return;

      const texX = Math.floor(hit.uv.x * 64);
      const texY = Math.floor((1 - hit.uv.y) * 64);

      pushUndo();
      if (tool === 'picker') {
        pickColor(texX, texY);
      } else if (tool === 'bucket') {
        floodFill(texX, texY, color);
        addRecentColor(color);
      } else {
        setIsDrawing(true);
        applyTool(texX, texY);
        if (tool === 'pen') addRecentColor(color);
      }
      notifyUpdate();
    } else {
      controls.enabled = true;
    }
  };

  // --- 表示切替と自動カメラズーム処理 ---
  useEffect(() => {
    if (!threeCtx.current) return;
    const { camera, parts, controls } = threeCtx.current;

    const activeMeshes: THREE.Mesh[] = [];
    let activeCount = 0;

    parts.forEach(part => {
      const partKey = part.name as keyof typeof visibleParts;
      const isActive = visibleParts[partKey];
      const isOverActive = visibleOverlay[partKey];

      part.visible = isActive;
      const baseGrid = part.children.find(c => c.name === part.name + 'BaseGrid');
      const overMesh = part.children.find(c => c.name === part.name + 'Over');

      if (overMesh) {
        overMesh.visible = isOverActive;
        const overGrid = overMesh.children.find(c => c.name === part.name + 'OverGrid');
        if (overGrid) overGrid.visible = showGuide && isOverActive;
        if (baseGrid) baseGrid.visible = showGuide && !isOverActive;
      }

      if (isActive) {
        activeMeshes.push(part);
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
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const targetMeshes: THREE.Mesh[] = [];
    parts.forEach(part => {
      const partKey = part.name as keyof typeof visibleParts;
      if (visibleParts[partKey]) {
        if (visibleOverlay[partKey]) {
          const overMesh = part.children.find(c => c.name === part.name + 'Over');
          if (overMesh) targetMeshes.push(overMesh as THREE.Mesh);
        } else {
          targetMeshes.push(part);
        }
      }
    });

    const intersects = raycaster.intersectObjects(targetMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (!hit.uv) return;
      const texX = Math.floor(hit.uv.x * 64);
      const texY = Math.floor((1 - hit.uv.y) * 64);

      applyTool(texX, texY);
      notifyUpdate();
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    if (threeCtx.current) {
      threeCtx.current.controls.enabled = true;
    }
  };

  // --- スタイル ---
  const colorDisabled = tool === 'eraser';

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '8px 12px', cursor: 'pointer',
    border: '1px solid #cbd5e1', borderRadius: '6px',
    fontSize: '13px', color: '#334155', backgroundColor: '#ffffff',
    transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  };

  const toolBtn = (t: Tool): React.CSSProperties => ({
    ...btnBase,
    backgroundColor: tool === t ? '#eff6ff' : '#ffffff',
    border: tool === t ? '2px solid #3b82f6' : '1px solid #cbd5e1',
    color: tool === t ? '#1d4ed8' : '#334155',
    padding: '8px', flex: 1
  });

  const toggleBtn = (active: boolean, activeColor: string = '#eff6ff'): React.CSSProperties => ({
    ...btnBase,
    backgroundColor: active ? activeColor : '#ffffff',
    border: active ? '1px solid #3b82f6' : '1px solid #cbd5e1',
    color: active ? '#1d4ed8' : '#334155',
  });

  const sizeBtn = (s: BrushSize): React.CSSProperties => ({
    ...btnBase, padding: '4px', width: '32px', height: '32px',
    backgroundColor: brushSize === s ? '#eff6ff' : '#ffffff',
    border: brushSize === s ? '2px solid #3b82f6' : '1px solid #cbd5e1',
    color: brushSize === s ? '#1d4ed8' : '#334155',
  });

  const sectionTitle = {
    fontSize: '10px',
    fontWeight: '700' as const,
    letterSpacing: '0.08em',
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    marginBottom: '8px'
  };

  // --- 右サイドバー：パーツUI描画関数 ---
  const togglePart = (part: keyof typeof visibleParts) => setVisibleParts(p => ({ ...p, [part]: !p[part] }));
  const toggleOverlay = (part: keyof typeof visibleOverlay) => setVisibleOverlay(p => ({ ...p, [part]: !p[part] }));

  const renderPart = (part: keyof typeof visibleParts, label: string, w: number, h: number) => {
    const isBase = visibleParts[part];
    const isOver = visibleOverlay[part];

    return (
      <div style={{ position: 'relative', width: w, height: h }}>
        <button
          onClick={() => togglePart(part)}
          title={`${label}の素肌を切替`}
          style={{
            width: '100%', height: '100%',
            backgroundColor: isBase ? '#eff6ff' : '#f1f5f9',
            border: isBase ? '2px solid #3b82f6' : '2px dashed #cbd5e1',
            borderRadius: '6px',
            color: isBase ? '#1d4ed8' : '#94a3b8',
            fontSize: '12px', fontWeight: 'bold',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'pointer', transition: 'all 0.15s ease', padding: 0
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.95)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
        >
          {label}
        </button>

        <button
          onClick={() => toggleOverlay(part)}
          title={`${label}の上着を切替`}
          style={{
            position: 'absolute', top: -8, right: -8,
            width: '24px', height: '24px',
            backgroundColor: isOver ? '#3b82f6' : '#f8fafc',
            border: isOver ? '2px solid #1d4ed8' : '2px solid #cbd5e1',
            borderRadius: '50%',
            color: isOver ? '#ffffff' : '#94a3b8',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'pointer', transition: 'transform 0.15s ease', padding: 0,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <Layers size={12} />
        </button>
      </div>
    );
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      {/* --- ヘッダー --- */}
      <header style={{
        backgroundColor: '#1e293b', color: '#ffffff', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 20
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>
          Vextra - Minecraft Skin Editor
        </h1>
        <div style={{ display: 'flex', gap: '12px', borderLeft: '1px solid #334155', paddingLeft: '12px' }}>
          {/* ファイル操作をグループ化 */}
          <button onClick={() => { if (window.confirm('キャンバスをリセットして新規作成しますか？')) newCanvas(); }}
            style={{ ...btnBase, backgroundColor: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#475569'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#334155'}
          >
            <PlusSquare size={16} /> 新規
          </button>

          <button onClick={() => fileInputRef.current?.click()}
            style={{ ...btnBase, backgroundColor: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#475569'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#334155'}
          >
            <FolderOpen size={16} /> 読込
          </button>
          <input ref={fileInputRef} type="file" accept=".png" onChange={handleImport} style={{ display: 'none' }} />

          <button onClick={downloadImage}
            style={{ ...btnBase, backgroundColor: '#3b82f6', color: '#ffffff', border: 'none' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            <Download size={16} /> 保存
          </button>
        </div>
      </header>

      {/* --- メインエディタ領域 --- */}
      <div style={{
        display: 'grid', gridTemplateColumns: '280px 1fr 280px', flex: 1,
        backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}>

        {/* --- 左サイドバー --- */}
        <aside style={{
          minWidth: '220px', maxWidth: '280px', // 幅を固定
          backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '28px', overflowY: 'auto'
        }}>

          {/* セクション1: カラーパレット */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={sectionTitle}>カラー</div>

            <div onPointerUp={() => addRecentColor(color)} style={{ opacity: colorDisabled ? 0.5 : 1, pointerEvents: colorDisabled ? 'none' : 'auto' }}>
              <HexColorPicker color={color} onChange={setColor} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: color, border: '1px solid #cbd5e1', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)', flexShrink: 0 }} />
              <input
                type="text"
                value={color}
                onChange={e => {
                  if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) setColor(e.target.value);
                }}
                onBlur={() => {
                  if (/^#[0-9a-f]{6}$/i.test(color)) addRecentColor(color);
                }}
                disabled={colorDisabled}
                style={{
                  width: '100%', padding: '6px 10px',
                  fontFamily: 'monospace', fontSize: '13px',
                  border: '1px solid #cbd5e1', borderRadius: '6px',
                  backgroundColor: '#f8fafc',
                  outline: 'none'
                }}
              />
            </div>

            {/* 最近使った色パレット - 常に表示 */}
            <div style={{
              minHeight: '44px',
              display: 'flex', gap: '4px', flexWrap: 'wrap',
              alignItems: 'center',
              padding: '8px',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px'
            }}>
              {recentColors.length === 0 ? (
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>最近使った色がここに出ます</span>
              ) : (
                recentColors.map((c, i) => (
                  <button key={`${c}-${i}`} onClick={() => { setColor(c); setTool('pen'); }} title={c}
                    style={{ width: '20px', height: '20px', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', padding: 0, transition: 'transform 0.1s' }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  />
                ))
              )}
            </div>

            {/* 大型パレット */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => { setColor(c); setTool('pen'); }} title={c}
                  style={{ aspectRatio: '1', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', cursor: 'pointer', padding: 0, transition: 'transform 0.1s' }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </div>

          {/* セクション2: ツール */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={sectionTitle}>ツール</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map((t) => {
                const icons = { pen: <Pencil size={18} />, eraser: <Eraser size={18} />, bucket: <PaintBucket size={18} />, picker: <Pipette size={18} /> };
                const titles = { pen: 'ペン (P)', eraser: '消しゴム (E)', bucket: 'バケツ塗り (B)', picker: 'スポイト (I)' };
                return (
                  <button key={t} onClick={() => setTool(t)} style={toolBtn(t)} title={titles[t]}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}
                  >
                    {icons[t]}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginLeft: '4px' }}>太さ</span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                {([1, 2, 3] as BrushSize[]).map(s => {
                  const sizeVisuals = {
                    1: <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'currentColor' }} />,
                    2: <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'currentColor' }} />,
                    3: <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'currentColor' }} />,
                  };
                  return (
                    <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)} title={`サイズ ${s}`}>
                      {sizeVisuals[s]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* セクション3: 操作 & 設定 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
            <div style={sectionTitle}>設定</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleUndo} disabled={!canUndo} style={{ ...btnBase, opacity: canUndo ? 1 : 0.4, flex: 1 }}><Undo2 size={16} /> Undo</button>
              <button onClick={handleRedo} disabled={!canRedo} style={{ ...btnBase, opacity: canRedo ? 1 : 0.4, flex: 1 }}><Redo2 size={16} /> Redo</button>
            </div>

            <button onClick={() => setMirror(!mirror)} style={toggleBtn(mirror)}><FlipHorizontal size={16} /> ミラー描画</button>
            <button onClick={() => setShowGuide(!showGuide)} style={toggleBtn(showGuide)}><Grid size={16} /> ガイド表示</button>

            <button
              onClick={() => setMode(mode === 'edit' ? 'pose' : 'edit')}
              style={{
                ...btnBase,
                backgroundColor: mode === 'pose' ? '#f1f5f9' : '#eff6ff',
                color: mode === 'pose' ? '#64748b' : '#1d4ed8',
                border: mode === 'pose' ? '1px solid #cbd5e1' : '1px solid #3b82f6',
              }}
            >
              {mode === 'edit' ? <><PenTool size={16} /> 編集モード</> : <><Eye size={16} /> 鑑賞モード</>}
            </button>

            <button onClick={() => { if (window.confirm('本当にキャンバスを全消ししますか？')) clearCanvas(); }}
              style={{ ...btnBase, color: '#ef4444', borderColor: '#fca5a5', backgroundColor: '#fef2f2', marginTop: '12px' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
            >
              <Trash2 size={16} /> キャンバスを全消し
            </button>
          </div>
        </aside>

        {/* 中央エリア */}
        <main style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#1e1e1e'
        }}>
          <button
            onClick={() => setIsAutoFocus(!isAutoFocus)}
            style={{
              ...toggleBtn(isAutoFocus, '#ffe0b2'),
              position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 10, borderRadius: '20px', padding: '8px 16px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}
          >
            <Focus size={16} />
            {isAutoFocus ? 'オートフォーカス: ON' : 'オートフォーカス: OFF'}
          </button>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px', color: '#1e293b' }}>
            <User size={20} />
            <span style={{ fontSize: '15px', fontWeight: 'bold' }}>パーツと上着の表示</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              {renderPart('head', '頭', 48, 48)}
            </div>

            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
              {renderPart('rightArm', '右', 24, 72)}
              {renderPart('body', '胴', 48, 72)}
              {renderPart('leftArm', '左', 24, 72)}
            </div>

            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
              {renderPart('rightLeg', '右', 24, 72)}
              {renderPart('leftLeg', '左', 24, 72)}
            </div>
          </div>

          <div style={{ marginTop: '40px', width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => {
                const allOver = !(visibleOverlay.head && visibleOverlay.body && visibleOverlay.rightArm && visibleOverlay.leftArm && visibleOverlay.rightLeg && visibleOverlay.leftLeg);
                setVisibleOverlay({ head: allOver, body: allOver, rightArm: allOver, leftArm: allOver, rightLeg: allOver, leftLeg: allOver });
              }}
              style={{ ...btnBase, justifyContent: 'center', backgroundColor: '#f1f5f9' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            >
              <Layers size={16} /> 上着をすべて切り替え
            </button>
          </div>
        </aside>

      </div>
    </div>
  );
}
