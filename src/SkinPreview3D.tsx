import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface Props {
    // 描画用キャンバスへの参照
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    // キャンバス更新カウンター(増加で更新)
    textureVersion: number;
}

// Minecraftスキンの各パーツのUV座標定義
interface UVFace {
    u: number; v: number; w: number; h: number;
}

// 1パーツにつき6面の定義
interface PartUV {
    front: UVFace;
    back: UVFace;
    top: UVFace;
    bottom: UVFace;
    right: UVFace;
    left: UVFace;
}

// UVマッピング定義（Minecraft wikiに準拠）
const SKIN_UV: Record<string, PartUV> = {
    head: {
        right: { u: 0, v: 8, w: 8, h: 8 },
        front: { u: 8, v: 8, w: 8, h: 8 },
        left: { u: 16, v: 8, w: 8, h: 8 },
        back: { u: 24, v: 8, w: 8, h: 8 },
        top: { u: 8, v: 0, w: 8, h: 8 },
        bottom: { u: 16, v: 0, w: 8, h: 8 },
    },
    body: {
        right: { u: 16, v: 20, w: 4, h: 12 },
        front: { u: 20, v: 20, w: 8, h: 12 },
        left: { u: 28, v: 20, w: 4, h: 12 },
        back: { u: 32, v: 20, w: 8, h: 12 },
        top: { u: 20, v: 16, w: 8, h: 4 },
        bottom: { u: 28, v: 16, w: 8, h: 4 },
    },
    rightArm: {
        right: { u: 40, v: 20, w: 4, h: 12 },
        front: { u: 44, v: 20, w: 4, h: 12 },
        left: { u: 48, v: 20, w: 4, h: 12 },
        back: { u: 52, v: 20, w: 4, h: 12 },
        top: { u: 44, v: 16, w: 4, h: 4 },
        bottom: { u: 48, v: 16, w: 4, h: 4 },
    },
    leftArm: {
        right: { u: 32, v: 52, w: 4, h: 12 },
        front: { u: 36, v: 52, w: 4, h: 12 },
        left: { u: 40, v: 52, w: 4, h: 12 },
        back: { u: 44, v: 52, w: 4, h: 12 },
        top: { u: 36, v: 48, w: 4, h: 4 },
        bottom: { u: 40, v: 48, w: 4, h: 4 },
    },
    rightLeg: {
        right: { u: 0, v: 20, w: 4, h: 12 },
        front: { u: 4, v: 20, w: 4, h: 12 },
        left: { u: 8, v: 20, w: 4, h: 12 },
        back: { u: 12, v: 20, w: 4, h: 12 },
        top: { u: 4, v: 16, w: 4, h: 4 },
        bottom: { u: 8, v: 16, w: 4, h: 4 },
    },
    leftLeg: {
        right: { u: 16, v: 52, w: 4, h: 12 },
        front: { u: 20, v: 52, w: 4, h: 12 },
        left: { u: 24, v: 52, w: 4, h: 12 },
        back: { u: 28, v: 52, w: 4, h: 12 },
        top: { u: 20, v: 48, w: 4, h: 4 },
        bottom: { u: 24, v: 48, w: 4, h: 4 },
    },
};

// UVFaceからTHREE.jsのUV座標を設定する
// Three.jsのUV座標系: 左下が(0,0)、右上が(1,1)
// Minecraftのテクスチャ座標系: 左上が(0,0)
function setFaceUV(
    geometry: THREE.BoxGeometry,
    faceIndex: number,
    face: UVFace,
    flipH: boolean = false,
) {
    const uv = geometry.attributes.uv;
    const texW = 64, texH = 64;

    // テクスチャ上のピクセル座標 → 0〜1の比率に変換
    let u0 = face.u / texW;
    let u1 = (face.u + face.w) / texW;
    const v0 = 1 - face.v / texH;          // Y軸反転
    const v1 = 1 - (face.v + face.h) / texH;

    if (flipH) { [u0, u1] = [u1, u0]; }

    // BoxGeometryの面の順番: +x, -x, +y, -y, +z, -z
    // 各面に4頂点（左上、右上、左下、右下）
    const i = faceIndex * 4;
    uv.setXY(i + 0, u0, v0);
    uv.setXY(i + 1, u1, v0);
    uv.setXY(i + 2, u0, v1);
    uv.setXY(i + 3, u1, v1);
}

