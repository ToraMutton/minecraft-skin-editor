// 体: 全パーツの素の層を、まず肌の色で塗る (服や髪は、この上に塗る)
import { PARTS, FACE_NAMES, paint } from '../buffer';
import type { PaintContext } from './util';

export function paintBody({ buf }: PaintContext) {
  const skin = paint('skin');
  for (const part of PARTS) for (const name of FACE_NAMES) buf.face(part, 'base', name).fill(skin);
}
