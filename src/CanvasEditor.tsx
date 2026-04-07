import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useRef, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';

// 使えるツール定義
type Tool = 'pen' | 'eraser' | 'bucket' | 'picker';

// 定数
const MAX_HISTORY = 30;
const MAX_RECENT_COLORS = 16;
const AUTOSAVE_KEY = 'vextora-mc-skin-editor-canvas';
const AUTOSAVE_DELAY = 1000;


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

// ブラシサイズ型
type BrushSize = 1 | 2 | 3;


// スキンのパーツ定義
// 領域1に描いたら領域2にX反転してコピー、領域2に描いたら領域1にX反転してコピーするマッピング
interface FaceMapping {
  x1: number; y1: number; w: number; h: number; // 領域1
  x2: number; y2: number;                       // 領域2 (幅と高さは共通)
}

// 腕と足、頭と胴体（全パーツ・全レイヤー）の正確なミラー対応表
const FACE_MAPPINGS: FaceMapping[] = [
  // === 頭 (Head) ===
  // 素肌 (Base)
  { x1: 0, y1: 8, w: 8, h: 8, x2: 16, y2: 8 }, // Right側面 <-> Left側面
  { x1: 8, y1: 8, w: 4, h: 8, x2: 12, y2: 8 }, // Front (左半分と右半分)
  { x1: 24, y1: 8, w: 4, h: 8, x2: 28, y2: 8 }, // Back (左半分と右半分)
  { x1: 8, y1: 0, w: 4, h: 8, x2: 12, y2: 0 }, // Top
  { x1: 16, y1: 0, w: 4, h: 8, x2: 20, y2: 0 }, // Bottom
  // 上着 (Over)
  { x1: 32, y1: 8, w: 8, h: 8, x2: 48, y2: 8 }, // Right側面 <-> Left側面
  { x1: 40, y1: 8, w: 4, h: 8, x2: 44, y2: 8 }, // Front
  { x1: 56, y1: 8, w: 4, h: 8, x2: 60, y2: 8 }, // Back
  { x1: 40, y1: 0, w: 4, h: 8, x2: 44, y2: 0 }, // Top
  { x1: 48, y1: 0, w: 4, h: 8, x2: 52, y2: 0 }, // Bottom

  // === 胴体 (Body) ===
  // 素肌 (Base)
  { x1: 16, y1: 20, w: 4, h: 12, x2: 28, y2: 20 }, // Right側面 <-> Left側面
  { x1: 20, y1: 20, w: 4, h: 12, x2: 24, y2: 20 }, // Front (左半分と右半分)
  { x1: 32, y1: 20, w: 4, h: 12, x2: 36, y2: 20 }, // Back (左半分と右半分)
  { x1: 20, y1: 16, w: 4, h: 4, x2: 24, y2: 16 }, // Top
  { x1: 28, y1: 16, w: 4, h: 4, x2: 32, y2: 16 }, // Bottom
  // 上着 (Over)
  { x1: 16, y1: 36, w: 4, h: 12, x2: 28, y2: 36 }, // Right側面 <-> Left側面
  { x1: 20, y1: 36, w: 4, h: 12, x2: 24, y2: 36 }, // Front
  { x1: 32, y1: 36, w: 4, h: 12, x2: 36, y2: 36 }, // Back
  { x1: 20, y1: 32, w: 4, h: 4, x2: 24, y2: 32 }, // Top
  { x1: 28, y1: 32, w: 4, h: 4, x2: 32, y2: 32 }, // Bottom

  // === 右足・左足 ===
  // 素肌 (Base)
  { x1: 4, y1: 16, w: 4, h: 4, x2: 20, y2: 48 }, // Top
  { x1: 8, y1: 16, w: 4, h: 4, x2: 24, y2: 48 }, // Bottom
  { x1: 0, y1: 20, w: 4, h: 12, x2: 24, y2: 52 }, // Right(外側) <-> Left(外側)
  { x1: 4, y1: 20, w: 4, h: 12, x2: 20, y2: 52 }, // Front
  { x1: 8, y1: 20, w: 4, h: 12, x2: 16, y2: 52 }, // Left(内側) <-> Right(内側)
  { x1: 12, y1: 20, w: 4, h: 12, x2: 28, y2: 52 }, // Back
  // 上着 (Over)
  { x1: 4, y1: 32, w: 4, h: 4, x2: 4, y2: 48 }, // Top
  { x1: 8, y1: 32, w: 4, h: 4, x2: 8, y2: 48 }, // Bottom
  { x1: 0, y1: 36, w: 4, h: 12, x2: 8, y2: 52 }, // Right <-> Left
  { x1: 4, y1: 36, w: 4, h: 12, x2: 4, y2: 52 }, // Front
  { x1: 8, y1: 36, w: 4, h: 12, x2: 0, y2: 52 }, // Left <-> Right
  { x1: 12, y1: 36, w: 4, h: 12, x2: 12, y2: 52 }, // Back

  // === 右腕・左腕 ===
  // 素肌 (Base)
  { x1: 44, y1: 16, w: 4, h: 4, x2: 36, y2: 48 }, // Top
  { x1: 48, y1: 16, w: 4, h: 4, x2: 40, y2: 48 }, // Bottom
  { x1: 40, y1: 20, w: 4, h: 12, x2: 40, y2: 52 }, // Right(外側) <-> Left(外側)
  { x1: 44, y1: 20, w: 4, h: 12, x2: 36, y2: 52 }, // Front
  { x1: 48, y1: 20, w: 4, h: 12, x2: 32, y2: 52 }, // Left(内側) <-> Right(内側)
  { x1: 52, y1: 20, w: 4, h: 12, x2: 44, y2: 52 }, // Back
  // 上着 (Over)
  { x1: 44, y1: 32, w: 4, h: 4, x2: 52, y2: 48 }, // Top
  { x1: 48, y1: 32, w: 4, h: 4, x2: 56, y2: 48 }, // Bottom
  { x1: 40, y1: 36, w: 4, h: 12, x2: 56, y2: 52 }, // Right <-> Left
  { x1: 44, y1: 36, w: 4, h: 12, x2: 52, y2: 52 }, // Front
  { x1: 48, y1: 36, w: 4, h: 12, x2: 48, y2: 52 }, // Left <-> Right
  { x1: 52, y1: 36, w: 4, h: 12, x2: 60, y2: 52 }, // Back
];

