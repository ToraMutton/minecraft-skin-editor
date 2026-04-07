import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useState, useEffect } from 'react';
import gsap from 'gsap';

// 外部ファイル化したものをインポート
import type { Tool, BrushSize } from './skinUtils';
import { SKIN_UV, SKIN_UV_OVER, applyPartUV, createGridTexture } from './skinUtils';
import { useSkinLogic } from './useSkinLogic';

import { User, Layers } from 'lucide-react';

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
  const [showOverlay, setShowOverlay] = useState(true); // 上着を表示するかどうか(デフォルトはON)
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

  // ボタン基本デザイン
  const btn: React.CSSProperties = {
    padding: '4px 8px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#333',
  };

  // 現在のツール判定
  const toolBtn = (t: Tool): React.CSSProperties => ({
    ...btn,
    backgroundColor: tool === t ? '#cce5ff' : '#f0f0f0',
    border: tool === t ? '2px solid #4a90d9' : '1px solid #ccc',
    fontWeight: tool === t ? 'bold' : 'normal',
  });

  // トグルボタン
  const toggleBtn = (active: boolean, color?: string): React.CSSProperties => ({
    ...btn,
    backgroundColor: active ? (color || '#e8eaf6') : '#f0f0f0', // color指定
    fontWeight: active ? 'bold' : 'normal',
  });


  // ブラシの太さ
  const sizeBtn = (s: BrushSize): React.CSSProperties => ({
    ...btn,
    width: '28px',
    textAlign: 'center',
    backgroundColor: brushSize === s ? '#ffe0b2' : '#f0f0f0',
    border: brushSize === s ? '2px solid #f57c00' : '1px solid #ccc',
    fontWeight: brushSize === s ? 'bold' : 'normal',
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: '260px 1fr 280px',
      height: '100%',
      width: '100%',
      backgroundColor: '#f5f5f7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>

      {/* 左サイドバー（ツール＆パレット＆操作ボタン） */}
      <aside style={{
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e5e5',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        overflowY: 'auto'
      }}>
        {/* ツール群 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="color"
              value={color}
              onChange={(e) => { setColor(e.target.value); addRecentColor(e.target.value); }}
              disabled={colorDisabled}
              style={{ cursor: colorDisabled ? 'not-allowed' : 'pointer', width: '32px', height: '28px' }}
            />
            {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map(t => (
              <button key={t} onClick={() => setTool(t)} style={toolBtn(t)}>
                {toolConfig[t].label}
              </button>
            ))}
          </div>

          {/* 最近使った色パレット */}
          {recentColors.length > 0 && (
            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
              {recentColors.map((c, i) => (
                <button key={`${c}-${i}`}
                  onClick={() => { setColor(c); setTool('pen'); }}
                  title={c}
                  style={{
                    width: '20px', height: '20px', backgroundColor: c,
                    border: c === color ? '2px solid #333' : '1px solid #aaa',
                    borderRadius: '3px', cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          )}

          {/* ブラシサイズ */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#888' }}>筆</span>
            {([1, 2, 3] as BrushSize[]).map(s => (
              <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 操作ボタン群（Undo/Redo/保存など） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={handleUndo} disabled={!canUndo} style={{ ...btn, opacity: canUndo ? 1 : 0.4, flex: 1 }} title="元に戻す">↩️ Undo</button>
            <button onClick={handleRedo} disabled={!canRedo} style={{ ...btn, opacity: canRedo ? 1 : 0.4, flex: 1 }} title="やり直す">↪️ Redo</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={newCanvas} style={btn}>新規 📄</button>
            <button onClick={clearCanvas} style={btn}>全消し 🗑️</button>
            <button onClick={() => fileInputRef.current?.click()} style={{ ...btn, backgroundColor: '#fff3e0' }}>読込 📂</button>
            <input ref={fileInputRef} type="file" accept=".png" onChange={handleImport} style={{ display: 'none' }} />
            <button onClick={downloadImage} style={{ ...btn, backgroundColor: '#e0f7fa' }}>保存 💾</button>
          </div>
        </div>

        {/* 各種設定 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => setMirror(!mirror)} style={toggleBtn(mirror, '#e1bee7')}>
            🪞 ミラー: {mirror ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => setShowOverlay(!showOverlay)} style={toggleBtn(showOverlay, '#c5cae9')}>
            👕 上着: {showOverlay ? '表示' : '非表示'}
          </button>
          <button onClick={() => setShowGuide(!showGuide)} style={toggleBtn(showGuide, '#b2ebf2')}>
            🌐 ガイド: {showGuide ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setMode(mode === 'edit' ? 'pose' : 'edit')}
            style={{
              ...btn,
              backgroundColor: mode === 'pose' ? '#a5d6a7' : '#ffcdd2',
              fontWeight: 'bold', color: '#333',
              border: mode === 'pose' ? '2px solid #4caf50' : '2px solid #f44336'
            }}
          >
            {mode === 'edit' ? '🖌️ 編集モード' : '🚶‍♂️ 鑑賞モード'}
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
            style={{ ...btn, justifyContent: 'center', backgroundColor: '#f1f5f9' }}
          >
            <Layers size={16} /> 上着をすべて切り替え
          </button>
        </div>
      </aside>

    </div>
  );
}
