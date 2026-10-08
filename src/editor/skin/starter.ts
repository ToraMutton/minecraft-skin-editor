// 初めて起動したときと「新規」で出てくる素体スキン
// 何も描いていないと3Dモデルが真っ黒に見えて、どこから描けばいいか分からないので、
// 肌・髪・目・シャツ・ズボン・靴だけの、シンプルな人型を下地として置いておく
import type { UVFace, PartName } from './uv';
import type { SkinLayout } from './layout';
import { PIXEL_COUNT, SKIN_SIZE } from '../canvas/layers';
import type { Pixels } from '../canvas/layers';

const SKIN = [232, 185, 143];
const SKIN_SHADE = [211, 159, 116];
const HAIR = [90, 58, 34];
const HAIR_LIGHT = [122, 82, 51];
const SHIRT = [60, 133, 39]; // UIの緑と同じ
const SHIRT_SHADE = [45, 100, 30];
const PANTS = [58, 74, 130];
const PANTS_SHADE = [44, 57, 100];
const SHOES = [80, 80, 86];
const EYE_WHITE = [255, 255, 255];
const EYE_IRIS = [47, 95, 208];
const MOUTH = [176, 122, 85];

type Color = number[];

export function createStarterPixels(layout: SkinLayout): Pixels {
  const SKIN_UV = layout.uv; // 腕の太さなど、モデルによる違いは展開図に入っている
  const pixels: Pixels = new Uint8ClampedArray(PIXEL_COUNT * 4);

  const set = (x: number, y: number, c: Color) => {
    pixels.set([c[0], c[1], c[2], 255], (y * SKIN_SIZE + x) * 4);
  };
  // 面(UVの長方形)の中の (x, y) に置く
  const at = (face: UVFace) => (x: number, y: number, c: Color) => set(face.u + x, face.v + y, c);
  const fill = (face: UVFace, c: Color, rows?: [number, number]) => {
    const [from, to] = rows ?? [0, face.h];
    for (let y = from; y < to; y++) for (let x = 0; x < face.w; x++) set(face.u + x, face.v + y, c);
  };
  // 4つの側面(右・前・左・後)を1本の帯として塗る。rows は上から数えた行の範囲
  const sides = (part: PartName, c: Color, rows: [number, number]) => {
    const uv = SKIN_UV[part];
    for (const f of [uv.right, uv.front, uv.left, uv.back]) fill(f, c, rows);
  };

  // --- 全身をまず肌色で塗る ---
  for (const uv of Object.values(SKIN_UV)) for (const f of Object.values(uv)) fill(f, SKIN);

  // --- 頭: 上の2行が髪 ---
  const head = SKIN_UV.head;
  sides('head', HAIR, [0, 2]);
  fill(head.top, HAIR);
  fill(head.bottom, SKIN_SHADE);
  for (const x of [1, 5]) at(head.front)(x, 1, HAIR_LIGHT); // 前髪にツヤ
  // 横は上3行が髪。後ろ寄りの2列は、後頭部とつながるように全部髪にする
  for (const f of [head.right, head.left]) fill(f, HAIR, [0, 3]);
  for (const f of [head.right, head.left]) {
    const backEdge = f === head.right ? [0, 1] : [6, 7]; // 右側面は左端、左側面は右端が後ろ側
    for (const x of backEdge) for (let y = 0; y < f.h; y++) at(f)(x, y, HAIR);
  }
  fill(head.back, HAIR); // 後頭部は全部髪 (無地。模様を入れるとかえって不自然になる)

  // 顔 (正面): 目と口
  const face = at(head.front);
  face(1, 4, EYE_WHITE); face(2, 4, EYE_IRIS);
  face(5, 4, EYE_IRIS); face(6, 4, EYE_WHITE);
  face(3, 6, MOUTH); face(4, 6, MOUTH);
  for (let x = 0; x < 8; x++) face(x, 7, SKIN_SHADE); // あごの影

  // --- 胴体: 上から10行がシャツ、下の2行がズボン ---
  const body = SKIN_UV.body;
  sides('body', SHIRT, [0, 10]);
  sides('body', PANTS, [10, 12]);
  fill(body.top, SHIRT);
  fill(body.bottom, PANTS);
  for (let x = 0; x < 8; x++) { at(body.front)(x, 9, SHIRT_SHADE); at(body.back)(x, 9, SHIRT_SHADE); } // すそ
  at(body.front)(3, 0, SKIN); at(body.front)(4, 0, SKIN); // 首元

  // --- 腕: 上の4行が半袖、その下は素肌 ---
  for (const arm of [SKIN_UV.rightArm, SKIN_UV.leftArm]) {
    for (const f of [arm.right, arm.front, arm.left, arm.back]) {
      fill(f, SHIRT, [0, 4]);
      for (let x = 0; x < f.w; x++) set(f.u + x, f.v + 3, SHIRT_SHADE); // 袖口
    }
    fill(arm.top, SHIRT);
    fill(arm.bottom, SKIN_SHADE);
  }

  // --- 脚: 上の9行がズボン、下の3行が靴 ---
  for (const leg of [SKIN_UV.rightLeg, SKIN_UV.leftLeg]) {
    for (const f of [leg.right, leg.front, leg.left, leg.back]) {
      fill(f, PANTS, [0, 9]);
      fill(f, PANTS_SHADE, [8, 9]);
      fill(f, SHOES, [9, 12]);
    }
    fill(leg.top, PANTS);
    fill(leg.bottom, SHOES);
  }

  return pixels;
}
