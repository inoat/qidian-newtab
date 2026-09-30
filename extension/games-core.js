// Pure local game rules. State is JSON so saved games travel with workspace backups.
export const GAME_NAMES = { puzzle2048: '2048', mines: '扫雷', blocks: '落块消除' };
export const MINE_LEVELS = { easy: [9, 9, 10, '简单'], medium: [12, 12, 22, '标准'], hard: [16, 16, 40, '挑战'] };
const clone = value => structuredClone(value);
const integer = (value, max = 1e9) => Number.isInteger(value) && value >= 0 && value <= max;
const cells = (value, length, valid) => Array.isArray(value) && value.length === length && value.every(valid);
const tile = value => integer(value, 2 ** 30) && (value === 0 || value >= 2 && Number.isInteger(Math.log2(value)));
const randomIndex = (length, random) => Math.min(length - 1, Math.floor(random() * length));

export function add2048Tile(board, random = Math.random) {
  const free = board.map((value, index) => value === 0 ? index : -1).filter(index => index >= 0);
  if (free.length) board[free[randomIndex(free.length, random)]] = random() < .9 ? 2 : 4;
}
export function new2048(random = Math.random) {
  const game = { board: Array(16).fill(0), score: 0, previous: null };
  add2048Tile(game.board, random); add2048Tile(game.board, random);
  return game;
}
export function canMove2048(board) {
  return board.some((value, index) => value === 0 || index % 4 < 3 && value === board[index + 1] || index < 12 && value === board[index + 4]);
}
export function move2048(game, direction, random = Math.random) {
  if (!['left', 'right', 'up', 'down'].includes(direction)) return false;
  const next = Array(16).fill(0);
  let points = 0;
  for (let row = 0; row < 4; row++) {
    const indexes = Array.from({ length: 4 }, (_, col) => direction === 'left' ? row * 4 + col :
      direction === 'right' ? row * 4 + 3 - col : direction === 'up' ? col * 4 + row : (3 - col) * 4 + row);
    const values = indexes.map(index => game.board[index]).filter(Boolean), merged = [];
    for (let index = 0; index < values.length; index++) {
      if (values[index] === values[index + 1]) { merged.push(values[index] * 2); points += values[index] * 2; index++; }
      else merged.push(values[index]);
    }
    indexes.forEach((index, col) => { next[index] = merged[col] || 0; });
  }
  if (next.every((value, index) => value === game.board[index])) return false;
  game.previous = { board: game.board.slice(), score: game.score };
  game.board = next; game.score += points; add2048Tile(game.board, random);
  return true;
}
export function undo2048(game) {
  if (!game.previous) return false;
  game.board = game.previous.board.slice(); game.score = game.previous.score; game.previous = null;
  return true;
}

export function newMines(level = 'easy') {
  if (!Object.hasOwn(MINE_LEVELS, level)) level = 'easy';
  const [rows, cols, count] = MINE_LEVELS[level];
  return { level, rows, cols, count, mines: [], revealed: Array(rows * cols).fill(false), flags: Array(rows * cols).fill(false), status: 'ready', elapsed: 0 };
}
export function neighbors(game, index) {
  const result = [], row = Math.floor(index / game.cols), col = index % game.cols;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if ((dr || dc) && row + dr >= 0 && row + dr < game.rows && col + dc >= 0 && col + dc < game.cols)
      result.push((row + dr) * game.cols + col + dc);
  }
  return result;
}
export function adjacentMines(game, index) { return neighbors(game, index).filter(cell => game.mines.includes(cell)).length; }
function placeMines(game, first, random) {
  const safe = new Set([first, ...neighbors(game, first)]);
  const available = Array.from({ length: game.rows * game.cols }, (_, index) => index).filter(index => !safe.has(index));
  for (let index = available.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1, random);
    [available[index], available[other]] = [available[other], available[index]];
  }
  game.mines = available.slice(0, game.count); game.status = 'playing';
}
export function flagMine(game, index) {
  if (!integer(index, game.rows * game.cols - 1) || ['won', 'lost'].includes(game.status) || game.revealed[index]) return false;
  game.flags[index] = !game.flags[index]; return true;
}
export function revealMine(game, index, random = Math.random) {
  if (!integer(index, game.rows * game.cols - 1) || ['won', 'lost'].includes(game.status) || game.flags[index]) return false;
  if (game.status === 'ready') placeMines(game, index, random);
  let queue = [index];
  if (game.revealed[index]) {
    const around = neighbors(game, index);
    if (!adjacentMines(game, index) || around.filter(cell => game.flags[cell]).length !== adjacentMines(game, index)) return false;
    queue = around.filter(cell => !game.revealed[cell] && !game.flags[cell]);
    if (!queue.length) return false;
  }
  while (queue.length) {
    const cell = queue.pop();
    if (game.flags[cell] || game.revealed[cell]) continue;
    game.revealed[cell] = true;
    if (game.mines.includes(cell)) { game.status = 'lost'; return true; }
    if (adjacentMines(game, cell) === 0) queue.push(...neighbors(game, cell).filter(other => !game.revealed[other]));
  }
  if (game.revealed.filter(Boolean).length === game.rows * game.cols - game.count) game.status = 'won';
  return true;
}

