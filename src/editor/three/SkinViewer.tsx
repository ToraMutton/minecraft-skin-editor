import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useEffect } from 'react';
import gsap from 'gsap';

import { createSkinModel } from './createSkinModel';
import type { SkinPart, PartName } from './createSkinModel';
import { pickTexel } from './raycast';
import { focusOn, HOME_TARGET, HOME_DISTANCE } from './camera';
import type { PartVisibility, ViewMode } from '../viewTypes';

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>; // スキン画像(テクスチャの元)
  visibleParts: PartVisibility; // 素の層の表示
  visibleOverlay: PartVisibility; // 上着の層の表示
  showGuide: boolean;
  isAutoFocus: boolean;
  mode: ViewMode;
  // モデル上のピクセル(x, y)が押された・なぞられた・離された。何を塗るかは親が決める
  onPaintStart: (x: number, y: number) => void;
  onPaintMove: (x: number, y: number) => void;
  onPaintEnd: () => void;
}

// スキンを3Dで表示し、モデルの上でのクリック・ドラッグを「テクスチャ上のピクセル」として親に伝える
export function SkinViewer({ canvasRef, visibleParts, visibleOverlay, showGuide, isAutoFocus, mode, onPaintStart, onPaintMove, onPaintEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const threeCtx = useRef<{ camera: THREE.PerspectiveCamera; parts: SkinPart[], controls: OrbitControls } | null>(null);
  const prevActiveCount = useRef(6);
  const isStroking = useRef(false); // モデルの上で押したまま動かしているか

  // 描画ループ(useEffectの外で動き続ける)から最新のモードを読めるように、refにも入れておく
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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

    // ユーザーが回転・ズームを始めたら、オートフォーカスのアニメーションは止める (操作を優先する)
    const stopCameraTween = () => gsap.killTweensOf([camera.position, controls.target]);
    controls.addEventListener('start', stopCameraTween);

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
      stopCameraTween();
      controls.removeEventListener('start', stopCameraTween);
      controls.dispose();
      renderer.dispose();
      window.removeEventListener('resize', handleResize);
      model.dispose();
      texture.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [canvasRef]);

  // --- 表示の切り替え (パーツ・上着・ガイド線) ---
  useEffect(() => {
    if (!threeCtx.current) return;

    threeCtx.current.parts.forEach(part => {
      const isOverActive = visibleOverlay[part.name];
      part.mesh.visible = visibleParts[part.name];
      part.overlay.visible = isOverActive;
      part.overlayGrid.visible = showGuide && isOverActive;
      part.baseGrid.visible = showGuide && !isOverActive;
    });
  }, [visibleParts, visibleOverlay, showGuide]);

  // --- オートフォーカス: 表示するパーツが変わったときだけカメラを動かす ---
  // (ガイドや上着の切り替えでは動かさない。動かすとその間のドラッグが引き戻されるため)
  useEffect(() => {
    if (!threeCtx.current) return;
    const { camera, parts, controls } = threeCtx.current;

    const activeMeshes = parts.filter(part => visibleParts[part.name]).map(part => part.mesh);
    const activeCount = activeMeshes.length;

    const isAddingPart = activeCount > prevActiveCount.current;
    prevActiveCount.current = activeCount;

    if (!isAutoFocus) return;

    // 今の向きのまま、注視点と距離だけを変えてカメラを動かす
    const moveCamera = (center: THREE.Vector3, distance: number) => {
      const currentDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      const targetCamPos = new THREE.Vector3().copy(center).add(currentDir.multiplyScalar(distance));

      gsap.to(camera.position, { x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z, duration: 0.6, ease: "power2.out" });
      gsap.to(controls.target, { x: center.x, y: center.y, z: center.z, duration: 0.6, ease: "power2.out", onUpdate: () => { controls.update() } });
    };

    if (activeCount === 6 || activeCount === 0) {
      moveCamera(HOME_TARGET, HOME_DISTANCE);
      return;
    }

    if (isAddingPart) return;

    const { center, distance } = focusOn(activeMeshes);
    moveCamera(center, distance);

  }, [visibleParts, isAutoFocus]);

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
    isStroking.current = true;
    onPaintStart(texel[0], texel[1]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'pose' || !isStroking.current || !threeCtx.current) return;

    const { camera, parts } = threeCtx.current;
    const texel = pickTexel(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), camera, paintTargets(parts));
    if (!texel) return;

    onPaintMove(texel[0], texel[1]);
  };

  const handlePointerUp = () => {
    isStroking.current = false;
    onPaintEnd();
    if (threeCtx.current) {
      threeCtx.current.controls.enabled = true;
    }
  };

  return (
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
  );
}
