import { normalizeGames } from './games-core.js';
import { unitGroups } from './local-tools.js';
import { normalizeHolidayYears } from './holidays.js';

export const STORAGE_KEY = 'qidian-state-v1';
export const BACKUP_VERSION = 2;

export function makeId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

export function cleanText(value, limit = 100) {
  return String(value ?? '').trim().slice(0, limit);
}

export function normalizeUrl(value) {
  let text = cleanText(value, 2048);
  if (!text) return '';
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) text = 'https://' + text;
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (!parsed.hostname) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function shortcut(title, url, emoji, color) {
  return { id: makeId(), type: 'shortcut', title, url, emoji, color, assetId: '' };
}

function widget(kind, title, w, h, data = {}) {
  return { id: makeId(), type: 'widget', kind, title, w, h, data };
}

export function createDefaultState() {
  const home = {
    id: makeId(), name: '主页',
    items: [
      widget('weather', '天气', 3, 2, { enabled: false, city: '', latitude: '', longitude: '' }),
      widget('calendar', '日历', 3, 2),
      widget('holiday', '下一个假期', 3, 2),
      widget('hotlist', '热搜榜', 3, 2, { enabled: false, source: 'zhihu' }),
      widget('notes', '备忘录', 2, 2, { text: '' }),
      widget('countdown', '纪念日', 2, 2, { title: '', date: '' }),
      widget('todo', '待办事项', 2, 2, { todos: [] }),
      { id: makeId(), type: 'folder', title: '常用网站', children: [
        shortcut('Microsoft', 'https://www.microsoft.com/', 'M', '#3975d7'),
        shortcut('GitHub', 'https://github.com/', 'G', '#242d3c'),
        shortcut('哔哩哔哩', 'https://www.bilibili.com/', '哔', '#f271a5'),
        shortcut('维基百科', 'https://zh.wikipedia.org/', 'W', '#646c80')
      ] },
      shortcut('Bing', 'https://www.bing.com/', '必', '#2678d5'),
      shortcut('百度', 'https://www.baidu.com/', '百', '#3166df'),
      shortcut('知乎', 'https://www.zhihu.com/', '知', '#2373d8'),
      shortcut('小红书', 'https://www.xiaohongshu.com/', '书', '#e75059')
    ]
  };
  return {
    version: 6,
    groups: [home, { id: makeId(), name: '工作', items: [] }, { id: makeId(), name: '收藏', items: [] }],
    activeGroupId: home.id,
    searchEngine: 'bing',
    customEngines: [],
    wallpaper: { kind: 'preset', id: 'mist', assetId: '' },
    appearance: { showSeconds: true, showLabels: true, showQuote: true, compact: false, focus: false,
      showSearch: true, searchHeight: 60, searchRadius: 12, searchOpacity: 0.82,
      iconSize: 50, iconRadius: 14, iconOpacity: 1, iconGap: 28, iconShape: 'default',
      labelSize: 12, clockSize: 80, clockColor: '#ffffff', clockBold: true,
      boardWidth: 1220, iconColumns: 16, adaptiveLabels: true, layoutMode: 'organized',
      autoText: true, clockMode: 'auto', clockShadow: 0, wallpaperDim: 0.08,
      showClock: true, showDate: true, showWeek: true, showLunar: true, hour24: true },
    quote: '把常用的，留在眼前。', backupLastExportedAt: '', holidayYears: {}
  };
}