export const SHAPES = [
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  [[2,2],[2,2]],
  [[0,3,0],[3,3,3],[0,0,0]],
  [[0,4,4],[4,4,0],[0,0,0]],
  [[5,5,0],[0,5,5],[0,0,0]],
  [[6,0,0],[6,6,6],[0,0,0]],
  [[0,0,7],[7,7,7],[0,0,0]]
];
export function rotateShape(shape) { return shape[0].map((_, col) => shape.map(row => row[col]).reverse()); }
function takePiece(game, random) {
  if (!game.bag.length) {
    game.bag = [0,1,2,3,4,5,6];
    for (let i = 6; i > 0; i--) {
      const other = randomIndex(i + 1, random);
      [game.bag[i], game.bag[other]] = [game.bag[other], game.bag[i]];
    }
  }
  return game.bag.pop();
}
export function collides(game, piece = game.piece) {
  return piece.shape.some((row, y) => row.some((value, x) => value &&
    (piece.x + x < 0 || piece.x + x >= 10 || piece.y + y >= 20 || piece.y + y >= 0 && game.board[(piece.y + y) * 10 + piece.x + x])));
}
function spawnPiece(game, random) {
  const type = game.next;
  game.piece = { shape: clone(SHAPES[type]), x: Math.floor((10 - SHAPES[type][0].length) / 2), y: 0 };
  game.next = takePiece(game, random);
  if (collides(game)) game.status = 'over';
}
export function newBlocks(random = Math.random) {
  const game = { board: Array(200).fill(0), bag: [], next: 0, piece: null, score: 0, lines: 0, status: 'playing' };
  game.next = takePiece(game, random); spawnPiece(game, random); return game;
}
export function moveBlocks(game, dx) {
  if (game.status !== 'playing') return false;
  const piece = { ...game.piece, x: game.piece.x + dx };
  if (collides(game, piece)) return false;
  game.piece = piece; return true;
}
export function rotateBlocks(game) {
  if (game.status !== 'playing') return false;
  const shape = rotateShape(game.piece.shape);
  for (const dx of [0, -1, 1, -2, 2]) {
    const piece = { ...game.piece, shape, x: game.piece.x + dx };
    if (!collides(game, piece)) { game.piece = piece; return true; }
  }
  return false;
}
function lockBlocks(game, random) {
  let above = false;
  game.piece.shape.forEach((row, y) => row.forEach((value, x) => {
    if (!value) return;
    const cy = game.piece.y + y;
    if (cy < 0) above = true;
    else game.board[cy * 10 + game.piece.x + x] = value;
  }));
  if (above) { game.status = 'over'; return; }
  const rows = Array.from({ length: 20 }, (_, row) => game.board.slice(row * 10, row * 10 + 10));
  const kept = rows.filter(row => row.some(value => !value)), cleared = 20 - kept.length;
  game.score += [0,100,300,500,800][cleared] * (Math.floor(game.lines / 10) + 1);
  game.lines += cleared;
  game.board = [...Array(cleared * 10).fill(0), ...kept.flat()];
  spawnPiece(game, random);
}
export function stepBlocks(game, manual = false, random = Math.random) {
  if (game.status !== 'playing') return false;
  const piece = { ...game.piece, y: game.piece.y + 1 };
  if (collides(game, piece)) lockBlocks(game, random);
  else { game.piece = piece; if (manual) game.score++; }
  return true;
}
export function dropBlocks(game, random = Math.random) {
  if (game.status !== 'playing') return false;
  while (!collides(game, { ...game.piece, y: game.piece.y + 1 })) { game.piece.y++; game.score += 2; }
  lockBlocks(game, random); return true;
}
export function ghostPiece(game) {
  const piece = clone(game.piece);
  if (game.status === 'playing') while (!collides(game, { ...piece, y: piece.y + 1 })) piece.y++;
  return piece;
}

