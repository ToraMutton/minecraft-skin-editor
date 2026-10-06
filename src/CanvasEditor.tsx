import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';
import { HexColorPicker } from 'react-colorful';

// 外部ファイル化したものをインポート
import type { Tool, BrushSize } from './editor/canvas/tools';
import { createSkinModel } from './editor/three/createSkinModel';
import type { SkinPart, PartName } from './editor/three/createSkinModel';
import { pickTexel } from './editor/three/raycast';
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

  // --- スタイル ---
  const colorDisabled = tool === 'eraser';

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    padding: '8px 12px', cursor: 'pointer',
    border: '1px solid #cbd5e1', borderRadius: '6px',
    fontSize: '13px', color: '#334155', backgroundColor: '#ffffff',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
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

  // 3D表示の上に浮かせる丸いボタン
  const pillStyle: React.CSSProperties = {
    borderRadius: '20px', padding: '8px 16px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
  };

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
          className="btn-sink"
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
        >
          {label}
        </button>

        <button
          className="btn-sink"
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
        >
          <Layers size={12} />
        </button>
      </div>
    );
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

      {/* --- ヘッダー --- */}
      <header style={{
        backgroundColor: '#1e293b', color: '#ffffff', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>
            Vextra - Minecraft Skin Editor
          </h1>
          {/* Undo / Redo はどの画面サイズでも見えるようにヘッダーに置く */}
          <div style={{ display: 'flex', gap: '8px', borderLeft: '1px solid #334155', paddingLeft: '24px' }}>
            <button onClick={handleUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)" className="btn-sink btn-dark" style={{ ...btnBase, opacity: canUndo ? 1 : 0.4 }}><Undo2 size={16} /> Undo</button>
            <button onClick={handleRedo} disabled={!canRedo} title="やり直す (Ctrl+Shift+Z)" className="btn-sink btn-dark" style={{ ...btnBase, opacity: canRedo ? 1 : 0.4 }}><Redo2 size={16} /> Redo</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', borderLeft: '1px solid #334155', paddingLeft: '12px' }}>
          {/* ファイル操作をグループ化 */}
          <button onClick={() => { if (window.confirm('キャンバスをリセットして新規作成しますか？')) newCanvas(); }}
            className="btn-sink btn-dark"
            style={btnBase}
          >
            <PlusSquare size={16} /> 新規
          </button>

          <button onClick={() => fileInputRef.current?.click()}
            className="btn-sink btn-dark"
            style={btnBase}
          >
            <FolderOpen size={16} /> 読込
          </button>
          <input ref={fileInputRef} type="file" accept="image/png" onChange={handleImport} style={{ display: 'none' }} />
          <button onClick={downloadImage}
            className="btn-sink btn-primary"
            style={btnBase}
          >
            <Download size={16} /> 保存
          </button>
        </div>
      </header>

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

          {/* セクション1: ツール (よく使うので上に置く) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={sectionTitle}>ツール</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map((t) => {
                const icons = { pen: <Pencil size={18} />, eraser: <Eraser size={18} />, bucket: <PaintBucket size={18} />, picker: <Pipette size={18} /> };
                const titles = { pen: 'ペン (W)', eraser: '消しゴム (E)', bucket: 'バケツ (F)', picker: 'スポイト (S)' };
                return (
                  <button key={t}
                    className="btn-sink"
                    onClick={() => setTool(t)} style={toolBtn(t)} title={titles[t]}
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
                    <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)} title={`サイズ ${s}`} className="btn-sink">
                      {sizeVisuals[s]}
                    </button>
                  )
                })}
              </div>
            </div>
            <button onClick={() => setMirror(!mirror)} style={toggleBtn(mirror)} className="btn-sink"><FlipHorizontal size={16} /> ミラー描画</button>
          </div>

          {/* セクション2: カラーパレット */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={sectionTitle}>カラー</div>

            <div onPointerUp={() => addRecentColor(color)} style={{ opacity: colorDisabled ? 0.5 : 1, pointerEvents: colorDisabled ? 'none' : 'auto' }}>
              <HexColorPicker color={color} onChange={setColor} style={{ width: '100%', height: '130px' }} />
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
                    className="btn-sink"
                    style={{ width: '20px', height: '20px', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                  />
                ))
              )}
            </div>

            {/* プリセットパレット (10色×2行) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => { setColor(c); setTool('pen'); }} title={c}
                  className="btn-sink"
                  style={{ aspectRatio: '1', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                />
              ))}
            </div>
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
          {/* 見え方の設定は3D表示の左上にまとめる (中央上だとモデルの頭に重なって塗りにくい) */}
          <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', whiteSpace: 'nowrap' }}>
            <button
              onClick={() => setIsAutoFocus(!isAutoFocus)}
              className="btn-sink"
              style={{ ...toggleBtn(isAutoFocus, '#ffe0b2'), ...pillStyle }}
            >
              <Focus size={16} />
              {isAutoFocus ? 'オートフォーカス: ON' : 'オートフォーカス: OFF'}
            </button>

            <button onClick={() => setShowGuide(!showGuide)} className="btn-sink" style={{ ...toggleBtn(showGuide), ...pillStyle }}>
              <Grid size={16} /> ガイド表示
            </button>

            <button
              onClick={() => setMode(mode === 'edit' ? 'pose' : 'edit')}
              className="btn-sink"
              style={{
                ...btnBase,
                backgroundColor: mode === 'pose' ? '#f1f5f9' : '#eff6ff',
                color: mode === 'pose' ? '#64748b' : '#1d4ed8',
                border: mode === 'pose' ? '1px solid #cbd5e1' : '1px solid #3b82f6',
                ...pillStyle
              }}
            >
              {mode === 'edit' ? <><PenTool size={16} /> 編集モード</> : <><Eye size={16} /> 鑑賞モード</>}
            </button>
          </div>

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
              className="btn-sink btn-gray"
              style={{ ...btnBase, justifyContent: 'center', backgroundColor: '#f1f5f9' }}
            >
              <Layers size={16} /> 上着をすべて切り替え
            </button>
          </div>

          {/* 全消しは誤って押さないよう、ほかのボタンから離して一番下に置く */}
          <div style={{ marginTop: 'auto', paddingTop: '24px', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => { if (window.confirm('本当にキャンバスを全消ししますか？')) clearCanvas(); }}
              className="btn-sink btn-hover"
              style={{ ...btnBase, color: '#ef4444', borderColor: '#fca5a5', backgroundColor: '#fef2f2' }}
            >
              <Trash2 size={16} /> キャンバスを全消し
            </button>
          </div>
        </aside>

      </div>
    </div>
  );
}
