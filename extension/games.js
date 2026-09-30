import { GAME_NAMES, MINE_LEVELS, SHAPES, normalizeGames, new2048, move2048, undo2048, canMove2048,
  newMines, revealMine, flagMine, adjacentMines, newBlocks, moveBlocks, rotateBlocks, stepBlocks, dropBlocks, ghostPiece } from './games-core.js';

const emblems = {
  puzzle2048: '<span aria-hidden="true" class="game-emblem game-emblem--2048">2048</span>',
  mines: '<span aria-hidden="true" class="game-emblem game-emblem--mines"><svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M16 3v26M3 16h26M7 7l18 18M7 25 25 7"/><circle cx="16" cy="16" r="8" fill="currentColor"/></g><circle cx="13" cy="13" r="2" fill="#fff"/></svg></span>',
  blocks: '<span aria-hidden="true" class="game-emblem game-emblem--blocks"><i></i><i></i><i></i><i></i></span>'
};
export function gamesCardMarkup(id) {
  return '<div class="widget-body games-card-links">' + Object.entries(GAME_NAMES).map(([game, name]) =>
    '<button type="button" data-action="open-games" data-game="' + game + '" data-id="' + id + '">' + emblems[game] + '<span>' + name + '</span></button>').join('') + '</div>';
}
const timeText = seconds => Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
const control = (action, text, label = text) => '<button type="button" class="button" data-play="' + action + '" aria-label="' + label + '">' + text + '</button>';
const stat = (id, label) => '<div class="game-stat"><span>' + label + '</span><strong data-stat="' + id + '">0</strong></div>';

