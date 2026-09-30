import assert from 'node:assert/strict';
import { calculate, convertUnit, parseTimestamp, unitGroups } from '../extension/local-tools.js';
import { createDefaultState, normalizeState } from '../extension/storage.js';

assert.equal(calculate('12.5 × (8 + 2)'), 125);
assert.equal(calculate('2+3*4'), 14);
assert.equal(calculate('-(5-8)/3'), 1);
assert.equal(calculate('50% × 200'), 100);
assert.throws(() => calculate('1/0'), /除以零/);
assert.throws(() => calculate('1;globalThis.alert(1)'), /格式/);
assert.throws(() => calculate('2**3'), /格式/);

assert.equal(convertUnit(1, 'length', 'km', 'm'), 1000);
assert.equal(convertUnit(0, 'temperature', 'c', 'f'), 32);
assert.equal(convertUnit(32, 'temperature', 'f', 'c'), 0);
assert.equal(convertUnit(1, 'data', 'gb', 'mb'), 1024);
assert.throws(() => convertUnit(-274, 'temperature', 'c', 'k'), /绝对零度/);
assert.throws(() => convertUnit('bad', 'length', 'm', 'km'), /有效/);
assert.throws(() => convertUnit(1, 'constructor', 'm', 'km'), /有效/);
assert.equal(Object.keys(unitGroups).length, 8);

assert.equal(parseTimestamp('0').toISOString(), '1970-01-01T00:00:00.000Z');
assert.equal(parseTimestamp('1000', 'ms').getTime(), 1000);
assert.equal(parseTimestamp('-1').getTime(), -1000);
assert.throws(() => parseTimestamp('1.2'), /整数/);

const state = createDefaultState();
state.groups[0].items.push(
  {id:'calc',type:'widget',kind:'calculator',title:'计算器',w:2,h:2,data:{expression:'2+3*4',result:'14'}},
  {id:'stamp',type:'widget',kind:'timestamp',title:'时间戳',w:2,h:2,data:{}},
  {id:'units',type:'widget',kind:'converter',title:'单位换算',w:2,h:2,data:{category:'mass',from:'kg',to:'g',value:'2.5'}}
);
const restored = normalizeState(JSON.parse(JSON.stringify(state)));
assert.deepEqual(restored.groups[0].items.slice(-3).map(item=>item.kind), ['calculator','timestamp','converter']);
assert.equal(restored.groups[0].items.at(-3).data.result, '14');
assert.equal(restored.groups[0].items.at(-1).data.value, '2.5');
assert.equal(restored.groups[0].items.at(-1).data.to, 'g');
state.groups[0].items.at(-1).data = {category:'__proto__',from:'constructor',to:'m',value:'1'};
assert.equal(normalizeState(state).groups[0].items.at(-1).data.category, 'length');
console.log('PASS: offline calculator, timestamps, unit conversion, and backup normalization');
