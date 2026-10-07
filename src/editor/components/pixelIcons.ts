// ドット絵アイコンの絵のデータ (1文字=1マス。'.' は透明。描き方は PixelIcon.tsx)
// 12×12 で描く。8×8 だと、「!」のような細い形がつぶれて読めなかったため

// 緑のチェックマーク: 保存済み
export const CHECK_ICON = {
  rows: [
    '............',
    '..........gg',
    '.........ggG',
    '........ggG.',
    '.......ggG..',
    'gg....ggG...',
    'ggg..ggG....',
    '.gggggG.....',
    '..ggggG.....',
    '...gGG......',
    '....G.......',
    '............',
  ],
  palette: { g: '#6fd04b', G: '#3f9a2a' },
};

// フロッピーディスク: 保存中
export const FLOPPY_ICON = {
  rows: [
    'kkkkkkkkkkk.',
    'kbbwwwwwbbkk',
    'kbbwkkkwbbbk',
    'kbbwkkkwbbbk',
    'kbbwwwwwbbbk',
    'kbbbbbbbbbbk',
    'kbbwwwwwwbbk',
    'kbwwwwwwwwbk',
    'kbwwwwwwwwbk',
    'kbwwwwwwwwbk',
    'kbbbbbbbbbbk',
    'kkkkkkkkkkkk',
  ],
  palette: { k: '#14141a', b: '#6fa0f0', w: '#f0f2f6' },
};

// 赤い三角に「!」: 保存失敗
export const WARNING_ICON = {
  rows: [
    '.....rr.....',
    '....rrrr....',
    '....rwwr....',
    '...rrwwrr...',
    '...rrwwrr...',
    '..rrrwwrrr..',
    '..rrrwwrrr..',
    '.rrrrrrrrrr.',
    '.rrrrwwrrrr.',
    'rrrrrwwrrrrr',
    'rrrrrrrrrrrr',
    'rrrrrrrrrrrr',
  ],
  palette: { r: '#ff5a5a', w: '#ffffff' },
};
