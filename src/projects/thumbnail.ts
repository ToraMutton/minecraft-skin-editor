// 一覧に出す、正面から見たキャラクターの小さな絵 (16×32)
// 64×64 の展開図のままだと何の絵か分からないので、頭・胴・腕・脚の「正面」の面だけを人の形に並べる。
// 保存はせず、表示のたびに3層から作る (保存すると、絵とずれる原因が増えるため)
import type { PartName, UVFace } from '../editor/skin/uv';
import type { SkinLayout } from '../editor/skin/layout';
import { composite, SKIN_SIZE } from '../editor/canvas/layers';
import type { SkinLayers } from '../editor/canvas/layers';

export const THUMB_WIDTH = 16;
export const THUMB_HEIGHT = 32;

// 各パーツの正面が、サムネイルのどこに来るか (左上の x, y)。右腕・右足は、画面では左側にある
// 腕は胴体(x=4〜11)の横にぴったり付ける。右腕は幅のぶんだけ左にずれる (Classic は x=0、Slim は x=1)
function placement(layout: SkinLayout): Record<PartName, [number, number]> {
  const armWidth = layout.uv.rightArm.front.w;
  return { head: [4, 0], body: [4, 8], rightArm: [4 - armWidth, 8], leftArm: [12, 8], rightLeg: [4, 20], leftLeg: [8, 20] };
}

// 3層を重ねた見た目から、正面のサムネイル (RGBA) を作る。上着の層は、素の層の上に重ねる
export function frontThumbnail(layers: SkinLayers, layout: SkinLayout): Uint8ClampedArray {
  const skin = composite(layers);
  const out = new Uint8ClampedArray(THUMB_WIDTH * THUMB_HEIGHT * 4);

  const draw = (face: UVFace, dx: number, dy: number, over: boolean) => {
    for (let y = 0; y < face.h; y++) {
      for (let x = 0; x < face.w; x++) {
        const s = ((face.v + y) * SKIN_SIZE + face.u + x) * 4;
        const o = ((dy + y) * THUMB_WIDTH + dx + x) * 4;
        const a = skin[s + 3] / 255;
        if (a === 0) continue; // 透明な所は、下の層をそのまま見せる
        if (!over || a === 1) { out.set(skin.subarray(s, s + 4), o); continue; }
        // 半透明の上着は、下の色と混ぜる
        const below = out[o + 3] / 255;
        const alpha = a + below * (1 - a);
        for (let c = 0; c < 3; c++) out[o + c] = (skin[s + c] * a + out[o + c] * below * (1 - a)) / alpha;
        out[o + 3] = alpha * 255;
      }
    }
  };

  const positions = placement(layout);
  for (const over of [false, true]) {
    const table = over ? layout.uvOver : layout.uv;
    for (const [part, [x, y]] of Object.entries(positions) as [PartName, [number, number]][]) draw(table[part].front, x, y, over);
  }
  return out;
}