// 色コードを数値に変換する関数
function hexToRgba(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  // 変換失敗(mがnull)なら黒を返す
  if (!m) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
    a: 255
  };
}

// 数値を色コードに変換する関数
function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// 512x512の高解像度キャンバスに、ピクセル単位の網目を描画してテクスチャ化する関数
function createGridTexture(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    // 64x64のマイクラテクスチャに合わせ、8ピクセルごとに線を引く(512/64 = 8)
    for (let i = 0; i <= 64; i++) {
      const pos = i * 8;
      // 線が細すぎて消えないように2px幅で描画
      ctx.fillRect(pos, 0, 1, 512); // 縦線
      ctx.fillRect(0, pos, 512, 1); // 横線
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter; // ズームアウトした時に線が消えないようにLinear
  return tex;
}

// 描いたピクセルのミラー先座標を返す関数
function getMirrorCoord(x: number, y: number): [number, number] | null {
  for (const map of FACE_MAPPINGS) {
    // 領域1にヒットした場合 -> 領域2へX反転コピー
    if (x >= map.x1 && x < map.x1 + map.w && y >= map.y1 && y < map.y1 + map.h) {
      const relX = x - map.x1;
      const relY = y - map.y1;
      return [map.x2 + (map.w - 1 - relX), map.y2 + relY];
    }
    // 領域2にヒットした場合 -> 領域1へX反転コピー
    if (x >= map.x2 && x < map.x2 + map.w && y >= map.y2 && y < map.y2 + map.h) {
      const relX = x - map.x2;
      const relY = y - map.y2;
      return [map.x1 + (map.w - 1 - relX), map.y1 + relY];
    }
  }
  return null;
}


interface Props {
  // テクスチャ更新を親に通知するコールバック
  onTextureUpdate?: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function CanvasEditor({ onTextureUpdate, canvasRef }: Props) {
  // 描画ツール系
  const [color, setColor] = useState('#000000') // 現在の色
  const [tool, setTool] = useState<Tool>('pen') // 現在のツール
  const [brushSize, setBrushSize] = useState<BrushSize>(1) // ブラシサイズ

  // 表示設定系
  const [mirror, setMirror] = useState(false) // ミラー

  // UI状態系
  const [isDrawing, setIsDrawing] = useState(false) // 描画中かどうか
  const [canUndo, setCanUndo] = useState(false) // Undo可能か
  const [canRedo, setCanRedo] = useState(false) // Redo可能か
  const [recentColors, setRecentColors] = useState<string[]>([]) //最近の色

  const [visibleParts, setVisibleParts] = useState({
    head: true,
    body: true,
    rightArm: true,
    leftArm: true,
    rightLeg: true,
    leftLeg: true,
  });

  const [visibleOverlay, setVisibleOverlay] = useState({
    head: true,
    body: true,
    rightArm: true,
    leftArm: true,
    rightLeg: true,
    leftLeg: true,
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

  // 裏のメモ帳
  const undoStack = useRef<ImageData[]>([]) // Undo履歴
  const redoStack = useRef<ImageData[]>([]) // Redo履歴
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 自動保存タイマー


  // 3Dプレビューにテクスチャ変更を通知 + 自動保存
  const notifyUpdate = useCallback(() => {
    // 親コンポーネントに変更を通知
    onTextureUpdate?.();

    // 自動保存(デバウンス)
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current); // 前回のタイマーをキャンセル
    }

    // 新しくタイマーをセット(1000ミリ秒後に実行)
    autosaveTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          // キャンバスの内容を画像としてブラウザに保存
          localStorage.setItem(AUTOSAVE_KEY, canvas.toDataURL('image/png'));
        } catch {
          /* localStorageが満杯の場合は無視 */
        }
      }
    }, AUTOSAVE_DELAY);
  }, [onTextureUpdate, canvasRef]);

  // --- 3Dキャンバスの初期化と描画ループ ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // レンダラー（描画エンジン）の作成
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(512, 512); // 一旦空き地のサイズ(512x512)に固定
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement); // 空き地にcanvasをぶち込む

    // シーンとカメラの作成
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 16, 60);

    // コントローラーの追加
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 16, 0); // 回転の中心をスキンの中心に設定

    controls.enablePan = false; // パン(平行移動)を無効化

    // 左クリックを「回転」、中クリックを「ズーム」、右クリックは無効(null)にする
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null as any };

    // 光の追加
    scene.add(new THREE.AmbientLight(0xffffff, 0.7)); // 全体を照らす薄い光
    const dir = new THREE.DirectionalLight(0xffffff, 0.8); // 影を作る強い光
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // テクスチャとマテリアルの準備
    const texture = new THREE.CanvasTexture(canvasRef.current!);
    texture.magFilter = THREE.NearestFilter; // ドット絵がぼやけないように
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace; // 色を正確に

    const baseMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: false,
      side: THREE.FrontSide,
    });

    const overlayMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide,
    });

    const baseGridTex = createGridTexture('rgba(129, 212, 250, 0.4)'); // 素肌用の水色
    const overGridTex = createGridTexture('rgba(255, 255, 255, 0.5)'); // 上着用の白色

    const baseGridMaterial = new THREE.MeshBasicMaterial({
      map: baseGridTex,
      transparent: true,
      depthWrite: false, // ちらつき防止
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const overGridMaterial = new THREE.MeshBasicMaterial({
      map: overGridTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    // 頭: 8x8x8
    const headGeo = new THREE.BoxGeometry(8, 8, 8);
    applyPartUV(headGeo, SKIN_UV.head);
    headGeo.translate(0, 4, 0);
    const head = new THREE.Mesh(headGeo, baseMaterial.clone());
    head.name = 'head';
    head.position.set(0, 24, 0);
    scene.add(head);

    // 頭Over
    const headOverGeo = new THREE.BoxGeometry(9, 9, 9);
    applyPartUV(headOverGeo, SKIN_UV_OVER.head);
    headOverGeo.translate(0, 4, 0);
    const headOver = new THREE.Mesh(headOverGeo, overlayMaterial.clone());
    headOver.name = 'headOver';
    head.add(headOver);

    // 胴体: 8x12x4
    const bodyGeo = new THREE.BoxGeometry(8, 12, 4);
    applyPartUV(bodyGeo, SKIN_UV.body);
    const body = new THREE.Mesh(bodyGeo, baseMaterial.clone());
    body.name = 'body';
    body.position.set(0, 18, 0);
    scene.add(body);

    // 胴体Over
    const bodyOverGeo = new THREE.BoxGeometry(8.5, 12.5, 4.5);
    applyPartUV(bodyOverGeo, SKIN_UV_OVER.body);
    const bodyOver = new THREE.Mesh(bodyOverGeo, overlayMaterial.clone());
    bodyOver.name = 'bodyOver';
    body.add(bodyOver);

    // 右腕: 4x12x4
    const rArmGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(rArmGeo, SKIN_UV.rightArm);
    rArmGeo.translate(0, -6, 0);
    const rArm = new THREE.Mesh(rArmGeo, baseMaterial.clone());
    rArm.name = 'rightArm';
    rArm.position.set(-6, 24, 0);
    scene.add(rArm);

    // 右腕Over
    const rArmOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(rArmOverGeo, SKIN_UV_OVER.rightArm);
    rArmOverGeo.translate(0, -6, 0);
    const rArmOver = new THREE.Mesh(rArmOverGeo, overlayMaterial.clone());
    rArmOver.name = 'rightArmOver';
    rArm.add(rArmOver);

    // 左腕: 4x12x4
    const lArmGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(lArmGeo, SKIN_UV.leftArm);
    lArmGeo.translate(0, -6, 0);
    const lArm = new THREE.Mesh(lArmGeo, baseMaterial.clone());
    lArm.name = 'leftArm';
    lArm.position.set(6, 24, 0);
    scene.add(lArm);

    // 左腕Over
    const lArmOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(lArmOverGeo, SKIN_UV_OVER.leftArm);
    lArmOverGeo.translate(0, -6, 0);
    const lArmOver = new THREE.Mesh(lArmOverGeo, overlayMaterial.clone());
    lArmOver.name = 'leftArmOver';
    lArm.add(lArmOver);

    // 右足: 4x12x4
    const rLegGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(rLegGeo, SKIN_UV.rightLeg);
    rLegGeo.translate(0, -6, 0);
    const rLeg = new THREE.Mesh(rLegGeo, baseMaterial.clone());
    rLeg.name = 'rightLeg';
    rLeg.position.set(-2, 12, 0);
    scene.add(rLeg);

    // 右足Over
    const rLegOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(rLegOverGeo, SKIN_UV_OVER.rightLeg);
    rLegOverGeo.translate(0, -6, 0);
    const rLegOver = new THREE.Mesh(rLegOverGeo, overlayMaterial.clone());
    rLegOver.name = 'rightLegOver';
    rLeg.add(rLegOver);

    // 左足: 4x12x4
    const lLegGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(lLegGeo, SKIN_UV.leftLeg);
    lLegGeo.translate(0, -6, 0);
    const lLeg = new THREE.Mesh(lLegGeo, baseMaterial.clone());
    lLeg.name = 'leftLeg';
    lLeg.position.set(2, 12, 0);
    scene.add(lLeg);

    // 左足Over
    const lLegOverGeo = new THREE.BoxGeometry(4.5, 12.5, 4.5);
    applyPartUV(lLegOverGeo, SKIN_UV_OVER.leftLeg);
    lLegOverGeo.translate(0, -6, 0);
    const lLegOver = new THREE.Mesh(lLegOverGeo, overlayMaterial.clone());
    lLegOver.name = 'leftLegOver';
    lLeg.add(lLegOver);

    scene.add(lLeg);

    const parts = [head, body, rArm, lArm, rLeg, lLeg];
    threeCtx.current = { camera, parts, controls };

    parts.forEach(part => {
      // 素肌(Base)に網目メッシュを被せる
      const baseGrid = new THREE.Mesh(part.geometry, baseGridMaterial);
      baseGrid.name = part.name + 'BaseGrid';
      part.add(baseGrid);

      // 上着(Over)に網目メッシュを被せる
      const overMesh = part.children.find(c => c.name === part.name + 'Over') as THREE.Mesh;
      if (overMesh) {
        const overGrid = new THREE.Mesh(overMesh.geometry, overGridMaterial);
        overGrid.name = part.name + 'OverGrid';
        overMesh.add(overGrid);
      }
    });


    // アニメーションループ
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update(); // コントローラーの動きを計算
      texture.needsUpdate = true; // 毎フレーム裏方キャンバスの最新状態を引っ張る

      if (modeRef.current === 'pose') {
        const time = Date.now() * 0.005; // 振るスピード
        rArm.rotation.x = Math.sin(time) * 0.5;
        lArm.rotation.x = -Math.sin(time) * 0.5;
        rLeg.rotation.x = -Math.sin(time) * 0.5;
        lLeg.rotation.x = Math.sin(time) * 0.5;
      } else {
        // 編集モードなら直立に戻す
        rArm.rotation.x = 0;
        lArm.rotation.x = 0;
        rLeg.rotation.x = 0;
        lLeg.rotation.x = 0;
      }

      renderer.render(scene, camera); // 撮影して画面に出力
    };
    animate(); // ループ開始

    // クリーンアップ
    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();

      // シーン内の全オブジェクトを巡回して、Meshだったらジオメトリとマテリアルを破棄
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
        }
      });

      // 大元のマテリアルとテクスチャ本体も忘れずに
      baseMaterial.dispose();
      overlayMaterial.dispose();
      baseGridMaterial.dispose();
      overGridMaterial.dispose();
      baseGridTex.dispose();
      overGridTex.dispose();
      texture.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [canvasRef]);


  // 起動時にlocalStorageからキャンバスを復元
  useEffect(() => {
    // localStorageをチェック
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return;

    // キャンバスを準備
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 画像を読み込む
    const img = new Image(); // 空の画像オブジェクトを作成
    img.onload = () => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      onTextureUpdate?.();
    };
    img.src = saved;
  }, [onTextureUpdate, canvasRef]);


  // --- 履歴操作 ---

  // 現在の状態をUndo履歴に保存する関数
  const pushUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 状態を履歴に積む
    undoStack.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    );

    // 履歴が30件を超えたら古いものを削除
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();

    // 新しく描くとredoStackを空に
    redoStack.current = [];
    // ボタンの状態を更新
    setCanUndo(true);
    setCanRedo(false);
  }, [canvasRef]);

  // Undo履歴を使って1つ前に戻る
  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // undoStackが空なら何もしない
    if (undoStack.current.length === 0) return;

    // 現在の状態をredoStackに積む
    redoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    // undoStackから1つ取り出してcanvasに反映
    ctx.putImageData(undoStack.current.pop()!, 0, 0);

    // ボタンの状態を更新
    // まだundoStackに履歴があればtrueのまま、なければfalse
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    notifyUpdate();
  }, [canvasRef, notifyUpdate]);

  // Redo履歴を使って1つ先に進む
  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (redoStack.current.length === 0) return;

    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoStack.current.pop()!, 0, 0);

    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    notifyUpdate();
  }, [canvasRef, notifyUpdate]);


  // --- 最近使った色 ---

  const addRecentColor = useCallback((c: string) => {
    setRecentColors(prev => {
      // prevの中からcと違う色だけ残す
      const filtered = prev.filter(e => e !== c);
      // 配列を展開し、1つの配列にまとめる
      return [c, ...filtered].slice(0, MAX_RECENT_COLORS);
    });
  }, []);


  // --- バケツ ---

  const floodFill = useCallback((startX: number, startY: number, fillColor: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height); // putImageDataで再利用するため
    const data = imageData.data; // ピクセルの読み書き用
    const fill = hexToRgba(fillColor);

    // クリックした座標からdata配列のインデックスを計算
    const idx = (startY * width + startX) * 4;
    // クリックした座標の色を取得
    const tR = data[idx], tG = data[idx + 1], tB = data[idx + 2], tA = data[idx + 3];
    // クリックした色と塗りたい色が同じなら何もしない
    if (tR === fill.r && tG === fill.g && tB === fill.b && tA === fill.a) return;

    // ---

    // キューにクリックした座標をいれて開始
    const queue: [number, number][] = [[startX, startY]];

    // 64 × 64 = 4096個の0が並んだ配列
    // 0 → まだ訪れていない
    // 1 → 既に訪れた
    const visited = new Uint8Array(width * height);

    // キューが空になるまで繰り返す
    while (queue.length > 0) {
      // 先端の座標を取り出す
      const [cx, cy] = queue.pop()!;

      // キャンバス範囲外チェック
      if (cx < 0 || cx >= 64 || cy < 0 || cy >= 64) continue;
      // 訪問済みチェック
      const pos = cy * width + cx; // visited配列用に2次元座標を1次元インデックスに変換
      if (visited[pos]) continue; // 0 → Falsy, 1 → Truthy
      visited[pos] = 1; // 訪れた印をつける(1を代入)

      // 色チェック
      const i = pos * 4;
      // クリックした色と違う色なら次のループへ
      if (data[i] !== tR || data[i + 1] !== tG || data[i + 2] !== tB || data[i + 3] !== tA) continue;

      // 塗る
      data[i] = fill.r
      data[i + 1] = fill.g
      data[i + 2] = fill.b
      data[i + 3] = fill.a

      // 右、左、下、上をキューに追加して次のループで処理
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  }, [canvasRef]);

  // --- スポイト ---

  const pickColor = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1ピクセルだけ取得
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    // 透明なら無視
    if (pixel[3] === 0) return;
    const hex = rgbaToHex(pixel[0], pixel[1], pixel[2]);

    // 状態を更新
    setColor(hex); // 現在の色を変更
    addRecentColor(hex); // 最近使った色に追加
    setTool('pen'); // penに自動切り替え
  };

  // --- 描画(ブラシサイズ＆ミラー対応) ---

  // 1点を中心にブラスサイズ分のピクセルを塗る
  const applyToolAt = useCallback((x: number, y: number, ctx: CanvasRenderingContext2D) => {
    // ブラシサイズの半径
    const half = Math.floor(brushSize / 2);

    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = x + dx, py = y + dy;
        // キャンバス外なら次のループへ
        if (px < 0 || px >= 64 || py < 0 || py >= 64) continue;

        if (tool === 'eraser') {
          ctx.clearRect(px, py, 1, 1); // 消しゴム: 透明にする
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(px, py, 1, 1); // 1×1ピクセルを塗る
        }
      }
    }
  }, [tool, color, brushSize]);

  // ミラーも考慮して塗るver
  const applyTool = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    applyToolAt(x, y, ctx);

    // ミラー描画
    if (mirror) {
      const half = Math.floor(brushSize / 2);

      for (let dy = -half; dy < brushSize - half; dy++) {
        for (let dx = -half; dx < brushSize - half; dx++) {
          const px = x + dx, py = y + dy;
          // ミラー先座標を取得
          const mc = getMirrorCoord(px, py);

          // ミラー先座標が存在する場合だけ
          if (mc) {
            if (tool === 'eraser') {
              ctx.clearRect(mc[0], mc[1], 1, 1);
            } else {
              ctx.fillStyle = color;
              ctx.fillRect(mc[0], mc[1], 1, 1);
            }
          }
        }
      }
    }
  }, [canvasRef, applyToolAt, mirror, brushSize, tool, color]);

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


  // --- 全消し ---

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndo(); // 消す前の状態を履歴に保存
    ctx.clearRect(0, 0, 64, 64); // キャンバス全体を透明に
    notifyUpdate(); // 3Dプレビューに通知
  };


  // --- 新規作成 ---

  const newCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndo();
    ctx.clearRect(0, 0, 64, 64);
    localStorage.removeItem(AUTOSAVE_KEY); // オートセーブのデータも削除
    notifyUpdate();
  };

  // --- PNG保存 ---

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 画像保存をブラウザだけで完結させる流れ
    const link = document.createElement('a'); // aタグを動的に作成
    link.download = 'NewSkin.png'; // ダウンロードファイル名を設定
    link.href = canvas.toDataURL('image/png'); // キャンバスをPNG形式の文字列に変換
    link.click(); // プログラムからクリックしてダウンロード開始
  };

  // --- 画像インポート ---

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; // 選ばれたファイルが複数の場合でも最初の1枚を対象にする
    if (!file) return; // ファイルがなければ終了

    const img = new Image(); // ブラウザ組み込みの画像オブジェクトを作成

    // 画像読み込みが完了したら実行
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      pushUndo();
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      notifyUpdate();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = ''; // 同じファイルを再度選べるようにリセット
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


  // return部分


  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>

      {/* ===== ツールバー 1行目: ツール選択 ===== */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* カラーピッカー */}
        <input
          type="color"
          value={color}
          onChange={(e) => { setColor(e.target.value); addRecentColor(e.target.value); }}
          disabled={colorDisabled}
          style={{ cursor: colorDisabled ? 'not-allowed' : 'pointer', width: '32px', height: '28px' }}
        />

        {/* ペン、消しゴム、バケツ、スポイト */}
        {(['pen', 'eraser', 'bucket', 'picker'] as Tool[]).map(t => (
          <button key={t} onClick={() => setTool(t)} style={toolBtn(t)}>
            {toolConfig[t].label}
          </button>
        ))}

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* ブラシサイズ */}
        <span style={{ fontSize: '11px', color: '#888' }}>筆</span>
        {([1, 2, 3] as BrushSize[]).map(s => (
          <button key={s} onClick={() => setBrushSize(s)} style={sizeBtn(s)}>
            {s}
          </button>
        ))}

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* ミラー */}
        <button onClick={() => setMirror(!mirror)} style={toggleBtn(mirror, '#e1bee7')}>
          🪞 {mirror ? 'ON' : 'OFF'}
        </button>

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* レイヤー切り替え */}
        <button
          onClick={() => setShowOverlay(!showOverlay)}
          style={toggleBtn(showOverlay, '#c5cae9')}
        >
          {showOverlay ? '上着: 表示' : '上着: 非表示'}
        </button>
      </div>

      <button
        onClick={() => setIsAutoFocus(!isAutoFocus)}
        style={toggleBtn(isAutoFocus, '#ffe0b2')}
      >
        {isAutoFocus ? '🎯 AF: ON' : '📍 AF: OFF'}
      </button>

      {/* ===== ツールバー 2行目: 操作ボタン ===== */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>

        {/* Undo / Redo ボタン */}
        <button onClick={handleUndo} disabled={!canUndo}
          style={{ ...btn, opacity: canUndo ? 1 : 0.4 }} title="元に戻す">↩️</button>
        <button onClick={handleRedo} disabled={!canRedo}
          style={{ ...btn, opacity: canRedo ? 1 : 0.4 }} title="やり直す">↪️</button>

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* 新規作成 */}
        <button onClick={newCanvas} style={btn}>新規 📄</button>

        {/* 全消し */}
        <button onClick={clearCanvas} style={btn}>全消し 🗑️</button>

        {/* 読込 */}
        <button onClick={() => fileInputRef.current?.click()} style={{ ...btn, backgroundColor: '#fff3e0' }}>
          読込 📂
        </button>

        <input ref={fileInputRef} type="file" accept=".png" onChange={handleImport} style={{ display: 'none' }} />

        {/* 保存 */}
        <button onClick={downloadImage} style={{ ...btn, backgroundColor: '#e0f7fa' }}>保存 💾</button>

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* コンテキスト・ガイド切替 */}
        <button
          onClick={() => setShowGuide(!showGuide)}
          style={toggleBtn(showGuide, '#b2ebf2')}
        >
          {showGuide ? '🌐 ガイド: ON' : '🌑 ガイド: OFF'}
        </button>

        {/* 縦線 */}
        <div style={{ width: '1px', height: '22px', backgroundColor: '#ccc' }} />

        {/* モード切替ボタン */}
        <button
          onClick={() => setMode(mode === 'edit' ? 'pose' : 'edit')}
          style={{
            ...btn,
            backgroundColor: mode === 'pose' ? '#a5d6a7' : '#ffcdd2',
            fontWeight: 'bold',
            color: '#333',
            border: mode === 'pose' ? '2px solid #4caf50' : '2px solid #f44336'
          }}
        >
          {mode === 'edit' ? '🖌️ 編集モード' : '🚶‍♂️ 鑑賞モード'}
        </button>
      </div>

      {/* ===== 最近使った色パレット ===== */}
      {/* 最近使った色が1つ以上あるときだけ表示 */}
      {recentColors.length > 0 && (
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {recentColors.map((c, i) => (
            <button key={`${c}-${i}`}
              onClick={() => { setColor(c); setTool('pen'); }}
              title={c}
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: c,
                border: c === color ? '2px solid #333' : '1px solid #aaa',
                borderRadius: '3px',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* ===== キャンバスエリア ===== */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          width: '512px', height: '512px',
          border: '2px solid #555',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#222',
          touchAction: 'none',
        }}
      >
        {/* パーツ表示切替メニュー */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          background: 'rgba(0, 0, 0, 0.6)',
          padding: '8px',
          borderRadius: '8px',
          pointerEvents: 'auto',
        }}>
          <span style={{ fontSize: '11px', color: '#fff', marginBottom: '4px', textAlign: 'center' }}>👁️ 表示切替</span>
          {(Object.keys(visibleParts) as (keyof typeof visibleParts)[]).map(key => {
            const labels: Record<string, string> = { head: '頭', body: '胴', rightArm: '右腕', leftArm: '左腕', rightLeg: '右足', leftLeg: '左足' };
            const isBaseActive = visibleParts[key];
            const isOverActive = visibleOverlay[key as keyof typeof visibleOverlay];

            return (
              <div key={key} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#fff', width: '22px', textAlign: 'center' }}>{labels[key]}</span>

                {/* 素肌トグル */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setVisibleParts(prev => ({ ...prev, [key]: !prev[key] }))}
                  style={{
                    ...btn,
                    backgroundColor: isBaseActive ? '#4caf50' : '#555',
                    color: '#fff', fontSize: '10px', border: 'none', padding: '2px 4px', width: '38px'
                  }}
                >
                  肌 {isBaseActive ? 'ON' : 'OFF'}
                </button>

                {/* 上着トグル */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setVisibleOverlay(prev => ({ ...prev, [key]: !prev[key as keyof typeof visibleOverlay] }))}
                  style={{
                    ...btn,
                    backgroundColor: isOverActive ? '#2196f3' : '#555',
                    color: '#fff', fontSize: '10px', border: 'none', padding: '2px 4px', width: '38px'
                  }}
                >
                  着 {isOverActive ? 'ON' : 'OFF'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- 見えない裏方キャンバス --- */}
      <canvas
        ref={canvasRef}
        width={64}
        height={64}
        style={{ display: 'none' }}
      />
    </div>
  );
}