export function mountGames(root, raw, initialGame, onSave) {
  const data = normalizeGames(raw);
  let selected = Object.hasOwn(GAME_NAMES, initialGame) ? initialGame : data.selected;
  let paused = true, flagMode = false, mineFocus = 0, dirty = false, closed = false;
  let lastTick = performance.now(), gravity = 0, mineMilliseconds = 0, lastSaved = 0;
  const abort = new AbortController(), options = { signal: abort.signal };
  const $ = selector => root.querySelector(selector);
  root.className = 'game-room';
  root.innerHTML = '<div class="game-switch" role="group" aria-label="选择游戏">' + Object.entries(GAME_NAMES).map(([game, name]) =>
    '<button type="button" data-select-game="' + game + '">' + emblems[game] + '<span>' + name + '</span></button>').join('') +
    '</div><div class="game-panel"></div><div class="game-save-note">进度与纪录自动保存在本机 · 随栖点备份迁移</div>';
  function flush() {
    if (!dirty) return;
    dirty = false; lastSaved = performance.now(); onSave(structuredClone(data));
  }
  function changed() { dirty = true; }
  function focusBoard() { (selected === 'mines' ? $('[data-cell="' + mineFocus + '"]') : $('.play-surface'))?.focus({ preventScroll: true }); }
  function writeStat(name, text) { const element = $('[data-stat="' + name + '"]'); if (element) element.textContent = text; }
  function status(text) { if ($('.game-status').textContent !== text) $('.game-status').textContent = text; }
  function newCurrentGame(level) {
    data[selected] = selected === 'puzzle2048' ? new2048() : selected === 'mines' ? newMines(level || data.mines?.level) : newBlocks();
    paused = selected === 'blocks'; mineFocus = 0; gravity = 0; mineMilliseconds = 0; changed();
  }
  function selectGame(game, focus = true) {
    flush(); selected = game; data.selected = game; paused = true; gravity = 0; mineMilliseconds = 0;
    if (!data[game]) newCurrentGame();
    if (game === 'mines' && data.mines.status === 'ready') paused = false;
    changed();
    root.querySelectorAll('[data-select-game]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.selectGame === selected)));
    buildPanel(); render(); if (focus) focusBoard();
  }
  function buildPanel() {
    const common = '<div class="game-restart-confirm" hidden><span>重新开始会清除这一局的进度，保留最佳纪录。</span>' +
      control('confirm-new', '重新开始') + control('cancel-new', '取消') + '</div>';
    let board, side;
    if (selected === 'puzzle2048') {
      board = '<div class="play-surface board-2048" tabindex="0" role="group" aria-label="2048 棋盘" aria-describedby="gameHelp">' + '<span class="tile-2048"></span>'.repeat(16) + '</div>';
      side = '<div class="game-stats">' + stat('score', '本局得分') + stat('best', '最高纪录') + '</div>' +
        '<p id="gameHelp" class="game-help">用方向键或下方按钮移动，相同数字合并。达到 2048 后可以继续挑战。</p>' +
        '<div class="game-directions">' + control('up', '↑', '向上移动') + control('left', '←', '向左移动') + control('down', '↓', '向下移动') + control('right', '→', '向右移动') + '</div>' +
        '<div class="game-actions">' + control('undo', '撤销一步') + control('new', '新的一局') + '</div>';
    } else if (selected === 'mines') {
      const game = data.mines;
      board = '<div class="mine-stage"><div class="play-surface mine-board" role="group" aria-label="扫雷棋盘" aria-describedby="gameHelp" style="--mine-cols:' + game.cols + '">' +
        game.revealed.map((_, index) => '<button type="button" data-cell="' + index + '" tabindex="' + (index === mineFocus ? 0 : -1) + '"></button>').join('') +
        '</div><div class="game-pause-cover" hidden>' + control('pause', '继续扫雷') + '</div></div>';
      side = '<div class="game-stats">' + stat('remaining', '未标记雷数') + stat('time', '本局用时') + stat('best', '最快通关') + '</div>' +
        '<label class="game-level-label" for="mineLevel">难度</label><select id="mineLevel" class="game-level">' + Object.entries(MINE_LEVELS).map(([level, spec]) =>
          '<option value="' + level + '"' + (level === game.level ? ' selected' : '') + '>' + spec[3] + ' · ' + spec[0] + '×' + spec[1] + ' / ' + spec[2] + ' 雷</option>').join('') + '</select>' +
        '<p id="gameHelp" class="game-help">首次点击及周围格子安全。左键挖开，右键插旗；也可开启插旗模式。方向键选格，Enter 操作，F 插旗。</p>' +
        '<div class="game-actions">' + control('flag', '插旗模式') + control('pause', '暂停') + control('new', '新的一局') + '</div>';
    } else {
      board = '<div class="blocks-stage"><div class="play-surface blocks-board" tabindex="0" role="group" aria-label="落块消除棋盘" aria-describedby="gameHelp">' +
        '<span></span>'.repeat(200) + '</div><div class="game-pause-cover">' + control('pause', '开始 / 继续') + '</div></div>';
      side = '<div class="game-stats">' + stat('score', '本局得分') + stat('best', '最高纪录') + stat('lines', '已消除行') + stat('level', '等级') + '</div>' +
        '<div class="blocks-next-label">下一个</div><div class="blocks-next" aria-label="下一个方块">' + '<span></span>'.repeat(16) + '</div>' +
        '<p id="gameHelp" class="game-help">← → 移动 · ↑ 旋转 · ↓ 加速<br>空格落到底 · P 暂停<br>离开窗口自动暂停。</p>' +
        '<div class="game-directions">' + control('rotate', '↻', '旋转方块') + control('left', '←', '左移方块') + control('down', '↓', '加速下落') + control('right', '→', '右移方块') + '</div>' +
        '<div class="game-actions">' + control('drop', '落到底') + control('pause', '开始 / 继续') + control('new', '新的一局') + '</div>';
    }
    $('.game-panel').innerHTML = '<div class="game-status" role="status" aria-live="polite"></div>' + common +
      '<div class="game-layout game-layout--' + selected + '"><div class="game-board-wrap">' + board + '</div><aside class="game-controls">' + side + '</aside></div>';
  }
  function render() {
    if (closed) return;
    const game = data[selected];
    if (selected === 'puzzle2048') {
      data.best2048 = Math.max(data.best2048, game.score);
      $('.board-2048').querySelectorAll('span').forEach((cell, index) => {
        const value = game.board[index]; cell.textContent = value || ''; cell.dataset.power = value ? Math.min(12, Math.log2(value)) : 0;
      });
      $('.board-2048').setAttribute('aria-label', '2048 棋盘：' + Array.from({ length: 4 }, (_, row) => game.board.slice(row * 4, row * 4 + 4).map(value => value || '空').join('、')).join('；'));
      writeStat('score', game.score); writeStat('best', data.best2048);
      $('[data-play="undo"]').disabled = !game.previous;
      status(!canMove2048(game.board) ? '没有可移动的格子了，可以撤销一步或开始新的一局。' : game.board.some(value => value >= 2048) ? '已合成 2048！继续挑战更大的数字。' : '合并数字，慢慢接近 2048。');
    } else if (selected === 'mines') {
      $('.mine-board').querySelectorAll('button').forEach((cell, index) => {
        const revealed = game.revealed[index], mine = game.mines.includes(index), end = ['won','lost'].includes(game.status);
        const count = revealed && !mine ? adjacentMines(game, index) : 0;
        cell.className = (revealed ? 'revealed ' : '') + (end && mine ? 'is-mine ' : '') + (game.flags[index] ? 'flagged' : '');
        cell.dataset.number = count;
        cell.textContent = end && mine ? '✹' : game.flags[index] ? '⚑' : revealed && count ? count : '';
        cell.setAttribute('aria-label', (Math.floor(index / game.cols) + 1) + '行' + (index % game.cols + 1) + '列，' +
          (end && mine ? '地雷' : game.flags[index] ? '已插旗' : revealed ? count ? '附近 ' + count + ' 个雷' : '空白' : '未打开'));
      });
      writeStat('remaining', game.count - game.flags.filter(Boolean).length); writeStat('time', timeText(game.elapsed));
      if (game.status === 'won' && (data.minesBest[game.level] === undefined || game.elapsed < data.minesBest[game.level])) {
        data.minesBest[game.level] = game.elapsed; changed();
      }
      writeStat('best', data.minesBest[game.level] === undefined ? '—' : timeText(data.minesBest[game.level]));
      $('[data-play="flag"]').setAttribute('aria-pressed', String(flagMode));
      $('.game-pause-cover').hidden = !paused || game.status !== 'playing';
      $('.game-actions [data-play="pause"]').textContent = paused ? '继续' : '暂停';
      $('.game-actions [data-play="pause"]').setAttribute('aria-label', paused ? '继续' : '暂停');
      $('.game-actions [data-play="pause"]').disabled = game.status !== 'playing';
      status(game.status === 'won' ? '全部安全格已打开，通关成功！' : game.status === 'lost' ? '碰到地雷了，再试一局吧。' : paused && game.status === 'playing' ? '已暂停，点击继续。' : flagMode ? '插旗模式：点击格子标记或取消旗帜。' : '找到地雷，打开所有安全格。');
    } else {
      data.bestBlocks = Math.max(data.bestBlocks, game.score);
      const display = game.board.slice(), ghosts = new Set();
      function paint(piece, ghost = false) {
        piece.shape.forEach((row, y) => row.forEach((value, x) => {
          const index = (piece.y + y) * 10 + piece.x + x;
          if (value && piece.y + y >= 0 && piece.y + y < 20 && piece.x + x >= 0 && piece.x + x < 10) {
            if (ghost) ghosts.add(index); else display[index] = value;
          }
        }));
      }
      if (game.status === 'playing') { paint(ghostPiece(game), true); paint(game.piece); }
      $('.blocks-board').querySelectorAll('span').forEach((cell, index) => { cell.dataset.color = display[index]; cell.className = !display[index] && ghosts.has(index) ? 'ghost-block' : ''; });
      const shape = SHAPES[game.next];
      $('.blocks-next').querySelectorAll('span').forEach((cell, index) => { cell.dataset.color = shape[Math.floor(index / 4)]?.[index % 4] || 0; });
      writeStat('score', game.score); writeStat('best', data.bestBlocks); writeStat('lines', game.lines); writeStat('level', Math.floor(game.lines / 10) + 1);
      $('.game-pause-cover').hidden = !paused || game.status === 'over';
      $('.game-actions [data-play="pause"]').textContent = paused ? '开始 / 继续' : '暂停';
      $('.game-actions [data-play="pause"]').setAttribute('aria-label', paused ? '开始 / 继续' : '暂停');
      root.querySelectorAll('[data-play="pause"]').forEach(button => { button.disabled = game.status === 'over'; });
      status(game.status === 'over' ? '方块到顶了。本局 ' + game.score + ' 分，可以开始新的一局。' : paused ? '已暂停，点击“开始 / 继续”。' : '填满一行即可消除，虚线显示落点。');
    }
  }
  function pause() {
    const running = selected === 'blocks' && data.blocks.status === 'playing' || selected === 'mines' && data.mines.status === 'playing';
    if (running && !paused) { paused = true; gravity = 0; render(); }
    flush();
  }
  function play(action) {
    const game = data[selected];
    if (action === 'new') { pause(); $('.game-restart-confirm').hidden = false; $('[data-play="confirm-new"]').focus(); return; }
    if (action === 'cancel-new') { $('.game-restart-confirm').hidden = true; if (selected === 'mines') $('#mineLevel').value = game.level; focusBoard(); return; }
    if (action === 'confirm-new') { const level = selected === 'mines' ? $('#mineLevel').value : ''; newCurrentGame(level); buildPanel(); render(); flush(); focusBoard(); return; }
    if (action === 'pause') { if (game.status === 'over' || selected === 'mines' && game.status !== 'playing') return; paused = !paused; gravity = 0; lastTick = performance.now(); render(); flush(); focusBoard(); return; }
    if (selected === 'puzzle2048') {
      if (action === 'undo' ? undo2048(game) : move2048(game, action)) changed();
    } else if (selected === 'mines') {
      if (action === 'flag') flagMode = !flagMode;
    } else if (!paused && game.status === 'playing') {
      const moved = action === 'left' ? moveBlocks(game, -1) : action === 'right' ? moveBlocks(game, 1) : action === 'rotate' ? rotateBlocks(game) :
        action === 'down' ? stepBlocks(game, true) : action === 'drop' ? dropBlocks(game) : false;
      if (moved) changed(); if (action === 'drop') gravity = 0;
    }
    render(); focusBoard();
  }
  root.addEventListener('click', event => {
    const select = event.target.closest('[data-select-game]');
    if (select) { selectGame(select.dataset.selectGame); return; }
    const button = event.target.closest('[data-play]');
    if (button) { play(button.dataset.play); return; }
    const cell = event.target.closest('[data-cell]');
    if (cell && !paused) { if (flagMode ? flagMine(data.mines, Number(cell.dataset.cell)) : revealMine(data.mines, Number(cell.dataset.cell))) changed(); render(); }
  }, options);
  root.addEventListener('change', event => { if (event.target.id === 'mineLevel') play('new'); }, options);
  root.addEventListener('contextmenu', event => {
    const cell = event.target.closest('[data-cell]');
    if (!cell) return;
    event.preventDefault(); event.stopPropagation();
    if (!paused && flagMine(data.mines, Number(cell.dataset.cell))) { changed(); render(); }
  }, options);
  root.addEventListener('focusin', event => {
    const cell = event.target.closest('[data-cell]');
    if (!cell) return;
    $('[data-cell="' + mineFocus + '"]').tabIndex = -1;
    mineFocus = Number(cell.dataset.cell); cell.tabIndex = 0;
  }, options);
  root.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !event.target.closest('.play-surface')) return;
    const key = event.key, directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (selected === 'mines') {
      const game = data.mines;
      if (directions[key]) {
        event.preventDefault();
        const row = Math.floor(mineFocus / game.cols), col = mineFocus % game.cols;
        const next = key === 'ArrowLeft' ? row * game.cols + Math.max(0, col - 1) : key === 'ArrowRight' ? row * game.cols + Math.min(game.cols - 1, col + 1) :
          key === 'ArrowUp' ? Math.max(0, row - 1) * game.cols + col : Math.min(game.rows - 1, row + 1) * game.cols + col;
        $('[data-cell="' + next + '"]').focus();
      } else if (key.toLowerCase() === 'f') {
        event.preventDefault(); if (!paused && flagMine(game, mineFocus)) { changed(); render(); }
      }
      return;
    }
    const action = selected === 'puzzle2048' ? directions[key] : key === 'ArrowUp' ? 'rotate' : directions[key] || (key === ' ' ? 'drop' : key.toLowerCase() === 'p' ? 'pause' : '');
    if (action) { event.preventDefault(); event.stopPropagation(); if (event.repeat && ['drop','pause'].includes(action)) return; play(action); }
  }, options);
  let touchStart = null;
  root.addEventListener('pointerdown', event => {
    if (selected === 'puzzle2048' && event.pointerType !== 'mouse' && event.target.closest('.board-2048')) touchStart = [event.clientX, event.clientY];
  }, options);
  root.addEventListener('pointerup', event => {
    if (!touchStart || selected !== 'puzzle2048') return;
    const dx = event.clientX - touchStart[0], dy = event.clientY - touchStart[1]; touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 25) play(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
  }, options);
  window.addEventListener('blur', pause, options);
  window.addEventListener('pagehide', flush, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, options);
  const timer = setInterval(() => {
    const now = performance.now(), elapsed = Math.min(1000, now - lastTick); lastTick = now;
    if (!paused && !document.hidden) {
      if (selected === 'blocks' && data.blocks.status === 'playing') {
        gravity += elapsed;
        const interval = Math.max(100, 850 - Math.floor(data.blocks.lines / 10) * 65);
        if (gravity >= interval) { gravity = 0; stepBlocks(data.blocks); changed(); render(); }
      } else if (selected === 'mines' && data.mines.status === 'playing') {
        mineMilliseconds += elapsed;
        if (mineMilliseconds >= 1000) { data.mines.elapsed = Math.min(359999, data.mines.elapsed + Math.floor(mineMilliseconds / 1000)); mineMilliseconds %= 1000; changed(); writeStat('time', timeText(data.mines.elapsed)); }
      }
    }
    if (dirty && now - lastSaved >= 1000) flush();
  }, 100);
  selectGame(selected);
  return () => { if (closed) return; clearInterval(timer); abort.abort(); flush(); closed = true; };
}
