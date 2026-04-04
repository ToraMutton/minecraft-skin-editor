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

// UVマッピング定義
const SKIN_UV: Record<string, PartUV> = {
    // 頭
    head: {
        right: { u: 0, v: 8, w: 8, h: 8 },
        front: { u: 8, v: 8, w: 8, h: 8 },
        left: { u: 16, v: 8, w: 8, h: 8 },
        back: { u: 24, v: 8, w: 8, h: 8 },
        top: { u: 8, v: 0, w: 8, h: 8 },
        bottom: { u: 16, v: 0, w: 8, h: 8 },
    },
    // 右足
    rightLeg: {
        right: { u: 0, v: 20, w: 4, h: 12 },
        front: { u: 4, v: 20, w: 4, h: 12 },
        left: { u: 8, v: 20, w: 4, h: 12 },
        back: { u: 12, v: 20, w: 4, h: 12 },
        top: { u: 4, v: 16, w: 4, h: 4 },
        bottom: { u: 8, v: 16, w: 4, h: 4 },
    },
    // 胴体
    body: {
        right: { u: 16, v: 20, w: 4, h: 12 },
        front: { u: 20, v: 20, w: 8, h: 12 },
        left: { u: 28, v: 20, w: 4, h: 12 },
        back: { u: 32, v: 20, w: 8, h: 12 },
        top: { u: 20, v: 16, w: 8, h: 4 },
        bottom: { u: 28, v: 16, w: 8, h: 4 },
    },
    // 右腕
    rightArm: {
        right: { u: 40, v: 20, w: 4, h: 12 },
        front: { u: 44, v: 20, w: 4, h: 12 },
        left: { u: 48, v: 20, w: 4, h: 12 },
        back: { u: 52, v: 20, w: 4, h: 12 },
        top: { u: 44, v: 16, w: 4, h: 4 },
        bottom: { u: 48, v: 16, w: 4, h: 4 },
    },
    // 左足
    leftLeg: {
        right: { u: 16, v: 52, w: 4, h: 12 },
        front: { u: 20, v: 52, w: 4, h: 12 },
        left: { u: 24, v: 52, w: 4, h: 12 },
        back: { u: 28, v: 52, w: 4, h: 12 },
        top: { u: 20, v: 48, w: 4, h: 4 },
        bottom: { u: 24, v: 48, w: 4, h: 4 },
    },
    // 左腕
    leftArm: {
        right: { u: 32, v: 52, w: 4, h: 12 },
        front: { u: 36, v: 52, w: 4, h: 12 },
        left: { u: 40, v: 52, w: 4, h: 12 },
        back: { u: 44, v: 52, w: 4, h: 12 },
        top: { u: 36, v: 48, w: 4, h: 4 },
        bottom: { u: 40, v: 48, w: 4, h: 4 },
    },
};

// UVFaceからThree.jsのUV座標を設定する
// Three.jsのUV座標系: 左下が(0,0)、右上が(1,1)
// Minecraftのテクスチャ座標系: 左上が(0,0)、右上が(64,64)
function setFaceUV(
    geometry: THREE.BoxGeometry, // どの箱に貼るか
    faceIndex: number, // 箱の何番目の面か
    face: UVFace, // どの画像部分を貼るか
    flipH: boolean = false, // 左右反転するか(デフォルト: false)
) {
    const uv = geometry.attributes.uv;
    const texW = 64, texH = 64; // スキン画像の幅と高さ

    // テクスチャ上のピクセル座標 → 0〜1の比率に変換
    // 横方向(X/U)の計算
    let u0 = face.u / texW;
    let u1 = (face.u + face.w) / texW;
    // 縦方向(Y/V)の計算
    const v0 = 1 - face.v / texH; // Y軸反転
    const v1 = 1 - (face.v + face.h) / texH;

    // 反転処理
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
    setFaceUV(geometry, 5, partUV.back, true); // 背面は左右反転
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

    // 初期化
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return; // div要素がなかったら終了

        // Three.jsの基本セットアップ
        const renderer = new THREE.WebGLRenderer({
            antialias: true, // アンチエリアシング
            alpha: true // 描画の背景を透明に
        });
        renderer.setSize(300, 400); // レンダラーのサイズ指定(幅300px, 高さ400px)
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x000000, 0); // 透明で塗りつぶす
        container.appendChild(renderer.domElement); // キャンバス要素とdiv要素を合体

        // シーン
        const scene = new THREE.Scene();

        // カメラ
        const camera = new THREE.PerspectiveCamera(
            35,         // 視野角
            300 / 400,  // アスペクト比
            0.1,        // ニアークリップ
            100,        // ファークリップ
        );
        camera.position.set(0, 15, 60); // 初期ポジション

        // コントローラー
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 10, 0); // 回転の中心(注視点)
        controls.enablePan = false; // パン不可
        controls.minDistance = 20; // ズームインの限界値
        controls.maxDistance = 60; // ズームアウトの限界値
        controls.update();

        // ライティング
        const ambient = new THREE.AmbientLight(0xffffff, 0.7); // 環境光
        scene.add(ambient);

        const dir = new THREE.DirectionalLight(0xffffff, 0.8); // 平行光源
        dir.position.set(5, 10, 7);
        scene.add(dir);

        // テクスチャ(最初はダミーのキャンバスで作成)
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 64;
        dummyCanvas.height = 64;

        const texture = new THREE.CanvasTexture(dummyCanvas); // 仮キャンバスを3D用テクスチャに変換

        // 勝手にぼかさない
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        // 色表示をsRGBに合わせる
        texture.colorSpace = THREE.SRGBColorSpace;

        // マテリアル
        const material = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.FrontSide, // 箱の外側だけ描画
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
            const id = requestAnimationFrame(animate); // 呼び出し
            sceneRef.current!.animId = id;
            controls.update();
            renderer.render(scene, camera); // レンダリング
        };
        const animId = requestAnimationFrame(animate); // 初期キック

        // 初回予約番号全てをぶち込む
        sceneRef.current = { renderer, scene, camera, controls, texture, animId };

        // ループ・メモリ解放
        return () => {
            // 撮影ストップ
            cancelAnimationFrame(sceneRef.current?.animId ?? animId);

            // 描画エンジンの電源を切る
            renderer.dispose();

            // Three.jsのメモリ破棄
            headGeo.dispose();
            bodyGeo.dispose();
            rArmGeo.dispose();
            lArmGeo.dispose();
            rLegGeo.dispose();
            lLegGeo.dispose();
            material.dispose();
            texture.dispose();

            // 画面から引っこ抜く 
            if (container && renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }

            // 金庫を空に
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
