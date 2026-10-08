// 塗り用のバッファ
// まず「どの素材の、何段階目の色か」だけを記録し、実際の色と陰影は最後にまとめて決める
// (素材ごとに色を5段階に絞るため。色は ramp[段階] で決まり、中間の色は生まれない)
import type { PartName, PartUV } from '../editor/skin/uv';
import type { SkinLayout } from '../editor/skin/layout';

export type Part = PartName;
export type Layer = 'base' | 'over'; // 素の層 / 上着(外側)の層
export type FaceName = keyof PartUV;

export const PARTS: readonly Part[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
export const FACE_NAMES: readonly FaceName[] = ['right', 'front', 'left', 'back', 'top', 'bottom'];

// 素材。それぞれが5色のランプ(色の段階)を持つ
export type Mat = 'skin' | 'hair' | 'top' | 'inner' | 'bottom' | 'shoes' | 'accent' | 'eye' | 'white' | 'dark' | 'blush';
export const MATS: readonly Mat[] = ['skin', 'hair', 'top', 'inner', 'bottom', 'shoes', 'accent', 'eye', 'white', 'dark', 'blush'];

// 1ピクセルの塗り
//   tone: 基本の色からの段階の差 (-2〜+2。負は暗く、正は明るく)
//   flat: true なら、光や影の計算をしない (目やハイライトなど、そのままの色で見せたいもの)
export interface Paint { mat: Mat; tone: number; flat: boolean }
export const paint = (mat: Mat, tone = 0, flat = false): Paint => ({ mat, tone, flat });

// 展開図の1ピクセルが、どのパーツの・どの層の・どの面の・面の中のどこか
export interface Cell { part: Part; layer: Layer; face: FaceName; x: number; y: number; w: number; h: number }

export interface FaceView {
  readonly w: number;
  readonly h: number;
  get: (x: number, y: number) => Paint | null;
  set: (x: number, y: number, p: Paint) => void; // 面の外は無視する
  fill: (p: Paint) => void;
}

// 側面4枚(右→前→左→後)を、パーツに巻いた1本の「帯」として扱う
// Minecraftの展開図では側面がこの順に横並びなので、列番号をそのまま使える
export interface BandView {
  readonly width: number;
  readonly height: number;
  readonly rightWidth: number;
  readonly frontStart: number;
  readonly frontWidth: number;
  readonly leftStart: number;
  readonly backStart: number;
  readonly backWidth: number;
  get: (c: number, y: number) => Paint | null;
  set: (c: number, y: number, p: Paint) => void; // 列は巻き戻して扱う。行が外なら無視する
  wrap: (c: number) => number;
  // 左右対称の位置にある列 (正面の中心を軸に折り返す)
  mirror: (c: number) => number;
}

export class PaintBuffer {
  readonly pixels: (Paint | null)[] = new Array(64 * 64).fill(null);
  readonly cells: (Cell | null)[] = new Array(64 * 64).fill(null);
  // 素の層のピクセル → 同じ場所の上着の層のピクセル (無ければ -1)。上着が素の層に落とす影の計算に使う
  readonly twin = new Int16Array(64 * 64).fill(-1);

  readonly layout: SkinLayout;

  constructor(layout: SkinLayout) {
    this.layout = layout;
    for (const layer of ['base', 'over'] as const) {
      for (const part of PARTS) {
        for (const face of FACE_NAMES) {
          const r = this.uv(layer)[part][face];
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) this.cells[(r.v + y) * 64 + r.u + x] = { part, layer, face, x, y, w: r.w, h: r.h };
          }
          if (layer === 'base') {
            const o = this.layout.uvOver[part][face];
            for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) this.twin[(r.v + y) * 64 + r.u + x] = (o.v + y) * 64 + o.u + x;
          }
        }
      }
    }
  }

  private uv(layer: Layer) { return layer === 'base' ? this.layout.uv : this.layout.uvOver; }

  face(part: Part, layer: Layer, name: FaceName): FaceView {
    const r = this.uv(layer)[part][name];
    const index = (x: number, y: number) => (x < 0 || x >= r.w || y < 0 || y >= r.h ? -1 : (r.v + y) * 64 + r.u + x);
    const set = (x: number, y: number, p: Paint) => { const i = index(x, y); if (i >= 0) this.pixels[i] = p; };
    return {
      w: r.w, h: r.h,
      get: (x, y) => { const i = index(x, y); return i < 0 ? null : this.pixels[i]; },
      set,
      fill: p => { for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) set(x, y, p); },
    };
  }

  band(part: Part, layer: Layer): BandView {
    const uv = this.uv(layer)[part];
    const width = uv.right.w + uv.front.w + uv.left.w + uv.back.w;
    const height = uv.front.h;
    const wrap = (c: number) => ((c % width) + width) % width;
    return {
      width, height,
      rightWidth: uv.right.w,
      frontStart: uv.right.w,
      frontWidth: uv.front.w,
      leftStart: uv.right.w + uv.front.w,
      backStart: width - uv.back.w,
      backWidth: uv.back.w,
      get: (c, y) => (y < 0 || y >= height ? null : this.pixels[(uv.right.v + y) * 64 + uv.right.u + wrap(c)]),
      set: (c, y, p) => { if (y >= 0 && y < height) this.pixels[(uv.right.v + y) * 64 + uv.right.u + wrap(c)] = p; },
      wrap,
      mirror: c => wrap(2 * uv.right.w + uv.front.w - 1 - c),
    };
  }
}
