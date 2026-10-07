import * as THREE from 'three';
import { SKIN_UV, SKIN_UV_OVER } from '../skin/uv';
import type { PartName } from '../skin/uv';
import { applyPartUV } from './applyPartUV';
import { createGridTexture } from './gridTexture';
import { createHoverLayer } from './hoverHighlight';
import type { HoverLayer } from './hoverHighlight';

export type { PartName };

// 1つのパーツの形 (素の層と上着の層の箱) と、置く位置
export interface PartGeometry {
  name: PartName;
  base: THREE.BoxGeometry;
  over: THREE.BoxGeometry;
  position: THREE.Vector3;
}

// 3Dモデルの1パーツ。上着とグリッドは素の層のメッシュの子として付いている
export interface SkinPart {
  name: PartName;
  mesh: THREE.Mesh; // 素の層
  overlay: THREE.Mesh; // 上着の層
  baseGrid: THREE.Mesh; // 素の層のガイド線
  overlayGrid: THREE.Mesh; // 上着の層のガイド線
  baseHover: THREE.Mesh; // 素の層の「マウスの下」の強調
  overlayHover: THREE.Mesh; // 上着の層の「マウスの下」の強調
}

export interface SkinModel {
  parts: SkinPart[];
  hover: HoverLayer; // マウスの下の強調 (全パーツで1枚の画像を共有)
  dispose: () => void;
}

// 6パーツの形を作る (1単位 = テクスチャの1ピクセル)
// DOMを使わないので、Node上のテストからも呼べる
export function createPartGeometries(): PartGeometry[] {
  const headGeo = new THREE.BoxGeometry(8, 8, 8); applyPartUV(headGeo, SKIN_UV.head); headGeo.translate(0, 4, 0);
  const headOverGeo = new THREE.BoxGeometry(9, 9, 9); applyPartUV(headOverGeo, SKIN_UV_OVER.head); headOverGeo.translate(0, 4, 0);

  const bodyGeo = new THREE.BoxGeometry(8, 12, 4); applyPartUV(bodyGeo, SKIN_UV.body);
  const bodyOverGeo = new THREE.BoxGeometry(8.5, 12.5, 4.5); applyPartUV(bodyOverGeo, SKIN_UV_OVER.body);

  // 腕と足は同じ形。回転の中心(肩・股関節)が上端になるよう、下にずらしておく
  const armGeo = new THREE.BoxGeometry(4, 12, 4); armGeo.translate(0, -6, 0);
  const armOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5); armOverGeo.translate(0, -6, 0);

  const limb = (name: PartName, position: THREE.Vector3): PartGeometry => {
    const base = armGeo.clone(); applyPartUV(base, SKIN_UV[name]);
    const over = armOverGeo.clone(); applyPartUV(over, SKIN_UV_OVER[name]);
    return { name, base, over, position };
  };

  const geometries = [
    { name: 'head' as const, base: headGeo, over: headOverGeo, position: new THREE.Vector3(0, 24, 0) },
    { name: 'body' as const, base: bodyGeo, over: bodyOverGeo, position: new THREE.Vector3(0, 18, 0) },
    limb('rightArm', new THREE.Vector3(-6, 24, 0)),
    limb('leftArm', new THREE.Vector3(6, 24, 0)),
    limb('rightLeg', new THREE.Vector3(-2, 12, 0)),
    limb('leftLeg', new THREE.Vector3(2, 12, 0)),
  ];
  armGeo.dispose();
  armOverGeo.dispose();
  return geometries;
}

// テクスチャを貼った3Dモデル(6パーツ + 上着 + ガイド線)を作る
export function createSkinModel(texture: THREE.Texture): SkinModel {
  const baseMaterial = new THREE.MeshLambertMaterial({ map: texture, transparent: false, side: THREE.FrontSide });
  const overlayMaterial = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.1, side: THREE.FrontSide });

  // いつものグリッドは薄め。マウスの下の面だけ、ホバーの層で濃く描く
  const baseGridTex = createGridTexture('rgba(129, 212, 250, 0.2)');
  const overGridTex = createGridTexture('rgba(255, 255, 255, 0.25)');

  const baseGridMaterial = new THREE.MeshBasicMaterial({ map: baseGridTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const overGridMaterial = new THREE.MeshBasicMaterial({ map: overGridTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  const hover = createHoverLayer();
  const hoverMaterial = new THREE.MeshBasicMaterial({ map: hover.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  const meshes = createPartGeometries().map(({ name, base, over, position }) => {
    const mesh = new THREE.Mesh(base, baseMaterial.clone());
    mesh.name = name;
    mesh.position.copy(position);

    const overlay = new THREE.Mesh(over, overlayMaterial.clone());
    overlay.name = name + 'Over';
    mesh.add(overlay);
    return { name, mesh, overlay };
  });

  const parts: SkinPart[] = meshes.map(({ name, mesh, overlay }) => {
    const baseGrid = new THREE.Mesh(mesh.geometry, baseGridMaterial);
    baseGrid.name = name + 'BaseGrid';
    mesh.add(baseGrid);

    const overlayGrid = new THREE.Mesh(overlay.geometry, overGridMaterial);
    overlayGrid.name = name + 'OverGrid';
    overlay.add(overlayGrid);

    // ホバーの強調は、グリッドより後に描いて上に重ねる
    const baseHover = new THREE.Mesh(mesh.geometry, hoverMaterial);
    baseHover.name = name + 'BaseHover';
    baseHover.renderOrder = 1;
    mesh.add(baseHover);

    const overlayHover = new THREE.Mesh(overlay.geometry, hoverMaterial);
    overlayHover.name = name + 'OverHover';
    overlayHover.renderOrder = 1;
    overlay.add(overlayHover);
    return { name, mesh, overlay, baseGrid, overlayGrid, baseHover, overlayHover };
  });

  const dispose = () => {
    for (const part of parts) {
      part.mesh.geometry.dispose();
      part.overlay.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
      (part.overlay.material as THREE.Material).dispose();
    }
    baseMaterial.dispose(); overlayMaterial.dispose(); baseGridMaterial.dispose(); overGridMaterial.dispose(); baseGridTex.dispose(); overGridTex.dispose();
    hoverMaterial.dispose(); hover.dispose();
  };

  return { parts, hover, dispose };
}
