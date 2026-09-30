// Pure, offline helpers shared by the new-tab tools and their checks.
export function calculate(expression) {
  const source = String(expression).replace(/[×xX]/g, '*').replace(/[÷]/g, '/').replace(/[−]/g, '-').replace(/\s+/g, '');
  if (!source || source.length > 120) throw new Error('请输入不超过 120 个字符的算式');
  let position = 0;
  function number() {
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));
    if (!match) throw new Error('算式格式有误');
    position += match[0].length;
    return Number(match[0]);
  }
  function primary() {
    if (source[position] === '+') { position++; return primary(); }
    if (source[position] === '-') { position++; return -primary(); }
    let value;
    if (source[position] === '(') {
      position++;
      value = sum();
      if (source[position++] !== ')') throw new Error('括号没有配对');
    } else value = number();
    while (source[position] === '%') { value /= 100; position++; }
    return value;
  }
  function product() {
    let value = primary();
    while (source[position] === '*' || source[position] === '/') {
      const operator = source[position++];
      const operand = primary();
      if (operator === '/' && operand === 0) throw new Error('不能除以零');
      value = operator === '*' ? value * operand : value / operand;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (source[position] === '+' || source[position] === '-') {
      const operator = source[position++];
      const operand = product();
      value = operator === '+' ? value + operand : value - operand;
    }
    return value;
  }
  const result = sum();
  if (position !== source.length) throw new Error('算式格式有误');
  if (!Number.isFinite(result)) throw new Error('结果超出范围');
  return Number(result.toPrecision(12));
}

export const unitGroups = {
  length: { label: '长度', units: { m: ['米', 1], km: ['千米', 1000], cm: ['厘米', .01], mm: ['毫米', .001], in: ['英寸', .0254], ft: ['英尺', .3048], mi: ['英里', 1609.344] } },
  mass: { label: '质量', units: { kg: ['千克', 1], g: ['克', .001], mg: ['毫克', .000001], lb: ['磅', .45359237], oz: ['盎司', .028349523125] } },
  area: { label: '面积', units: { 'm2': ['平方米', 1], 'km2': ['平方千米', 1000000], 'cm2': ['平方厘米', .0001], ha: ['公顷', 10000], acre: ['英亩', 4046.8564224] } },
  volume: { label: '体积', units: { l: ['升', 1], ml: ['毫升', .001], 'm3': ['立方米', 1000], gal: ['美制加仑', 3.785411784], floz: ['美制液盎司', .0295735295625] } },
  temperature: { label: '温度', units: { c: ['摄氏度', 1], f: ['华氏度', 1], k: ['开尔文', 1] } },
  speed: { label: '速度', units: { mps: ['米/秒', 1], kmh: ['千米/时', 1 / 3.6], mph: ['英里/时', .44704], knot: ['节', .514444444444] } },
  time: { label: '时间', units: { s: ['秒', 1], min: ['分钟', 60], h: ['小时', 3600], day: ['天', 86400], week: ['周', 604800] } },
  data: { label: '数据大小', units: { b: ['B', 1], kb: ['KB', 1024], mb: ['MB', 1048576], gb: ['GB', 1073741824], tb: ['TB', 1099511627776] } }
};

export function convertUnit(value, category, from, to) {
  const group = Object.hasOwn(unitGroups, category) ? unitGroups[category] : null;
  if (!group || !Object.hasOwn(group.units, from) || !Object.hasOwn(group.units, to) ||
      !Number.isFinite(Number(value)) || String(value).trim() === '')
    throw new Error('请输入有效数值和单位');
  const input = Number(value);
  let result;
  if (category === 'temperature') {
    const celsius = from === 'c' ? input : from === 'f' ? (input - 32) * 5 / 9 : input - 273.15;
    result = to === 'c' ? celsius : to === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
    if (celsius < -273.15) throw new Error('温度不能低于绝对零度');
  } else result = input * group.units[from][1] / group.units[to][1];
  if (!Number.isFinite(result)) throw new Error('结果超出范围');
  return Number(result.toPrecision(12));
}

export function parseTimestamp(value, unit = 's') {
  const text = String(value).trim();
  if (!/^-?\d{1,16}$/.test(text)) throw new Error('请输入整数时间戳');
  const milliseconds = Number(text) * (unit === 'ms' ? 1 : 1000);
  if (!Number.isSafeInteger(milliseconds) || Math.abs(milliseconds) > 8640000000000000)
    throw new Error('时间戳超出日期范围');
  return new Date(milliseconds);
}

export function formatToolNumber(value) {
  return new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 12 }).format(value);
}
