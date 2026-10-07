// ドット絵のアイコン。文字列の絵(1文字=1マス)から SVG の四角を並べて作る
// 1マスずつ四角で描き、crispEdges で縁をにじませないので、どんな大きさでもくっきり見える

interface Props {
  // 各行が同じ長さの文字列。キーは palette の文字、'.' は透明
  rows: string[];
  palette: Record<string, string>;
  size?: number; // 表示の大きさ (px)
  title?: string;
}

export function PixelIcon({ rows, palette, size = 16, title }: Props) {
  const height = rows.length;
  const width = rows[0].length;
  const cells: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (color) cells.push(<rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={color} />);
    }
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`} width={size} height={(size * height) / width}
      shapeRendering="crispEdges" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
    >
      {cells}
    </svg>
  );
}
