import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';

// 外部ファイル化したものをインポート
import type { Tool, BrushSize } from './skinUtils';
import { SKIN_UV, SKIN_UV_OVER, applyPartUV, createGridTexture } from './skinUtils';
import { useSkinLogic } from './useSkinLogic';

import {
  Pencil, Eraser, PaintBucket, Pipette,
  Undo2, Redo2, Trash2, FolderOpen, Download,
  FlipHorizontal, Grid, PenTool, Accessibility, Focus, User, Layers
} from 'lucide-react';

const PRESET_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9900FF', '#FF00FF',
  '#8B4513', '#D2B48C', '#FFC0CB', '#FFD700', '#ADFF2F', '#87CEEB'
];

interface Props {
  // テクスチャ更新を親に通知するコールバック
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

  const [isAutoFocus, setIsAutoFocus] = useState(true); // デフォルトはON
  const [showGuide, setShowGuide] = useState(true);

  const [mode, setMode] = useState<'edit' | 'pose'>('edit'); // 編集 or ポーズ
  const modeRef = useRef(mode); // アニメーションループから参照するための裏メモ

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // useRef系
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null) // ファイル入力

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

    // 頭
    const headGeo = new THREE.BoxGeometry(8, 8, 8);
    applyPartUV(headGeo, SKIN_UV.head);
    headGeo.translate(0, 4, 0);
    const head = new THREE.Mesh(headGeo, baseMaterial.clone());
    head.name = 'head';
    head.position.set(0, 24, 0);
    scene.add(head);

    const headOverGeo = new THREE.BoxGeometry(9, 9, 9);
    applyPartUV(headOverGeo, SKIN_UV_OVER.head);
    headOverGeo.translate(0, 4, 0);
    const headOver = new THREE.Mesh(headOverGeo, overlayMaterial.clone());
    headOver.name = 'headOver';
    head.add(headOver);

    // 胴体
    const bodyGeo = new THREE.BoxGeometry(8, 12, 4);
    applyPartUV(bodyGeo, SKIN_UV.body);
    const body = new THREE.Mesh(bodyGeo, baseMaterial.clone());
    body.name = 'body';
    body.position.set(0, 18, 0);
    scene.add(body);

    const bodyOverGeo = new THREE.BoxGeometry(8.5, 12.5, 4.5);
    applyPartUV(bodyOverGeo, SKIN_UV_OVER.body);
    const bodyOver = new THREE.Mesh(bodyOverGeo, overlayMaterial.clone());
    bodyOver.name = 'bodyOver';
    body.add(bodyOver);

    // 右腕
    const rArmGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(rArmGeo, SKIN_UV.rightArm);
    rArmGeo.translate(0, -6, 0);
    const rArm = new THREE.Mesh(rArmGeo, baseMaterial.clone());
    rArm.name = 'rightArm';
    rArm.position.set(-6, 24, 0); scene.add(rArm);

    const rArmOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(rArmOverGeo, SKIN_UV_OVER.rightArm);
    rArmOverGeo.translate(0, -6, 0);
    const rArmOver = new THREE.Mesh(rArmOverGeo, overlayMaterial.clone());
    rArmOver.name = 'rightArmOver';
    rArm.add(rArmOver);

    // 左腕
    const lArmGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(lArmGeo, SKIN_UV.leftArm);
    lArmGeo.translate(0, -6, 0);
    const lArm = new THREE.Mesh(lArmGeo, baseMaterial.clone());
    lArm.name = 'leftArm';
    lArm.position.set(6, 24, 0);
    scene.add(lArm);

    const lArmOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(lArmOverGeo, SKIN_UV_OVER.leftArm);
    lArmOverGeo.translate(0, -6, 0);
    const lArmOver = new THREE.Mesh(lArmOverGeo, overlayMaterial.clone());
    lArmOver.name = 'leftArmOver';
    lArm.add(lArmOver);

    // 右足
    const rLegGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(rLegGeo, SKIN_UV.rightLeg);
    rLegGeo.translate(0, -6, 0);
    const rLeg = new THREE.Mesh(rLegGeo, baseMaterial.clone());
    rLeg.name = 'rightLeg';
    rLeg.position.set(-2, 12, 0);
    scene.add(rLeg);

    const rLegOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(rLegOverGeo, SKIN_UV_OVER.rightLeg);
    rLegOverGeo.translate(0, -6, 0);
    const rLegOver = new THREE.Mesh(rLegOverGeo, overlayMaterial.clone());
    rLegOver.name = 'rightLegOver';
    rLeg.add(rLegOver);

    // 左足
    const lLegGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(lLegGeo, SKIN_UV.leftLeg);
    lLegGeo.translate(0, -6, 0);
    const lLeg = new THREE.Mesh(lLegGeo, baseMaterial.clone());
    lLeg.name = 'leftLeg';
    lLeg.position.set(2, 12, 0);
    scene.add(lLeg);

    const lLegOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(lLegOverGeo, SKIN_UV_OVER.leftLeg);
    lLegOverGeo.translate(0, -6, 0);
    const lLegOver = new THREE.Mesh(lLegOverGeo, overlayMaterial.clone());
    lLegOver.name = 'leftLegOver';
    lLeg.add(lLegOver);

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
    handleResize(); // 初回実行で枠いっぱいに広げる

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
    if (mode === 'pose') return; // ✨鑑賞モード時は描画を無効化

    if (e.button !== 0 || !threeCtx.current) return;

    const { camera, parts, controls } = threeCtx.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // 的絞り込み
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
      // スキンに当たる -> カメラ回転を止めて、描画モードに入る
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
      // 空振りした（背景をクリック） -> カメラ回転を許可
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
      const isOverActive = visibleOverlay[partKey]; // 個別の上着状態を取得

      // 親(素肌)の表示
      part.visible = isActive;

      // 素肌の枠線(BaseGrid)を探す
      const baseGrid = part.children.find(c => c.name === part.name + 'BaseGrid');

      // 子要素（上着）の表示切替
      const overMesh = part.children.find(c => c.name === part.name + 'Over');
      if (overMesh) {
        overMesh.visible = isOverActive;

        // 上着の枠線(OverGrid)を探す
        const overGrid = overMesh.children.find(c => c.name === part.name + 'OverGrid');

        // 大元のガイド(showGuide)がONのときだけ
        // 上着ONなら上着のガイドを表示
        if (overGrid) overGrid.visible = showGuide && isOverActive;
        // 上着OFFなら素肌のガイドを表示
        if (baseGrid) baseGrid.visible = showGuide && !isOverActive;
      }

      if (isActive) {
        activeMeshes.push(part);
        activeCount++;
      }
    });

    if (!isAutoFocus) return;

    // 過去のパーツ数と比較し、パーツを追加したのかを判定
    const isAddingPart = activeCount > prevActiveCount.current;
    prevActiveCount.current = activeCount; // 記憶を更新

    // 今のカメラの角度を取得
    const currentDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();

    // 全部ON、または全部OFFの場合は全体ビューに戻す
    if (activeCount === 6 || activeCount === 0) {
      const targetCenter = new THREE.Vector3(0, 16, 0);
      const targetCamPos = new THREE.Vector3().copy(targetCenter).add(currentDir.multiplyScalar(60));

      gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 0.6, ease: "power2.out" });
      gsap.to(controls.target, { x: targetCenter.x, y: targetCenter.y, z: targetCenter.z, duration: 0.6, ease: "power2.out", onUpdate: () => { controls.update() } });
      return;
    }

    // 全表示以外でパーツを表示(ON)にして増やしただけの時は、カメラを一切動かさず処理を終わる
    if (isAddingPart) {
      return;
    }

    // --- パーツを減らした(OFF)時だけ実行される、絞り込みズーム処理 ---
    const box = new THREE.Box3();
    activeMeshes.forEach(mesh => box.expandByObject(mesh));

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);

    // 距離を計算しつつ最大60を超えないように制限
    let distance = maxDim * 1.8 + 15;
    distance = Math.min(distance, 60);

    // 今の角度のまま新しい中心点から計算した距離をとる
    const targetCamPos = new THREE.Vector3().copy(center).add(currentDir.multiplyScalar(distance));

    // カメラ本体と注視点を同時にアニメーション
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
    // マウスから指を離したらカメラ操作を再有効化
    if (threeCtx.current) {
      threeCtx.current.controls.enabled = true;
    }
  };


  // --- ツール定義 ---

  const toolConfig: Record<Tool, { label: string; cursor: string }> = {
    pen: { label: 'ペン ✏️', cursor: 'crosshair' },
    eraser: { label: '消しゴム 🧹', cursor: 'cell' },
    bucket: { label: 'バケツ 🪣', cursor: 'cell' },
    picker: { label: 'スポイト 💧', cursor: 'copy' },
  };

  const colorDisabled = tool === 'eraser';

  // --- スタイル ---

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

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    ...btnBase,
    backgroundColor: active ? '#eff6ff' : '#ffffff',
    border: active ? '1px solid #3b82f6' : '1px solid #cbd5e1',
    color: active ? '#1d4ed8' : '#334155',
  });

  const sizeBtn = (s: BrushSize): React.CSSProperties => ({
    ...btnBase, padding: '4px', width: '32px', height: '32px',
    backgroundColor: brushSize === s ? '#eff6ff' : '#ffffff',
    border: brushSize === s ? '2px solid #3b82f6' : '1px solid #cbd5e1',
    color: brushSize === s ? '#1d4ed8' : '#334155',
  });



  // --- 右サイドバー：パーツUI描画関数 ---
  const togglePart = (part: keyof typeof visibleParts) => {
    setVisibleParts(p => ({ ...p, [part]: !p[part] }));
  };

  const toggleOverlay = (part: keyof typeof visibleOverlay) => {
    setVisibleOverlay(p => ({ ...p, [part]: !p[part] }));
  };

  const renderPart = (part: keyof typeof visibleParts, label: string, w: number, h: number) => {
    const isBase = visibleParts[part];
    const isOver = visibleOverlay[part];

    return (
      <div style={{ position: 'relative', width: w, height: h }}>
        {/* メイン部分（素肌切り替え） */}
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

        {/* 右上のバッジ部分（上着切り替え） */}
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


  // return部分
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      {/* --- ヘッダー (右上に読込・保存を配置) --- */}
      <header style={{
        backgroundColor: '#1e293b', color: '#ffffff', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 20
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>
          Vextra - Minecraft Skin Editor
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
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
          backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '28px', overflowY: 'auto'
        }}>

          {/* セクション1: カラーパレット */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden',
                border: '2px solid #cbd5e1', cursor: colorDisabled ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}>
                <input type="color" value={color} onChange={(e) => { setColor(e.target.value); addRecentColor(e.target.value); }}
                  disabled={colorDisabled} style={{ width: '150%', height: '150%', margin: '-25%', cursor: 'inherit', border: 'none' }}
                />
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold' }}>現在の色</div>
            </div>

            {/* 大型パレット */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => { setColor(c); setTool('pen'); }} title={c}
                  style={{
                    aspectRatio: '1', backgroundColor: c, border: c === color ? '2px solid #0f172a' : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '4px', cursor: 'pointer', padding: 0, transition: 'transform 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </div>

          {/* セクション2: ツール */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setTool('pen')} style={toolBtn('pen')} title="ペン"><Pencil size={18} /></button>
              <button onClick={() => setTool('eraser')} style={toolBtn('eraser')} title="消しゴム"><Eraser size={18} /></button>
              <button onClick={() => setTool('bucket')} style={toolBtn('bucket')} title="バケツ"><PaintBucket size={18} /></button>
              <button onClick={() => setTool('picker')} style={toolBtn('picker')} title="スポイト"><Pipette size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginLeft: '4px' }}>太さ</span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                {([1, 2, 3] as BrushSize[]).map(s => (
                  <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* セクション3: 操作 & 設定 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
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
              {mode === 'edit' ? <><PenTool size={16} /> 編集モード</> : <><Accessibility size={16} /> 鑑賞モード</>}
            </button>

            <button onClick={clearCanvas}
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
          {/* AFボタンはキャンバスの上部に浮かせる */}
          <button
            onClick={() => setIsAutoFocus(!isAutoFocus)}
            style={{
              ...toggleBtn(isAutoFocus, '#ffe0b2'),
              position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 10, borderRadius: '20px', padding: '8px 16px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}
          >
            {isAutoFocus ? '🎯 オートフォーカス: ON' : '📍 オートフォーカス: OFF'}
          </button>

          {/* 3Dキャンバス本体 */}
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

          {/* --- 見えない裏方キャンバス --- */}
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

          {/* アバターUI (マイクラ比率 x 6) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            {/* 頭 (8x8 -> 48x48) */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              {renderPart('head', '頭', 48, 48)}
            </div>

            {/* 腕と胴体 (腕 4x12 -> 24x72, 胴 8x12 -> 48x72) */}
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
              {renderPart('rightArm', '右', 24, 72)}
              {renderPart('body', '胴', 48, 72)}
              {renderPart('leftArm', '左', 24, 72)}
            </div>

            {/* 足 (4x12 -> 24x72) */}
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '4px' }}>
              {renderPart('rightLeg', '右', 24, 72)}
              {renderPart('leftLeg', '左', 24, 72)}
            </div>
          </div>

          {/* 一括操作 */}
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