function normalizeShortcut(raw) {
  const url = normalizeUrl(raw?.url);
  if (!url) return null;
  return {
    id: cleanText(raw.id, 80) || makeId(),
    type: 'shortcut',
    title: cleanText(raw.title, 80) || new URL(url).hostname,
    url,
    emoji: cleanText(raw.emoji, 8),
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#596c9a',
    assetId: cleanText(raw.assetId, 80),
    iconKey: /^[a-z0-9-]{1,100}$/.test(raw.iconKey || '') ? raw.iconKey : '',
    iconFit: ['contain','cover'].includes(raw.iconFit) ? raw.iconFit : 'auto',
    iconScale: Math.max(.6,Math.min(1.4,Number(raw.iconScale)||1)),
    iconBackground: /^(#[0-9a-f]{6}|transparent)$/i.test(raw.iconBackground || '') ? raw.iconBackground : 'auto'
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'shortcut') return normalizeShortcut(raw);
  if (raw.type === 'folder') return {
    id: cleanText(raw.id, 80) || makeId(),
    type: 'folder', title: cleanText(raw.title, 80) || '文件夹', size: raw.size === 'large' ? 'large' : 'small',
    children: Array.isArray(raw.children) ? raw.children.slice(0, 300).map(normalizeShortcut).filter(Boolean) : []
  };
  if (raw.type !== 'widget') return null;
  const kinds = ['weather', 'calendar', 'holiday', 'hotlist', 'notes', 'todo', 'countdown', 'clock', 'pomodoro', 'worldclock', 'quote', 'calculator', 'timestamp', 'converter', 'games'];
  if (!kinds.includes(raw.kind)) return null;
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const safeData = raw.kind === 'games' ? normalizeGames(data) : {};
  if (raw.kind === 'notes') safeData.text = cleanText(data.text, 12000);
  if (raw.kind === 'countdown') {
    safeData.title = cleanText(data.title, 80);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : '';
    safeData.date = date && !Number.isNaN(new Date(date + 'T00:00:00').getTime()) ? date : '';
  }
  if (raw.kind === 'todo') {
    safeData.todos = Array.isArray(data.todos) ? data.todos.slice(0, 200).map(todo => ({
      id: cleanText(todo.id, 80) || makeId(),
      text: cleanText(todo.text, 200), done: Boolean(todo.done)
    })).filter(todo => todo.text) : [];
  }
  if (raw.kind === 'weather') {
    safeData.enabled = Boolean(data.enabled);
    safeData.city = cleanText(data.city, 80);
    safeData.latitude = cleanText(data.latitude, 24);
    safeData.longitude = cleanText(data.longitude, 24);
    safeData.cache = null;
  }
  if (raw.kind === 'hotlist') {
    safeData.enabled = Boolean(data.enabled);
    safeData.source = ['weibo', 'zhihu', 'baidu', 'yystv'].includes(data.source) ? data.source : 'zhihu';
  }
  if (raw.kind === 'pomodoro') {
    const duration = Math.max(5, Math.min(180, Number(data.duration) || 25));
    safeData.duration = duration;
    const remaining = Number(data.remaining);
    safeData.remaining = Number.isFinite(remaining) ? Math.max(0, Math.min(duration * 60, remaining)) : duration * 60;
    safeData.endsAt = Math.max(0, Number(data.endsAt) || 0);
    safeData.running = Boolean(data.running) && safeData.endsAt > 0;
  }
  if (raw.kind === 'worldclock') {
    const zone = cleanText(data.zone, 80) || 'Asia/Shanghai';
    try { new Intl.DateTimeFormat('zh-CN', { timeZone: zone }); safeData.zone = zone; }
    catch { safeData.zone = 'Asia/Shanghai'; }
    safeData.city = cleanText(data.city, 80) || '北京时间';
  }
  if (raw.kind === 'quote') safeData.text = cleanText(data.text, 500) || '今天也要好好生活。';
  if (raw.kind === 'calculator') {
    safeData.expression = cleanText(data.expression, 120);
    safeData.result = /^-?(?:\d+(?:\.\d+)?|\d+(?:\.\d+)?e[+-]?\d+)$/i.test(String(data.result || ''))
      ? cleanText(data.result, 40) : '';
  }
  if (raw.kind === 'converter') {
    const category = Object.hasOwn(unitGroups, data.category) ? data.category : 'length';
    const units = unitGroups[category].units;
    const keys = Object.keys(units);
    const value = cleanText(data.value, 40);
    safeData.category = category;
    safeData.from = Object.hasOwn(units, data.from) ? data.from : keys[0];
    safeData.to = Object.hasOwn(units, data.to) ? data.to : keys[1];
    safeData.value = value && Number.isFinite(Number(value)) ? value : '1';
  }
  return {
    id: cleanText(raw.id, 80) || makeId(), type: 'widget', kind: raw.kind,
    title: cleanText(raw.title, 80) || raw.kind, hidden: Boolean(raw.hidden),
    w: [2,3,4,6,12].includes(Number(raw.w)) ? Number(raw.w) : 2,
    h: [2,3,4].includes(Number(raw.h)) ? Number(raw.h) : 2, data: safeData
  };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) return createDefaultState();
  const groups = raw.groups.slice(0, 30).map(group => ({
    id: cleanText(group?.id, 80) || makeId(),
    name: cleanText(group?.name, 40) || '未命名',
    items: Array.isArray(group?.items) ? group.items.slice(0, 500).map(normalizeItem).filter(Boolean) : []
  }));
  if (!groups.length) return createDefaultState();
  const presets = ['aurora', 'dusk', 'ocean', 'forest', 'graphite', 'mist', 'ivory', 'peach', 'sage', 'lavender', 'sky', 'ink'];
  const rawPaper = raw.wallpaper || {};
  const wallpaper = rawPaper.kind === 'local' && cleanText(rawPaper.assetId, 80)
    ? { kind: 'local', id: '', assetId: cleanText(rawPaper.assetId, 80) }
    : { kind: 'preset', id: presets.includes(rawPaper.id) ? rawPaper.id : 'mist', assetId: '' };
  const appearance = raw.appearance || {};
  const defaults = createDefaultState().appearance;
  const wasAutoText = Number(raw.version) < 5 ?
    !(/^#[0-9a-f]{6}$/i.test(appearance.clockColor) && appearance.clockColor.toLowerCase() !== '#ffffff') :
    appearance.autoText !== false;
  const clockMode = ['auto','dark','light','custom'].includes(appearance.clockMode) ? appearance.clockMode :
    wasAutoText ? 'auto' : appearance.clockColor?.toLowerCase() === '#26394b' ? 'dark' :
    appearance.clockColor?.toLowerCase() === '#ffffff' ? 'light' : 'custom';
  const number = (key, min, max) => {
    const value = Number(appearance[key]);
    return Math.max(min, Math.min(max, Number.isFinite(value) && appearance[key] !== undefined ? value : defaults[key]));
  };
  if (Number(raw.version) < 2) {
    const home = groups.find(group => group.name === '主页') || groups[0];
    if (!home.items.some(item => item.kind === 'holiday')) home.items.splice(2, 0, widget('holiday', '下一个假期', 3, 2));
    if (!home.items.some(item => item.kind === 'hotlist')) home.items.splice(3, 0, widget('hotlist', '热搜榜', 3, 2, { enabled: false, source: 'zhihu' }));
    for (const item of home.items) if (item.kind === 'weather' || item.kind === 'calendar') item.w = 3;
  }
  const customEngines = Array.isArray(raw.customEngines) ? raw.customEngines.slice(0, 12).map(engine => {
    const name = cleanText(engine?.name, 30);
    const template = cleanText(engine?.template, 500);
    try {
      const url = new URL(template.replace('%s', 'test'));
      if (!name || !template.includes('%s') || url.protocol !== 'https:') return null;
      return { id: cleanText(engine.id, 80) || makeId(), name, template };
    } catch { return null; }
  }).filter(Boolean) : [];
  const engineIds = ['bing', 'baidu', 'google', 'local', ...customEngines.map(e => e.id)];
  return {
    version: 6, groups,
    activeGroupId: groups.some(g => g.id === raw.activeGroupId) ? raw.activeGroupId : groups[0].id,
    searchEngine: engineIds.includes(raw.searchEngine) ? raw.searchEngine : 'bing',
    customEngines, wallpaper,
    appearance: {
      showSeconds: Number(raw.version) < 3 ? true : appearance.showSeconds !== false,
      showLabels: appearance.showLabels !== false, showQuote: appearance.showQuote !== false,
      compact: Boolean(appearance.compact), focus: Boolean(appearance.focus),
      showSearch: appearance.showSearch !== false,
      searchHeight: number('searchHeight', 38, 90), searchRadius: number('searchRadius', 0, 45),
      searchOpacity: number('searchOpacity', .3, 1),
      iconSize: number('iconSize', 32, 72), iconRadius: number('iconRadius', 0, 36),
      iconOpacity: number('iconOpacity', .35, 1), iconGap: number('iconGap', 8, 48),
      iconShape: appearance.iconShape === 'circle' ? 'circle' : 'default',
      labelSize: number('labelSize', 10, 20), clockSize: number('clockSize', 44, 120),
      clockColor: /^#[0-9a-f]{6}$/i.test(appearance.clockColor) ? appearance.clockColor : defaults.clockColor,
      clockBold: Number(raw.version) < 4 ? true : Boolean(appearance.clockBold),
      boardWidth: number('boardWidth',800,1600),
      iconColumns: [8,12,16,20].includes(Number(appearance.iconColumns)) ? Number(appearance.iconColumns) : 16,
      adaptiveLabels: appearance.adaptiveLabels !== false,
      layoutMode: appearance.layoutMode === 'free' ? 'free' : 'organized',
      autoText: clockMode === 'auto', clockMode, clockShadow: number('clockShadow', 0, 10),
      wallpaperDim: number('wallpaperDim', 0, .5),
      showClock: appearance.showClock !== false,
      showDate: appearance.showDate !== false, showWeek: appearance.showWeek !== false,
      showLunar: appearance.showLunar !== false, hour24: appearance.hour24 !== false
    },
    quote: cleanText(raw.quote, 160) || '把常用的，留在眼前。',
    backupLastExportedAt: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(raw.backupLastExportedAt || '') ?
      cleanText(raw.backupLastExportedAt, 40) : '',
    holidayYears: normalizeHolidayYears(raw.holidayYears)
  };
}

export async function loadState() {
  let value;
  if (globalThis.chrome?.storage?.local) {
    value = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  } else {
    try { value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { value = null; }
  }
  const normalized = normalizeState(value);
  if (value && Number(value.version) < normalized.version) await saveState(normalized);
  return normalized;
}

export async function saveState(state) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function getActiveGroup(state) {
  return state.groups.find(group => group.id === state.activeGroupId) || state.groups[0];
}
