import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

interface Props {
    // 描画用キャンバスへの参照
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    // キャンバス更新カウンター(増加で更新)
    textureVersion: number;
    pose: 'idle' | 'walk';
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

// オーバーレイ用UVマッピング定義
const SKIN_UV_OVER: Record<string, PartUV> = {
    head: {
        right: { u: 32, v: 8, w: 8, h: 8 },
        front: { u: 40, v: 8, w: 8, h: 8 },
        left: { u: 48, v: 8, w: 8, h: 8 },
        back: { u: 56, v: 8, w: 8, h: 8 },
        top: { u: 40, v: 0, w: 8, h: 8 },
        bottom: { u: 48, v: 0, w: 8, h: 8 },
    },
    rightLeg: {
        right: { u: 0, v: 36, w: 4, h: 12 },
        front: { u: 4, v: 36, w: 4, h: 12 },
        left: { u: 8, v: 36, w: 4, h: 12 },
        back: { u: 12, v: 36, w: 4, h: 12 },
        top: { u: 4, v: 32, w: 4, h: 4 },
        bottom: { u: 8, v: 32, w: 4, h: 4 },
    },
    body: {
        right: { u: 16, v: 36, w: 4, h: 12 },
        front: { u: 20, v: 36, w: 8, h: 12 },
        left: { u: 28, v: 36, w: 4, h: 12 },
        back: { u: 32, v: 36, w: 8, h: 12 },
        top: { u: 20, v: 32, w: 8, h: 4 },
        bottom: { u: 28, v: 32, w: 8, h: 4 },
    },
    rightArm: {
        right: { u: 40, v: 36, w: 4, h: 12 },
        front: { u: 44, v: 36, w: 4, h: 12 },
        left: { u: 48, v: 36, w: 4, h: 12 },
        back: { u: 52, v: 36, w: 4, h: 12 },
        top: { u: 44, v: 32, w: 4, h: 4 },
        bottom: { u: 48, v: 32, w: 4, h: 4 },
    },
    leftLeg: {
        right: { u: 0, v: 52, w: 4, h: 12 },
        front: { u: 4, v: 52, w: 4, h: 12 },
        left: { u: 8, v: 52, w: 4, h: 12 },
        back: { u: 12, v: 52, w: 4, h: 12 },
        top: { u: 4, v: 48, w: 4, h: 4 },
        bottom: { u: 8, v: 48, w: 4, h: 4 },
    },
    leftArm: {
        right: { u: 48, v: 52, w: 4, h: 12 },
        front: { u: 52, v: 52, w: 4, h: 12 },
        left: { u: 56, v: 52, w: 4, h: 12 },
        back: { u: 60, v: 52, w: 4, h: 12 },
        top: { u: 52, v: 48, w: 4, h: 4 },
        bottom: { u: 56, v: 48, w: 4, h: 4 },
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

export default function SkinPreview3D({ canvasRef, textureVersion, pose }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        controls: OrbitControls;
        texture: THREE.CanvasTexture;
        animId: number;
        parts: {
            head: THREE.Mesh;
            body: THREE.Mesh;
            rArm: THREE.Mesh;
            lArm: THREE.Mesh;
            rLeg: THREE.Mesh;
            lLeg: THREE.Mesh;
        };
    } | null>(null);

    // ゴースト機能(表示/非表示)の状態管理
    const [visibleParts, setVisibleParts] = useState({
        head: true,
        body: true,
        rightArm: true,
        leftArm: true,
        rightLeg: true,
        leftLeg: true
    });

    // 特定のパーツの表示を切り替える関数
    const toggleVisibility = (part: keyof typeof visibleParts) => {
        setVisibleParts(prev => ({ ...prev, [part]: !prev[part] }));
    };

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
        camera.position.set(0, 16, 60); // 初期ポジション

        // コントローラー
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 16, 0); // 回転の中心(注視点)
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

        // 1. ベース用マテリアル
        const baseMaterial = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: false, // ← #透明を許さない
            side: THREE.FrontSide,
        });

        // 2. オーバーレイ用マテリアル
        const overlayMaterial = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1, // 透明なピクセルを綺麗に切り抜く
            side: THREE.FrontSide,
        });


        // プレイヤーモデル構築（Minecraftの1ピクセル = 1ユニット、地面をY=0）
        // 頭: 8x8x8
        const headGeo = new THREE.BoxGeometry(8, 8, 8);
        applyPartUV(headGeo, SKIN_UV.head);
        headGeo.translate(0, 4, 0);
        const head = new THREE.Mesh(headGeo, baseMaterial);
        head.position.set(0, 24, 0);
        scene.add(head);

        const headOverGeo = new THREE.BoxGeometry(9, 9, 9); // 各面+0.5
        applyPartUV(headOverGeo, SKIN_UV_OVER.head);
        headOverGeo.translate(0, 4, 0);
        const headOver = new THREE.Mesh(headOverGeo, overlayMaterial);
        head.add(headOver);

        // 胴体: 8x12x4
        const bodyGeo = new THREE.BoxGeometry(8, 12, 4);
        applyPartUV(bodyGeo, SKIN_UV.body);
        const body = new THREE.Mesh(bodyGeo, baseMaterial);
        body.position.set(0, 18, 0);
        scene.add(body);

        const bodyOverGeo = new THREE.BoxGeometry(8.5, 12.5, 4.5); // 各面+0.25
        applyPartUV(bodyOverGeo, SKIN_UV_OVER.body);
        const bodyOver = new THREE.Mesh(bodyOverGeo, overlayMaterial);
        body.add(bodyOver);

        // 右腕: 4x12x4
        const rArmGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(rArmGeo, SKIN_UV.rightArm);
        rArmGeo.translate(0, -6, 0);
        const rArm = new THREE.Mesh(rArmGeo, baseMaterial);
        rArm.position.set(-6, 24, 0);
        scene.add(rArm);

        const rArmOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5); // 各面+0.25
        applyPartUV(rArmOverGeo, SKIN_UV_OVER.rightArm);
        rArmOverGeo.translate(0, -6, 0);
        const rArmOver = new THREE.Mesh(rArmOverGeo, overlayMaterial);
        rArm.add(rArmOver);

        // 左腕: 4x12x4
        const lArmGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(lArmGeo, SKIN_UV.leftArm);
        lArmGeo.translate(0, -6, 0);
        const lArm = new THREE.Mesh(lArmGeo, baseMaterial);
        lArm.position.set(6, 24, 0);
        scene.add(lArm);

        const lArmOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
        applyPartUV(lArmOverGeo, SKIN_UV_OVER.leftArm);
        lArmOverGeo.translate(0, -6, 0);
        const lArmOver = new THREE.Mesh(lArmOverGeo, overlayMaterial);
        lArm.add(lArmOver);

        // 右足: 4x12x4
        const rLegGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(rLegGeo, SKIN_UV.rightLeg);
        rLegGeo.translate(0, -6, 0);
        const rLeg = new THREE.Mesh(rLegGeo, baseMaterial);
        rLeg.position.set(-2, 12, 0);
        scene.add(rLeg);

        const rLegOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
        applyPartUV(rLegOverGeo, SKIN_UV_OVER.rightLeg);
        rLegOverGeo.translate(0, -6, 0);
        const rLegOver = new THREE.Mesh(rLegOverGeo, overlayMaterial);
        rLeg.add(rLegOver);

        // 左足: 4x12x4
        const lLegGeo = new THREE.BoxGeometry(4, 12, 4);
        applyPartUV(lLegGeo, SKIN_UV.leftLeg);
        lLegGeo.translate(0, -6, 0);
        const lLeg = new THREE.Mesh(lLegGeo, baseMaterial);
        lLeg.position.set(2, 12, 0);
        scene.add(lLeg);

        const lLegOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
        applyPartUV(lLegOverGeo, SKIN_UV_OVER.leftLeg);
        lLegOverGeo.translate(0, -6, 0);
        const lLegOver = new THREE.Mesh(lLegOverGeo, overlayMaterial);
        lLeg.add(lLegOver);

        // アニメーションループ
        const animate = () => {
            const id = requestAnimationFrame(animate); // 呼び出し
            sceneRef.current!.animId = id;
            controls.update();
            renderer.render(scene, camera); // レンダリング
        };
        const animId = requestAnimationFrame(animate); // 初期キック

        // 初回予約番号全てをぶち込む
        sceneRef.current = {
            renderer, scene, camera, controls, texture, animId,
            parts: { head, body, rArm, lArm, rLeg, lLeg }
        };

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
            baseMaterial.dispose();
            overlayMaterial.dispose();
            texture.dispose();

            headOverGeo.dispose();
            bodyOverGeo.dispose();
            rArmOverGeo.dispose();
            lArmOverGeo.dispose();
            rLegOverGeo.dispose();
            lLegOverGeo.dispose();

            // 画面から引っこ抜く 
            if (container && renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }

            // 金庫を空に
            sceneRef.current = null;
        };
    }, []);

    // Stateが変わったら、Three.jsのモデルの表示/非表示を切り替える
    useEffect(() => {
        if (!sceneRef.current) return;
        const { head, body, rArm, lArm, rLeg, lLeg } = sceneRef.current.parts;

        head.visible = visibleParts.head;
        body.visible = visibleParts.body;
        rArm.visible = visibleParts.rightArm;
        lArm.visible = visibleParts.leftArm;
        rLeg.visible = visibleParts.rightLeg;
        lLeg.visible = visibleParts.leftLeg;
    }, [visibleParts]);

    // ポーズ
    const applyPose = (pose: 'idle' | 'walk') => {
        if (!sceneRef.current) return;
        const { head, rArm, lArm, rLeg, lLeg } = sceneRef.current.parts;

        if (pose === 'walk') {
            // 歩行ポーズ: 腕と足を前後に 30度(PI/6) 振る
            const angle = Math.PI / 6;
            rArm.rotation.x = -angle;
            lArm.rotation.x = angle;
            rLeg.rotation.x = angle;
            lLeg.rotation.x = -angle;
            head.rotation.x = 0.1;
        } else {
            // 直立ポーズ: 全部 0 に戻す
            rArm.rotation.x = 0;
            lArm.rotation.x = 0;
            rLeg.rotation.x = 0;
            lLeg.rotation.x = 0;
            head.rotation.x = 0;
        }
    };

    // テクスチャ更新, ダミーから真キャンバスへ
    useEffect(() => {
        if (!sceneRef.current || !canvasRef.current) return;
        const { texture } = sceneRef.current;
        texture.image = canvasRef.current;
        texture.needsUpdate = true;
    }, [textureVersion, canvasRef]);

    useEffect(() => {
        applyPose(pose);
    }, [pose]);

    // パーツ名とStateのキーを対応させるリスト
    const partLabels: { key: keyof typeof visibleParts; label: string }[] = [
        { key: 'head', label: '頭' },
        { key: 'body', label: '胴体' },
        { key: 'rightArm', label: '右腕' },
        { key: 'leftArm', label: '左腕' },
        { key: 'rightLeg', label: '右足' },
        { key: 'leftLeg', label: '左足' },
    ];

    return (
        <div style={{ position: 'relative', width: '300px', height: '400px' }}>
            {/* 3Dキャンバスが入る箱 */}
            <div
                ref={containerRef}
                style={{
                    width: '100%', height: '100%',
                    border: '2px solid #555',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, #ffffffff 0%, #b3e6fbff 100%)',
                }}
            />

            {/* ゴースト機能のパネル */}
            <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.7)',
                padding: '8px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>👁️ 表示切替</span>
                {partLabels.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => toggleVisibility(key)}
                        style={{
                            padding: '2px 6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            border: `1px solid ${visibleParts[key] ? '#4caf50' : '#ccc'}`,
                            backgroundColor: visibleParts[key] ? '#e8f5e9' : '#f5f5f5',
                            color: visibleParts[key] ? '#2e7d32' : '#999',
                            borderRadius: '4px',
                            textAlign: 'left',
                            display: 'flex',
                            justifyContent: 'space-between'
                        }}
                    >
                        <span>{label}</span>
                        <span>{visibleParts[key] ? 'ON' : 'OFF'}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
