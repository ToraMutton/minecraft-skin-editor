// Minecraftスキン(64×64)の展開図で、各パーツの各面がどこにあるかの定義

export type PartName = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

// Minecraftスキンの各パーツのUV座標定義
export interface UVFace {
  u: number; v: number; w: number; h: number;
}

// 1パーツにつき6面の定義
export interface PartUV {
  front: UVFace;
  back: UVFace;
  top: UVFace;
  bottom: UVFace;
  right: UVFace;
  left: UVFace;
}

// UVマッピング定義
export const SKIN_UV: Record<string, PartUV> = {
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
export const SKIN_UV_OVER: Record<string, PartUV> = {
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

// 幅 w・高さ h・奥行き d の箱の展開図を、左上 (u, v) に置いたときの6面
// Minecraftのスキンは、どのパーツもこの並び方 (skinview3d の setSkinUVs と同じ):
//   上段:  [上: d の右隣から幅w] [下: その右隣に幅w]
//   下段:  [右側面 d] [正面 w] [左側面 d] [背面 w]
export function boxUV(u: number, v: number, w: number, h: number, d: number): PartUV {
  return {
    right: { u, v: v + d, w: d, h },
    front: { u: u + d, v: v + d, w, h },
    left: { u: u + d + w, v: v + d, w: d, h },
    back: { u: u + d + w + d, v: v + d, w, h },
    top: { u: u + d, v, w, h: d },
    bottom: { u: u + d + w, v, w, h: d },
  };
}

interface ArmsUV { rightArm: PartUV; leftArm: PartUV }

// 腕の展開図 (Classic は幅4、Slim は幅3)。腕の位置は、素の層・上着の層、右腕・左腕で決まっている
export function armsUV(armWidth: number): { base: ArmsUV; over: ArmsUV } {
  return {
    base: { rightArm: boxUV(40, 16, armWidth, 12, 4), leftArm: boxUV(32, 48, armWidth, 12, 4) },
    over: { rightArm: boxUV(40, 32, armWidth, 12, 4), leftArm: boxUV(48, 48, armWidth, 12, 4) },
  };
}

// Slim: 腕の幅が3。頭・胴・脚はClassicと同じなので、腕だけ差し替える
export const SLIM_SKIN_UV: Record<string, PartUV> = { ...SKIN_UV, ...armsUV(3).base };
export const SLIM_SKIN_UV_OVER: Record<string, PartUV> = { ...SKIN_UV_OVER, ...armsUV(3).over };
