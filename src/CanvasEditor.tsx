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
interface SkinPart {
  name: string;
  x: number; y: number; w: number; h: number;
}

const SKIN_PARTS: SkinPart[] = [
  { name: '頭', x: 0, y: 0, w: 32, h: 16 },
  { name: '右足', x: 0, y: 16, w: 16, h: 16 },
  { name: '胴体', x: 16, y: 16, w: 24, h: 16 },
  { name: '右腕', x: 40, y: 16, w: 16, h: 16 },
  { name: '左足', x: 16, y: 48, w: 16, h: 16 },
  { name: '左腕', x: 32, y: 48, w: 16, h: 16 },
  { name: '頭(over)', x: 32, y: 0, w: 32, h: 16 },
  { name: '右足(over)', x: 0, y: 32, w: 16, h: 16 },
  { name: '胴体(over)', x: 16, y: 32, w: 24, h: 16 },
  { name: '右腕(over)', x: 40, y: 32, w: 16, h: 16 },
  { name: '左足(over)', x: 0, y: 48, w: 16, h: 16 },
  { name: '左腕(over)', x: 48, y: 48, w: 16, h: 16 },
];

// ミラー描画用の対応マッピング
interface MirrorMapping {
  src: SkinPart;
  dst: SkinPart;
}

const MIRROR_PAIRS: MirrorMapping[] = [
  { src: SKIN_PARTS[3], dst: SKIN_PARTS[5] },   // 右腕 → 左腕
  { src: SKIN_PARTS[5], dst: SKIN_PARTS[3] },   // 左腕 → 右腕

  { src: SKIN_PARTS[1], dst: SKIN_PARTS[4] },   // 右足 → 左足
  { src: SKIN_PARTS[4], dst: SKIN_PARTS[1] },   // 左足 → 右足


  { src: SKIN_PARTS[9], dst: SKIN_PARTS[11] },  // 右腕over → 左腕over
  { src: SKIN_PARTS[11], dst: SKIN_PARTS[9] },  // 左腕over → 右腕over

  { src: SKIN_PARTS[7], dst: SKIN_PARTS[10] },  // 右足over → 左足over
  { src: SKIN_PARTS[10], dst: SKIN_PARTS[7] },  // 左足over → 右足over
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

// 描いたピクセルのミラー先座標を返す関数
function getMirrorCoord(x: number, y: number): [number, number] | null {
  for (const { src, dst } of MIRROR_PAIRS) {
    if (x >= src.x && x < src.x + src.w && y >= src.y && y < src.y + src.h) {
      // パーツ内の相対座標
      const relX = x - src.x;
      const relY = y - src.y;
      // 左右反転してミラー先に変換
      const mirrorX = dst.x + (dst.w - 1 - relX);
      const mirrorY = dst.y + relY;
      return [mirrorX, mirrorY];
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

  // useRef系
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null) // ファイル入力

  const threeCtx = useRef<{ camera: THREE.PerspectiveCamera; parts: THREE.Mesh[] } | null>(null);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controls.mouseButtons = { LEFT: null as any, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };


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
      side: THREE.FrontSide,
    });

    // 頭: 8x8x8
    const headGeo = new THREE.BoxGeometry(8, 8, 8);
    applyPartUV(headGeo, SKIN_UV.head);
    headGeo.translate(0, 4, 0);
    const head = new THREE.Mesh(headGeo, baseMaterial.clone());
    head.name = 'head';
    head.position.set(0, 24, 0);
    scene.add(head);

    // 胴体: 8x12x4
    const bodyGeo = new THREE.BoxGeometry(8, 12, 4);
    applyPartUV(bodyGeo, SKIN_UV.body);
    const body = new THREE.Mesh(bodyGeo, baseMaterial.clone());
    body.name = 'body';
    body.position.set(0, 18, 0);
    scene.add(body);

    // 右腕: 4x12x4
    const rArmGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(rArmGeo, SKIN_UV.rightArm);
    rArmGeo.translate(0, -6, 0);
    const rArm = new THREE.Mesh(rArmGeo, baseMaterial.clone());
    rArm.name = 'rightArm';
    rArm.position.set(-6, 24, 0);
    scene.add(rArm);

    // 左腕: 4x12x4
    const lArmGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(lArmGeo, SKIN_UV.leftArm);
    lArmGeo.translate(0, -6, 0);
    const lArm = new THREE.Mesh(lArmGeo, baseMaterial.clone());
    lArm.name = 'leftArm';
    lArm.position.set(6, 24, 0);
    scene.add(lArm);

    // 右足: 4x12x4
    const rLegGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(rLegGeo, SKIN_UV.rightLeg);
    rLegGeo.translate(0, -6, 0);
    const rLeg = new THREE.Mesh(rLegGeo, baseMaterial.clone());
    rLeg.name = 'rightLeg';
    rLeg.position.set(-2, 12, 0);
    scene.add(rLeg);

    // 左足: 4x12x4
    const lLegGeo = new THREE.BoxGeometry(4, 12, 4);
    applyPartUV(lLegGeo, SKIN_UV.leftLeg);
    lLegGeo.translate(0, -6, 0);
    const lLeg = new THREE.Mesh(lLegGeo, baseMaterial.clone());
    lLeg.name = 'leftLeg';
    lLeg.position.set(2, 12, 0);

    scene.add(lLeg); const parts = [head, body, rArm, lArm, rLeg, lLeg];
    threeCtx.current = { camera, parts };

    // アニメーションループ
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update(); // コントローラーの動きを計算
      texture.needsUpdate = true; // 毎フレーム裏方キャンバスの最新状態を引っ張る
      renderer.render(scene, camera); // 撮影して画面に出力
    };
    animate(); // ループ開始

    // クリーンアップ
    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      // クローンしたマテリアルの掃除
      parts.forEach(part => (part.material as THREE.Material).dispose());

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
    // 左クリック(0)以外は無視してカメラ操作に譲る
    if (e.button !== 0 || !threeCtx.current) return;

    const { camera, parts } = threeCtx.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // 頭に当たったかチェック
    const intersects = raycaster.intersectObjects(parts);
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (!hit.uv) return;

      const texX = Math.floor(hit.uv.x * 64);
      const texY = Math.floor((1 - hit.uv.y) * 64);

      pushUndo(); // 塗る前に履歴保存
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
    }
  };

  // --- ゴースト化と自動カメラズーム処理 ---
  useEffect(() => {
    if (!threeCtx.current) return;
    const { camera, parts } = threeCtx.current;

    const activeMeshes: THREE.Mesh[] = [];
    let activeCount = 0;

    // 各パーツの表示/ゴースト化の切り替え
    parts.forEach(part => {
      const mat = part.material as THREE.MeshLambertMaterial;
      const isActive = visibleParts[part.name as keyof typeof visibleParts];

      if (isActive) {
        mat.opacity = 1.0;
        mat.transparent = false;
        activeMeshes.push(part);
        activeCount++;
      } else {
        mat.opacity = 0.2;
        mat.transparent = true;
      }
      mat.needsUpdate = true;
    });

    // カメラ移動ロジック
    // 全部ON、または全部OFFの場合は全体ビュー(初期位置)に戻す
    if (activeCount === 6 || activeCount === 0) {
      gsap.to(camera.position, { x: 0, y: 16, z: 60, duration: 0.6, ease: "power2.out" });
      return;
    }

    // ONになっているパーツをすべて包み込む箱を計算
    const box = new THREE.Box3();
    activeMeshes.forEach(mesh => box.expandByObject(mesh));

    // 箱の中心点
    const center = new THREE.Vector3();
    box.getCenter(center);

    // 箱のサイズ
    const size = new THREE.Vector3();
    box.getSize(size);

    // 一番長い辺に合わせてカメラの距離を計算
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5 + 10;

    // GSAPで滑らかにズーム
    gsap.to(camera.position, {
      x: center.x,
      y: center.y,
      z: center.z + distance,
      duration: 0.6,
      ease: "power2.out",
    });
  }, [visibleParts]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !threeCtx.current) return;

    const { camera, parts } = threeCtx.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const intersects = raycaster.intersectObjects(parts);
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
      </div>

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
            const labels: Record<string, string> = { head: '頭', body: '胴体', rightArm: '右腕', leftArm: '左腕', rightLeg: '右足', leftLeg: '左足' };
            const isActive = visibleParts[key];
            return (
              <button
                key={key}
                onPointerDown={(e) => e.stopPropagation()} // キャンバスへのペイント誤爆を防ぐ
                onClick={() => setVisibleParts(prev => ({ ...prev, [key]: !prev[key] }))}
                style={{
                  ...btn,
                  backgroundColor: isActive ? '#4caf50' : '#555',
                  color: '#fff',
                  fontSize: '10px',
                  border: 'none',
                  width: '70px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>{labels[key]}</span>
                <span>{isActive ? 'ON' : 'OFF'}</span>
              </button>
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
