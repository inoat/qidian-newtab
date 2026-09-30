import assert from 'node:assert/strict';
import { new2048, move2048, undo2048, canMove2048, newMines, revealMine, flagMine, neighbors, adjacentMines,
  newBlocks, moveBlocks, rotateBlocks, stepBlocks, dropBlocks, ghostPiece, collides, SHAPES, rotateShape, normalizeGames, MINE_LEVELS } from '../extension/games-core.js';
import { createDefaultState, normalizeState } from '../extension/storage.js';
import { createBackupDocument, readBackupDocument } from '../extension/backup-format.js';
const zero = () => 0;
const blank = () => Array(16).fill(0);
const p = { board: [2,2,2,2,...Array(12).fill(0)], score:0, previous:null };
assert.equal(move2048(p,'left',zero),true);
assert.deepEqual(p.board.slice(0,4),[4,4,2,0]); assert.equal(p.score,8);
assert.equal(undo2048(p),true); assert.deepEqual(p.board,[2,2,2,2,...Array(12).fill(0)]); assert.equal(p.score,0); assert.equal(undo2048(p),false);
for (const direction of ['left','right','up','down']) {
  const game = { board:blank(),score:0 }; game.board[0]=2; game.board[1]=2;
  if (direction === 'up' || direction === 'down') { game.board[1]=0; game.board[4]=2; }
  move2048(game,direction,zero);
  assert.equal(game.board[['left','right','up','down'].indexOf(direction) === 0 ? 0 : direction === 'right' ? 3 : direction === 'up' ? 0 : 12],4);
  assert.equal(game.score,4); assert.equal(game.board.filter(Boolean).length,2);
}
const noMove = { board:[2,...Array(15).fill(0)],score:0 };
assert.equal(move2048(noMove,'left',zero),false); assert.equal(noMove.board.filter(Boolean).length,1);
assert.equal(canMove2048([2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),false);
assert.equal(canMove2048([2,2,2,4,4,2,4,2,2,4,2,4,4,2,4,2]),true);
const oneMerge = { board:[2,2,4,0,...Array(12).fill(0)],score:0 }; move2048(oneMerge,'left',zero);
assert.deepEqual(oneMerge.board.slice(0,3),[4,4,2]); assert.equal(oneMerge.score,4);

for (const level of Object.keys(MINE_LEVELS)) for (const first of [0,40]) {
  const m = newMines(level); flagMine(m,first); assert.equal(revealMine(m,first),false); flagMine(m,first);
  assert.equal(revealMine(m,first,zero),true); assert.equal(m.mines.length,m.count); assert.equal(new Set(m.mines).size,m.count);
  assert.ok([first,...neighbors(m,first)].every(index=>!m.mines.includes(index))); assert.equal(adjacentMines(m,first),0);
  for (let index=0; index<m.rows*m.cols; index++) if (!m.mines.includes(index)) revealMine(m,index,zero);
  assert.equal(m.status,'won'); assert.equal(m.revealed.filter(Boolean).length,m.rows*m.cols-m.count);
  assert.equal(flagMine(m,m.mines[0]),false); assert.equal(revealMine(m,m.mines[0]),false);
}
const lose = newMines(); revealMine(lose,40,zero); revealMine(lose,lose.mines[0]); assert.equal(lose.status,'lost');
// Opening a numbered square with enough flags reveals its remaining neighbors.
const chord = newMines(); chord.status='playing'; chord.mines=[0,1,2,3,4,5,6,7,8]; chord.count=9; chord.revealed[9]=true;
flagMine(chord,0); flagMine(chord,1); assert.equal(revealMine(chord,9),true); assert.notEqual(chord.status,'lost');

const b = newBlocks(zero); const type = b.piece.shape.flat().find(Boolean)-1;
assert.equal(new Set([...b.bag,b.next,type]).size,7);
const x = b.piece.x; assert.equal(moveBlocks(b,-1),true); assert.equal(b.piece.x,x-1);
for(let i=0;i<20;i++) moveBlocks(b,-1); assert.equal(moveBlocks(b,-1),false);
for(let i=0;i<4;i++) rotateBlocks(b); assert.equal(collides(b),false);
assert.equal(collides(b,ghostPiece(b)),false); assert.equal(collides(b,{...ghostPiece(b),y:ghostPiece(b).y+1}),true);
const single = newBlocks(zero); single.board=Array(200).fill(0); single.board.fill(1,190,200); single.board.fill(0,193,197);
single.piece={shape:structuredClone(SHAPES[0]),x:3,y:18}; dropBlocks(single,zero);
assert.equal(single.lines,1); assert.equal(single.score,100); assert.equal(single.board.filter(Boolean).length,0);
const four = newBlocks(zero); four.board=Array(200).fill(0);
for(let row=16;row<20;row++) for(let col=0;col<10;col++) four.board[row*10+col]=col===3?0:7;
four.piece={shape:rotateShape(SHAPES[0]),x:1,y:16}; dropBlocks(four,zero);
assert.equal(four.lines,4); assert.equal(four.score,800); assert.equal(four.board.filter(Boolean).length,0);
const over = newBlocks(zero); over.board[4]=2; over.next=1; over.piece={shape:structuredClone(SHAPES[1]),x:4,y:18}; dropBlocks(over,zero);
assert.equal(over.status,'over'); assert.equal(stepBlocks(over),false); assert.equal(moveBlocks(over,1),false);
const kick = newBlocks(zero); kick.piece={shape:rotateShape(SHAPES[0]),x:-2,y:3}; assert.equal(collides(kick),false);
assert.equal(rotateBlocks(kick),true); assert.equal(collides(kick),false);

const raw=normalizeGames(); raw.puzzle2048=new2048(zero); move2048(raw.puzzle2048,'left',zero);
raw.mines=newMines('medium'); revealMine(raw.mines,40,zero); raw.mines.elapsed=13; flagMine(raw.mines,raw.mines.mines[0]);
raw.blocks=newBlocks(zero); dropBlocks(raw.blocks,zero); raw.bestBlocks=99; raw.best2048=128; raw.minesBest={easy:42}; raw.selected='blocks';
const state=createDefaultState(); state.groups[0].items.push({id:'game-test',type:'widget',kind:'games',title:'小游戏',w:3,h:2,data:raw});
const exported=JSON.parse(JSON.stringify(createBackupDocument(state,{})));
const restored=normalizeState(readBackupDocument(exported).workspace).groups[0].items.find(item=>item.id==='game-test');
assert.deepEqual(restored.data,raw); assert.equal(restored.w,3);
const damaged=structuredClone(raw); damaged.puzzle2048.board=[8]; damaged.mines.mines=[999]; damaged.blocks.piece.shape=[[99]];
const repaired=normalizeGames(damaged); assert.equal(repaired.puzzle2048,null); assert.equal(repaired.mines,null); assert.equal(repaired.blocks,null); assert.equal(repaired.best2048,128);
assert.equal(normalizeGames(null).selected,'puzzle2048'); assert.equal(normalizeGames({selected:'__proto__'}).selected,'puzzle2048');
console.log('PASS: 2048 directional merges/undo/no-op; mines first-click, flag, flood, chord, win/loss; blocks rotation, collision, line clearing, top-out; complete backup round-trip and damaged saves');