// Validate imported saves and discard damaged boards, preserving other games and records.
export function normalizeGames(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const result = { selected: Object.hasOwn(GAME_NAMES, raw.selected) ? raw.selected : 'puzzle2048',
    best2048: integer(raw.best2048) ? raw.best2048 : 0, bestBlocks: integer(raw.bestBlocks) ? raw.bestBlocks : 0,
    minesBest: {}, puzzle2048: null, mines: null, blocks: null };
  for (const level of Object.keys(MINE_LEVELS)) if (integer(raw.minesBest?.[level], 359999)) result.minesBest[level] = raw.minesBest[level];
  const p = raw.puzzle2048;
  if (p && cells(p.board, 16, tile) && integer(p.score)) {
    result.puzzle2048 = { board: [...p.board], score: p.score, previous: null };
    if (p.previous && cells(p.previous.board, 16, tile) && integer(p.previous.score)) result.puzzle2048.previous = { board: [...p.previous.board], score: p.previous.score };
    result.best2048 = Math.max(result.best2048, p.score);
  }
  const m = raw.mines;
  if (m && Object.hasOwn(MINE_LEVELS, m.level)) {
    const [rows, cols, count] = MINE_LEVELS[m.level], total = rows * cols;
    if (cells(m.revealed, total, value => typeof value === 'boolean') && cells(m.flags, total, value => typeof value === 'boolean') &&
        Array.isArray(m.mines) && new Set(m.mines).size === m.mines.length && m.mines.every(value => integer(value, total - 1)) &&
        (m.status === 'ready' && m.mines.length === 0 && !m.revealed.some(Boolean) || ['playing','won','lost'].includes(m.status) && m.mines.length === count)) {
      result.mines = { level: m.level, rows, cols, count, mines: [...m.mines], revealed: [...m.revealed], flags: [...m.flags],
        status: m.status, elapsed: integer(m.elapsed, 359999) ? m.elapsed : 0 };
    }
  }
  const b = raw.blocks;
  const validShape = b?.piece?.shape && SHAPES.some(shape => {
    for (let turn = 0; turn < 4; turn++) { if (JSON.stringify(shape) === JSON.stringify(b.piece.shape)) return true; shape = rotateShape(shape); }
    return false;
  });
  if (b && cells(b.board, 200, value => integer(value, 7)) && validShape && Number.isInteger(b.piece.x) && b.piece.x >= -3 && b.piece.x <= 9 &&
      integer(b.piece.y, 19) && integer(b.next, 6) && Array.isArray(b.bag) && b.bag.length <= 7 && new Set(b.bag).size === b.bag.length &&
      b.bag.every(value => integer(value, 6)) && integer(b.score) && integer(b.lines, 1e6) && ['playing','over'].includes(b.status)) {
    const safe = { board: [...b.board], bag: [...b.bag], next: b.next, piece: { x: b.piece.x, y: b.piece.y, shape: clone(b.piece.shape) }, score: b.score, lines: b.lines, status: b.status };
    if (safe.status === 'over' || !collides(safe)) result.blocks = safe;
    result.bestBlocks = Math.max(result.bestBlocks, b.score);
  }
  return result;
}
