import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useEffect } from 'react';
import gsap from 'gsap';

import { createSkinModel } from './createSkinModel';
import type { SkinPart, PartName } from './createSkinModel';
import { pickTexel } from './raycast';
import { focusOn, HOME_TARGET, HOME_DISTANCE } from './camera';
import { createFrontArrow } from './frontArrow';
import { hoverTargetInMode } from './hoverHighlight';
import type { HoverBrush, HoverLayer } from './hoverHighlight';
import type { PartVisibility, ViewMode } from '../viewTypes';

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>; // スキン画像(テクスチャの元)
  visibleParts: PartVisibility; // 素の層の表示
  visibleOverlay: PartVisibility; // 上着の層の表示
  showGuide: boolean;
  isAutoFocus: boolean;
  mode: ViewMode;
  brush: HoverBrush; // マウスの下に「どこが塗られるか」を出すために使う
  // モデル上のピクセル(x, y)が押された・なぞられた・離された。何を塗るかは親が決める
  onPaintStart: (x: number, y: number) => void;
  onPaintMove: (x: number, y: number, connected: boolean) => void; // connected: 前回の点から途切れずになぞっているか
  onPaintEnd: () => void;
}

// スキンを3Dで表示し、モデルの上でのクリック・ドラッグを「テクスチャ上のピクセル」として親に伝える
export function SkinViewer({ canvasRef, visibleParts, visibleOverlay, showGuide, isAutoFocus, mode, brush, onPaintStart, onPaintMove, onPaintEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const threeCtx = useRef<{ camera: THREE.PerspectiveCamera; parts: SkinPart[], controls: OrbitControls, frontArrow: THREE.Mesh, hover: HoverLayer } | null>(null);
  const prevActiveCount = useRef(6);
  const isStroking = useRef(false); // モデルの上で押したまま動かしているか
  const lastMoveHit = useRef(false); // 前回のポインタ移動でモデルに当たっていたか (外に出たら線を切るため)
  const hoverTexel = useRef<[number, number] | null>(null); // マウスの下のピクセル (モデルの外なら null)

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
    camera.position.copy(HOME_TARGET).add(new THREE.Vector3(0, 0, HOME_DISTANCE)); // 正面から全身を映す

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_TARGET);
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

    // 足元の「正面」の矢印 (塗る対象ではないので、Raycastの対象には入れない)
    const frontArrow = createFrontArrow();
    scene.add(frontArrow);

    threeCtx.current = { camera, parts: model.parts, controls, frontArrow, hover: model.hover };

    // アニメーションモードで手足を振るために取り出しておく
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
      frontArrow.geometry.dispose();
      (frontArrow.material as THREE.Material).dispose();
      texture.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [canvasRef]);

  // --- 表示の切り替え (パーツ・上着・ガイド線・正面の矢印) ---
  useEffect(() => {
    if (!threeCtx.current) return;
    threeCtx.current.frontArrow.visible = showGuide; // 矢印もガイドの一部として扱う

    threeCtx.current.parts.forEach(part => {
      const isOverActive = visibleOverlay[part.name];
      part.mesh.visible = visibleParts[part.name];
      part.overlay.visible = isOverActive;
      part.overlayGrid.visible = showGuide && isOverActive;
      part.baseGrid.visible = showGuide && !isOverActive;
      // マウスの下の強調は、塗る対象の層にだけ出す (ガイドがoffでも、塗られるピクセルの印は出す)
      part.overlayHover.visible = isOverActive;
      part.baseHover.visible = !isOverActive;
    });
  }, [visibleParts, visibleOverlay, showGuide]);

  // --- マウスの下の強調 (面のグリッドと、塗られるピクセル) ---
  // モードやブラシ・ガイドの設定が変わったら、マウスが止まっていてもその場で描き直す
  const { tool, size, mirror } = brush;
  useEffect(() => {
    if (!threeCtx.current) return;
    threeCtx.current.hover.draw(hoverTargetInMode(hoverTexel.current, mode, { tool, size, mirror }), showGuide);
  }, [mode, tool, size, mirror, showGuide]);

  // 表示するパーツや層が変わると、マウスの下にあったピクセルが塗る対象でなくなることがあるので、一度消す
  useEffect(() => {
    hoverTexel.current = null;
    threeCtx.current?.hover.draw(null, false);
  }, [visibleParts, visibleOverlay]);

  const updateHover = (texel: [number, number] | null) => {
    hoverTexel.current = texel;
    threeCtx.current?.hover.draw(hoverTargetInMode(texel, mode, brush), showGuide);
  };

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
    lastMoveHit.current = true;
    onPaintStart(texel[0], texel[1]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'pose' || !threeCtx.current) return;

    const { camera, parts } = threeCtx.current;
    const texel = pickTexel(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), camera, paintTargets(parts));
    updateHover(texel); // 押していなくても、マウスの下を強調する

    if (!isStroking.current) return;
    if (!texel) {
      lastMoveHit.current = false; // モデルの外に出た → 次に戻ってきたときは、そこから新しい線として描く
      return;
    }

    onPaintMove(texel[0], texel[1], lastMoveHit.current);
    lastMoveHit.current = true;
  };

  const handlePointerUp = () => {
    isStroking.current = false;
    onPaintEnd();
    if (threeCtx.current) {
      threeCtx.current.controls.enabled = true;
    }
  };

  // マウスが3D表示の外に出たら、描くのをやめて強調も消す
  const handlePointerLeave = () => {
    handlePointerUp();
    updateHover(null);
  };

  return (
    <div
      ref={containerRef}
      data-testid="skin-viewer"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      style={{
        width: '100%', height: '100%',
        touchAction: 'none',
        cursor: mode === 'edit' ? 'crosshair' : 'grab'
      }}
    />
  );
}