// パーツ用のBoxGeometryにUVを設定する
function applyPartUV(geometry: THREE.BoxGeometry, partUV: PartUV) {
    // Three.js BoxGeometryの面順序: right(+x), left(-x), top(+y), bottom(-y), front(+z), back(-z)
    setFaceUV(geometry, 0, partUV.right);
    setFaceUV(geometry, 1, partUV.left);
    setFaceUV(geometry, 2, partUV.top);
    setFaceUV(geometry, 3, partUV.bottom);
    setFaceUV(geometry, 4, partUV.front);
    setFaceUV(geometry, 5, partUV.back, true);
    geometry.attributes.uv.needsUpdate = true;
}

export default function SkinPreview3D({ canvasRef, textureVersion }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        controls: OrbitControls;
        texture: THREE.CanvasTexture;
        animId: number;
    } | null>(null);

    // シーン初期化
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Three.jsの基本セットアップ
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(300, 400);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(35, 300 / 400, 0.1, 100);
        camera.position.set(0, 15, 40);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 10, 0);
        controls.enablePan = false;
        controls.minDistance = 20;
        controls.maxDistance = 60;
        controls.update();

        // ライティング
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 7);
        scene.add(dir);

        // テクスチャ（最初はダミーのキャンバスで作成）
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 64;
        dummyCanvas.height = 64;
        const texture = new THREE.CanvasTexture(dummyCanvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.FrontSide,
        });

        // プレイヤーモデル構築（Minecraftの1ピクセル = 1ユニット）
        // 頭: 8x8x8
        const headGeo = new THREE.BoxGeometry(8, 8, 8);
        applyPartUV(headGeo, SKIN_UV.head);
        const head = new THREE.Mesh(headGeo, material);
        head.position.set(0, 22, 0);
        scene.add(head);

        // 胴体: 8x12x4
        const bodyGeo = new THREE.BoxGeometry(8, 12, 4);
        applyPartUV(bodyGeo, SKIN_UV.body);
        const body = new THREE.Mesh(bodyGeo, material);
        body.position.set(0, 12, 0);
        scene.add(body);

        // 右腕: 4x12x4
        const rArmGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(rArmGeo, SKIN_UV.rightArm);
        const rArm = new THREE.Mesh(rArmGeo, material);
        rArm.position.set(-6, 12, 0);
        scene.add(rArm);

        // 左腕: 4x12x4
        const lArmGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(lArmGeo, SKIN_UV.leftArm);
        const lArm = new THREE.Mesh(lArmGeo, material);
        lArm.position.set(6, 12, 0);
        scene.add(lArm);

        // 右足: 4x12x4
        const rLegGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(rLegGeo, SKIN_UV.rightLeg);
        const rLeg = new THREE.Mesh(rLegGeo, material);
        rLeg.position.set(-2, 0, 0);
        scene.add(rLeg);

        // 左足: 4x12x4
        const lLegGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(lLegGeo, SKIN_UV.leftLeg);
        const lLeg = new THREE.Mesh(lLegGeo, material);
        lLeg.position.set(2, 0, 0);
        scene.add(lLeg);

        // アニメーションループ
        const animate = () => {
            const id = requestAnimationFrame(animate);
            sceneRef.current!.animId = id;
            controls.update();
            renderer.render(scene, camera);
        };
        const animId = requestAnimationFrame(animate);

        sceneRef.current = { renderer, scene, camera, controls, texture, animId };

        return () => {
            cancelAnimationFrame(sceneRef.current?.animId ?? animId);
            renderer.dispose();
            container.removeChild(renderer.domElement);
            sceneRef.current = null;
        };
    }, []);

    // テクスチャ更新
    useEffect(() => {
        if (!sceneRef.current || !canvasRef.current) return;
        const { texture } = sceneRef.current;
        texture.image = canvasRef.current;
        texture.needsUpdate = true;
    }, [textureVersion, canvasRef]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '300px',
                height: '400px',
                border: '2px solid #555',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #ffffffff 0%, #b3e6fbff 100%)',
            }}
        />
    );
}
