import { createDefaultState, getActiveGroup, loadState, makeId, normalizeState, normalizeUrl, saveState, cleanText } from './storage.js';
import { blobToDataUrl, dataUrlToBlob, getImage, getImageUrl, putImage } from './assets.js';
import { getSnapshot, listSnapshots, saveSnapshot } from './snapshots.js';
import { iconSpec, resolveSiteIcon, iconCatalog } from './icons.js';
import { cities, sourceLinks, weatherKey, coarseWeatherLocation, readServiceCache, fetchWeather, fetchHotlist, cacheTime } from './services.js';
import { gamesCardMarkup, mountGames } from './games.js';
import { normalizeGames } from './games-core.js';
import { calculate, convertUnit, formatToolNumber, parseTimestamp, unitGroups } from './local-tools.js';
import { parseHolidayFile, upcomingHolidays } from './holidays.js';
import { createBackupDocument, readBackupDocument, referencedImageIds, summarizeWorkspace } from './backup-format.js';

const $ = selector => document.querySelector(selector);
const builtInEngines = [
  { id: 'bing', name: '必应', mark: '必', template: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', mark: '百', template: 'https://www.baidu.com/s?wd=%s' },
  { id: 'google', name: 'Google', mark: 'G', template: 'https://www.google.com/search?q=%s' },
  { id: 'local', name: '我的网址', mark: '⌕', template: '' }
];
const presetNames = { aurora: '极光', dusk: '暮色', ocean: '海湾', forest: '山林', graphite: '深灰',
  mist: '浅灰蓝', ivory: '象牙白', peach: '蜜桃粉', sage: '鼠尾草绿', lavender: '淡紫', sky: '天蓝', ink: '深墨' };
const solidColors = { mist: '#D2DCE2', ivory: '#F5F2EA', peach: '#F2D8D7',
  sage: '#D6E4D7', lavender: '#DDD7ED', sky: '#CCE4F2', ink: '#202833' };
const widgetNames = { weather: '天气', calendar: '日历', holiday: '下一个假期', hotlist: '热搜榜', notes: '备忘录', todo: '待办事项', countdown: '纪念日', clock: '时钟', pomodoro: '番茄钟', worldclock: '世界时钟', quote: '一句话', calculator: '计算器', timestamp: '时间戳', converter: '单位换算', games: '小游戏' };
const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const localQuotes = ['给今天留一点轻松。', '每个新标签，都是一个新的起点。', '想做的事，就从现在开始。',
  '慢一点，也能看见好风景。', '为喜欢的事情，留一块地方。', '把日子过成自己喜欢的样子。'];
const hotPermission = source => source === 'yystv' ? 'https://www.yystv.cn/*' : 'https://newsnow.busiyi.world/*';
const tabQuote = localQuotes[Math.floor(Math.random() * localQuotes.length)];
let state = await loadState();
let toastTimer;
let notesSaveTimer;
let paperVersion = 0;
let wallpaperLuminance = 0.82;
let wallpaperLabelLuminance = 0.82;
let calendarCursor = new Date();
let currentEditorCleanup;
let pendingBackup = null;
let pendingWeatherLocation = null;
let modalReturnFocus = null;
let contextMenuReturnFocus = null;
const weatherCache = new Map();
const hotCache = new Map();
const localWriteSignatures = new Set();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function escapeAttr(value) { return escapeHtml(value); }

function iconMarkup(item, mini = false) {
  const spec = item.assetId ? {src:'fallback-icon.svg',background:'transparent',fit:'cover',scale:1} : iconSpec(item.url, item.iconKey);
  const fit = ['contain','cover'].includes(item.iconFit) ? item.iconFit : spec.fit;
  const scale = Math.max(.6,Math.min(1.4,Number(item.iconScale)||1)) * (item.iconFit === 'auto' || !item.iconFit ? spec.scale : 1);
  const background = /^(#[0-9a-f]{6}|transparent)$/i.test(item.iconBackground || '') ? item.iconBackground : spec.background;
  return '<span class="' + (mini ? 'folder-mini' : 'shortcut-icon') + '" data-site-icon="' + escapeAttr(item.url) + '"' +
    ' data-icon-key="' + escapeAttr(item.iconKey || '') + '"' +
    (item.assetId ? ' data-asset-id="' + escapeAttr(item.assetId) + '"' : '') +
    ' style="--site-icon-fit:' + fit + ';--site-icon-scale:' + scale + ';--site-icon-bg:' + background + '">' +
    '<img src="' + escapeAttr(item.assetId ? 'fallback-icon.svg' : spec.src) + '" data-fallback-icon alt=""></span>';
}

function shortcutMarkup(item, inFolder = false) {
  return '<a class="shortcut-card" href="' + escapeAttr(item.url) + '" target="_blank" rel="noopener noreferrer" aria-keyshortcuts="Shift+F10" data-item-id="' + escapeAttr(item.id) + '"' +
    (inFolder ? ' data-in-folder="true"' : '') + ' title="' + escapeAttr(item.title) + '">' +
    iconMarkup(item) + '<span class="tile-label">' + escapeHtml(item.title) + '</span></a>';
}

function dateParts() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  let lunar = '';
  try {
    lunar = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(now);
    lunar = lunar.replace(/(\d{1,2})日?$/, (_, value) => {
      const day = Number(value);
      const digits = ['','一','二','三','四','五','六','七','八','九','十'];
      if (day <= 10) return '初' + digits[day];
      if (day < 20) return '十' + digits[day - 10];
      if (day === 20) return '二十';
      if (day < 30) return '廿' + digits[day - 20];
      return '三十';
    });
  } catch { /* Browser calendars vary. */ }
  return { now, month, date, dayOfYear, week, lunar };
}

function updateClock() {
  const { now, month, date, lunar } = dateParts();
  document.querySelectorAll('[data-current-timestamp], [data-live-timestamp]').forEach(element => {
    element.textContent = String(Math.floor(now.getTime() / 1000));
  });
  const options = { hour: '2-digit', minute: '2-digit', hour12: !state.appearance.hour24 };
  if (state.appearance.showSeconds) options.second = '2-digit';
  $('#clock').textContent = now.toLocaleTimeString('zh-CN', options);
  $('#date').innerHTML = [state.appearance.showDate ? month + '月' + date + '日' : '', state.appearance.showWeek ? weekdayNames[now.getDay()] : '', state.appearance.showLunar ? lunar : ''].filter(Boolean).map(text => '<span>' + escapeHtml(text) + '</span>').join('');
  document.querySelectorAll('[data-clock-widget]').forEach(element => {
    element.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  });
  document.querySelectorAll('[data-worldclock-id]').forEach(element => {
    const item = findItem(element.dataset.worldclockId)?.item;
    if (item?.kind === 'worldclock') {
      try { element.textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: item.data.zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now); }
      catch { element.textContent = '--:--'; }
    }
  });
  document.querySelectorAll('[data-pomodoro-time]').forEach(element => {
    const item = findItem(element.dataset.pomodoroTime)?.item;
    if (item?.kind !== 'pomodoro') return;
    const seconds = pomodoroSeconds(item);
    element.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    if (item.data.running && seconds === 0) {
      item.data.running = false; item.data.remaining = 0; item.data.endsAt = 0;
      persist(); renderBoard(); toast('番茄钟已完成');
    }
  });
}

function pomodoroSeconds(item) {
  const data = item.data || {};
  return data.running ? Math.max(0, Math.ceil((data.endsAt - Date.now()) / 1000)) :
    Math.max(0, Number(data.remaining) || 0);
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
}

async function persist() {
  const snapshot = structuredClone(state);
  const signature = JSON.stringify(snapshot);
  if (globalThis.chrome?.storage?.local) localWriteSignatures.add(signature);
  try { await saveState(snapshot); return true; }
  catch (error) { localWriteSignatures.delete(signature); console.error(error); toast('保存失败，请先导出备份'); return false; }
}

function field(form, name) { return form.elements.namedItem(name); }

function findItem(id) {
  for (const group of state.groups) {
    const item = group.items.find(candidate => candidate.id === id);
    if (item) return { item, group, parent: null };
    for (const folder of group.items.filter(candidate => candidate.type === 'folder')) {
      const child = folder.children.find(candidate => candidate.id === id);
      if (child) return { item: child, group, parent: folder };
    }
  }
  return null;
}

function allShortcuts() {
  return state.groups.flatMap(group => group.items.flatMap(item =>
    item.type === 'shortcut' ? [{ ...item, groupName: group.name }] :
      item.type === 'folder' ? item.children.map(child => ({ ...child, groupName: group.name })) : []
  ));
}

function currentEngine() {
  return [...builtInEngines, ...state.customEngines.map(engine => ({ ...engine, mark: Array.from(engine.name)[0] }))]
    .find(engine => engine.id === state.searchEngine) || builtInEngines[0];
}

function engineIcon(engine) {
  if (engine.id === 'local') return '⌕';
  const address = engine.template.replace('%s', '');
  const spec = iconSpec(address);
  if (spec.src === 'fallback-icon.svg') return '<span class="engine-icon-face" style="--engine-icon-bg:#1788de;--engine-icon-fit:contain;--engine-icon-scale:.72"><img src="store-icons/search.svg" alt=""></span>';
  return '<span class="engine-icon-face" data-site-icon="' + escapeAttr(address) + '" style="--engine-icon-bg:' +
    escapeAttr(spec.background) + ';--engine-icon-fit:' + escapeAttr(spec.fit) + ';--engine-icon-scale:' +
    Number(spec.scale || 1) + '"><img src="' + escapeAttr(spec.src) + '" data-fallback-icon alt=""></span>';
}
function renderEngines() {
  const engine = currentEngine();
  $('#engineMark').innerHTML = engineIcon(engine);
  $('#searchInput').placeholder = engine.id === 'local' ? '搜索我的网址' : '输入内容并搜索';
  $('#engineMenu').innerHTML = [...builtInEngines, ...state.customEngines.map(item => ({ ...item, mark: Array.from(item.name)[0] }))]
    .map(item => '<button class="engine-option' + (item.id === engine.id ? ' selected' : '') + '" type="button" data-engine="' +
      escapeAttr(item.id) + '"><span class="engine-icon">' + engineIcon(item) + '</span>' +
      escapeHtml(item.name) + '</button>').join('');
  hydrateImages($('#searchForm'));
}

function renderGroups() {
  $('#groupNav').innerHTML = state.groups.map(group => '<button type="button" draggable="true" aria-keyshortcuts="Shift+F10" class="group-button' +
    (group.id === state.activeGroupId ? ' active' : '') + '" data-group-id="' + escapeAttr(group.id) +
    '" title="' + escapeAttr(group.name) + '"><span class="group-glyph">' + escapeHtml(Array.from(group.name)[0] || '分') +
    '</span><span class="group-name">' + escapeHtml(group.name) + '</span></button>').join('');
  const group = getActiveGroup(state);
  $('#groupTitle').textContent = group.name;
  $('#groupSubtitle').textContent = group.items.length + ' 个内容 · 保存在这台设备';
}

function serviceStamp(cached, provider, action, id) {
  return '<div class="service-footer"><span title="' + escapeAttr(provider) + '">' +
    (cached?.time ? (cached.error ? '离线缓存 · ' : '') + cacheTime(cached) + ' 更新' : provider) +
    '</span><button type="button" data-action="' + action + '" data-id="' + escapeAttr(id) +
    '" title="刷新" aria-label="刷新组件"' + (cached?.loading ? ' disabled' : '') + '>↻</button></div>';
}
function emptyService(item, icon, title, text, action, button, extra = '') {
  return '<div class="service-setup"><span class="service-setup-icon">' + icon + '</span><div><strong>' +
    title + '</strong><small>' + text + '</small></div><div class="service-setup-actions"><button class="service-button" type="button" data-action="' +
    action + '" data-id="' + escapeAttr(item.id) + '">' + button + '</button>' + extra + '<button class="service-skip" type="button" data-action="hide-widget" data-id="' +
    escapeAttr(item.id) + '">暂不显示</button></div></div>';
}
function weatherMarkup(item) {
  const data = item.data || {};
  if (!data.enabled) return emptyService(item,weatherSymbol(2),'你所在城市的天气','选择城市，查看未来六天预报','widget-settings','选择城市',
    '<button class="service-button" type="button" data-action="locate-weather" data-id="' + escapeAttr(item.id) + '">当前位置</button>');
  const key = weatherKey(data);
  let cached = weatherCache.get(item.id);
  if (cached?.key !== key) {
    cached = {...(readServiceCache('weather',key)||{}),key};
    weatherCache.set(item.id,cached);
  }
  if (cached.temperature === undefined) return '<div class="widget-body widget-empty service-error"><span>' +
    escapeHtml(cached.error || '正在更新天气…') + '</span>' + (cached.error ?
    '<button class="service-button" data-action="retry-weather" data-id="' + escapeAttr(item.id) + '">重试</button>' : '') + '</div>';
  const today = new Date().toLocaleDateString('sv-SE');
  const days = (cached.daily || []).filter(day => day.date > today).slice(0,6);
  const forecast = days.map((day,index) => '<div class="forecast-day"><span>' +
    (index===0 && !cached.error ? '明天' : '周' + ['日','一','二','三','四','五','六'][new Date(day.date+'T12:00:00').getDay()]) +
    '</span>' + weatherSymbol(day.code) + '<small>' + Math.round(day.low) + '–' + Math.round(day.high) + '°</small></div>').join('');
  const currentDay = cached.daily.find(day=>day.date===today) || cached.daily[0];
  return '<div class="widget-body weather-panel"><div class="weather-top"><div><span class="weather-city">' +
    escapeHtml(data.city || '自定义地点') + '</span><div class="weather-temp">' + Math.round(cached.temperature) +
    '<span>°</span></div></div><div class="weather-summary"><div>' + escapeHtml(weatherDescription(cached.code)) +
    weatherSymbol(cached.code) + '</div><small>最低 ' + Math.round(currentDay.low) + '° 最高 ' + Math.round(currentDay.high) +
    '°</small></div></div><div class="weather-forecast">' + forecast + '</div>' +
    serviceStamp(cached,'Open-Meteo','retry-weather',item.id) + '<a class="weather-attribution" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">天气数据：Open-Meteo · CC BY 4.0</a>' + '</div>';
}
function hotlistMarkup(item) {
  const data=item.data||{},source=sourceLinks[data.source] ? data.source : 'zhihu';
  let cached=hotCache.get(source);
  if (!cached) { cached=readServiceCache('hotlist',source)||{}; hotCache.set(source,cached); }
  const tabs=[['weibo','微博'],['zhihu','知乎'],['baidu','百度'],['yystv','游研社']].map(([id,name]) =>
    '<button type="button" data-hot-source="' + id + '" data-hot-id="' + escapeAttr(item.id) +
    '" class="' + (source===id?'selected':'') + '">' + name + '</button>').join('');
  const entries = !data.enabled ?
    '<div class="hot-empty"><strong>看看大家在关注什么</strong><button class="service-button" type="button" data-action="enable-hotlist" data-id="' +
    escapeAttr(item.id) + '">启用热搜榜</button><small>无需账号 · 首次启用后联网</small></div>' :
    cached.items?.length ? cached.items.slice(0,4).map((entry,index)=>
      '<a href="' + escapeAttr(entry.url) + '" title="' + escapeAttr(entry.title) + '" target="_blank" rel="noopener noreferrer"><b>' + (index+1) +
      '</b><span>' + escapeHtml(entry.title) + '</span><small>' + escapeHtml(entry.heat||'') + '</small></a>').join('') :
      '<div class="hot-empty"><span>' + escapeHtml(cached.error || (source === 'yystv' ? '正在获取最新文章…' : '正在获取热搜…')) + '</span>' +
      (cached.error ? '<div class="hot-recovery"><button class="service-button" data-action="retry-hotlist" data-id="' + escapeAttr(item.id) +
      '">重试</button><a href="' + sourceLinks[source] + '" target="_blank" rel="noopener noreferrer">' +
      (source === 'yystv' ? '打开游研社 ↗' : '打开榜单 ↗') + '</a></div>' : '') + '</div>';
  return '<div class="widget-body hotlist-body"><div class="hot-tabs">' + tabs + '</div><div class="hot-entries">' +
    entries + '</div>' + (data.enabled ? serviceStamp(cached,source === 'yystv' ? '游研社 RSS' : 'NewsNow','retry-hotlist',item.id) : '') + '</div>';
}

function widgetMarkup(item) {
  const featured = ['weather', 'calendar', 'holiday', 'hotlist'].includes(item.kind);
  const header = featured ? '<button type="button" aria-keyshortcuts="Shift+F10" class="widget-settings-float" data-action="widget-settings" data-id="' +
    escapeAttr(item.id) + '" aria-label="设置组件" title="设置组件">⋯</button>' :
    '<div class="widget-header"><span>' + escapeHtml(item.title) + '</span>' +
    '<button type="button" aria-keyshortcuts="Shift+F10" data-action="widget-settings" data-id="' + escapeAttr(item.id) + '" aria-label="设置组件" title="设置组件">⋯</button></div>';
  const data = item.data || {};
  let body = '';
  let theme = '';
  if (item.kind === 'calendar') {
    const { now, month, date, dayOfYear, week, lunar } = dateParts();
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const previousLast = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const dates = Array.from({ length: Math.ceil((first + last) / 7) * 7 }, (_, index) => {
      const day = index - first + 1;
      const outside = day <= 0 || day > last;
      const shown = day <= 0 ? previousLast + day : day > last ? day - last : day;
      const weekend = index % 7 === 0 || index % 7 === 6;
      return '<span class="' + (day === date ? 'today ' : '') + (outside ? 'outside ' : '') +
        (weekend ? 'weekend' : '') + '">' + shown + '</span>';
    }).join('');
    theme = ' widget-card--light widget-card--calendar';
    body = '<button type="button" class="widget-body calendar-inline calendar-open" data-action="open-calendar" title="打开月历">' +
      '<div class="calendar-summary"><div class="calendar-month">' + now.getFullYear() + '年' + month + '月</div>' +
      '<div class="calendar-big">' + date + '</div><div class="calendar-caption">第' + dayOfYear + '天 · 第' + week +
      '周<br>' + escapeHtml(lunar || weekdayNames[now.getDay()]) + '</div></div>' +
      '<div class="calendar-mini"><div class="calendar-weekdays">' +
      ['日','一','二','三','四','五','六'].map((name,index) => '<span class="' +
      (index === 0 || index === 6 ? 'weekend' : '') + '">' + name + '</span>').join('') +
      '</div><div class="calendar-days">' + dates + '</div></div></button>';
  } else if (item.kind === 'holiday') {
    theme = ' widget-card--holiday';
    const upcoming = upcomingHolidays(state.holidayYears);
    if (!upcoming.length) body = '<div class="widget-body widget-empty">下一年度假期安排待公布</div>';
    else {
      const first = upcoming[0];
      body = '<div class="widget-body holiday-body"><div class="holiday-main"><span>' + escapeHtml(first.name) +
        '还有</span><strong>' + first.days + '</strong><small>天</small><em>' + escapeHtml(first.range) + '</em></div>' +
        '<div class="holiday-next">' + upcoming.slice(1, 3).map(holiday => '<div><span>' + escapeHtml(holiday.name) +
        '<small>' + holiday.date.slice(5).replace('-', '.') + '</small></span><b>' + holiday.days +
        '天</b></div>').join('') + '</div></div>';
    }
  } else if (item.kind === 'hotlist') {
    theme = ' widget-card--hotlist';
    body = hotlistMarkup(item);
  } else if (item.kind === 'notes') {
    theme = ' widget-card--notes';
    body = '<div class="widget-body"><textarea class="notes-textarea" data-notes-id="' + escapeAttr(item.id) +
      '" aria-label="备忘录" maxlength="12000" placeholder="写点什么，自动保存在本机…">' + escapeHtml(data.text || '') + '</textarea></div>';
  } else if (item.kind === 'todo') {
    const todos = data.todos || [];
    body = '<div class="widget-body"><ul class="todo-list">' + todos.slice(0, 8).map(todo => '<li class="' + (todo.done ? 'done' : '') +
      '"><input type="checkbox" data-todo-toggle="' + escapeAttr(item.id) + '" data-todo-id="' + escapeAttr(todo.id) + '"' +
      (todo.done ? ' checked' : '') + ' aria-label="完成待办"><span>' + escapeHtml(todo.text) + '</span><button type="button" data-todo-delete="' +
      escapeAttr(item.id) + '" data-todo-id="' + escapeAttr(todo.id) + '" aria-label="删除待办">×</button></li>').join('') +
      '</ul><div class="todo-input-row"><input data-todo-input="' + escapeAttr(item.id) +
      '" maxlength="200" placeholder="添加待办，按回车"><button type="button" data-todo-add="' + escapeAttr(item.id) + '" title="添加待办">＋</button></div></div>';
  } else if (item.kind === 'countdown') {
    theme = ' widget-card--warm';
    if (data.date) {
      const target = new Date(data.date + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.round((target - today) / 86400000);
      body = '<div class="widget-body"><div class="countdown-number">' + Math.abs(days) + '<small style="font-size:16px"> 天</small></div>' +
        '<div class="countdown-caption">' + escapeHtml(data.title || '纪念日') + ' · ' + (days >= 0 ? '还有' : '已过去') + '</div></div>';
    } else {
      body = '<div class="widget-body widget-empty"><button class="inline-action" type="button" data-action="widget-settings" data-id="' + escapeAttr(item.id) + '">设置纪念日</button></div>';
    }
  } else if (item.kind === 'weather') {
    theme = ' widget-card--blue widget-card--weather';
    body = weatherMarkup(item);
  } else if (item.kind === 'clock') {
    theme = ' widget-card--light';
    body = '<div class="widget-body calendar-body"><div class="clock-widget-time" data-clock-widget>--:--:--</div><div class="calendar-small">本机时间</div></div>';
  } else if (item.kind === 'pomodoro') {
    theme = ' widget-card--warm';
    const seconds = pomodoroSeconds(item);
    body = '<div class="widget-body pomodoro-body"><div class="pomodoro-time" data-pomodoro-time="' + escapeAttr(item.id) + '">' +
      String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') +
      '</div><div class="pomodoro-actions"><button type="button" data-action="pomodoro-toggle" data-id="' + escapeAttr(item.id) + '">' +
      (data.running ? '暂停' : '开始') + '</button><button type="button" data-action="pomodoro-reset" data-id="' + escapeAttr(item.id) + '">重置</button></div></div>';
  } else if (item.kind === 'worldclock') {
    theme = ' widget-card--blue';
    body = '<div class="widget-body calendar-body"><div class="clock-widget-time" data-worldclock-id="' + escapeAttr(item.id) + '">--:--</div>' +
      '<div class="calendar-small">' + escapeHtml(data.city || data.zone || '其他时区') + '</div></div>';
  } else if (item.kind === 'quote') {
    theme = ' widget-card--light';
    body = '<div class="widget-body quote-body">“' + escapeHtml(data.text || '今天也要好好生活。') + '”</div>';
  } else if (item.kind === 'games') {
    theme = ' widget-card--games';
    body = gamesCardMarkup(escapeAttr(item.id));
  } else if (item.kind === 'calculator') {
    theme = ' widget-card--light';
    body = '<button type="button" class="widget-body local-tool-card" data-action="open-local-tool" data-id="' + escapeAttr(item.id) +
      '"><span class="local-tool-eyebrow">最近一次计算</span><strong>' + escapeHtml(data.result || '0') +
      '</strong><small>' + escapeHtml(data.expression || '点击开始计算') + '</small></button>';
  } else if (item.kind === 'timestamp') {
    theme = ' widget-card--light';
    body = '<button type="button" class="widget-body local-tool-card" data-action="open-local-tool" data-id="' + escapeAttr(item.id) +
      '"><span class="local-tool-eyebrow">当前 Unix 时间戳 · 秒</span><strong data-current-timestamp>' + Math.floor(Date.now() / 1000) +
      '</strong><small>点击转换日期与时间戳</small></button>';
  } else if (item.kind === 'converter') {
    theme = ' widget-card--light';
    const category = Object.hasOwn(unitGroups, data.category) ? data.category : 'length';
    const units = unitGroups[category].units;
    const from = Object.hasOwn(units, data.from) ? data.from : Object.keys(units)[0];
    const to = Object.hasOwn(units, data.to) ? data.to : Object.keys(units)[1];
    let result = '—';
    try { result = formatToolNumber(convertUnit(data.value ?? '1', category, from, to)); } catch { /* A saved invalid value can be repaired in the editor. */ }
    body = '<button type="button" class="widget-body local-tool-card" data-action="open-local-tool" data-id="' + escapeAttr(item.id) +
      '"><span class="local-tool-eyebrow">' + escapeHtml(unitGroups[category].label) +
      '</span><strong>' + escapeHtml(result) + ' <em>' + escapeHtml(units[to][0]) + '</em></strong><small>' +
      escapeHtml(data.value ?? '1') + ' ' + escapeHtml(units[from][0]) + ' =</small></button>';
  }
  return '<div class="widget-card' + theme + '">' + header + body + '</div><div class="tile-label">' + escapeHtml(item.title) + '</div>';
}

function weatherSymbol(code) {
  const sun='<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>';
  const cloud='<path d="M6 17a4 4 0 0 1-.6-7.95A6 6 0 0 1 17 8a4.5 4.5 0 0 1 .5 9H6Z"/>';
  const rain='<path d="m8 20-1 2m6-2-1 2m6-2-1 2"/>';
  let shape=cloud;
  if (code===0) shape=sun;
  else if ([1,2].includes(code)) shape='<path d="M5 2v2M1 6h2m6-3L8 5"/>'+cloud;
  else if ([45,48].includes(code)) shape=cloud+'<path d="M5 20h14M8 23h8"/>';
  else if ([71,73,75,77,85,86].includes(code)) shape=cloud+'<path d="M8 20v3m-1.5-1.5h3M17 20v3m-1.5-1.5h3"/>';
  else if ([95,96,99].includes(code)) shape=cloud+'<path d="m13 16-3 5h4l-2 3"/>';
  else if (![3].includes(code)) shape=cloud+rain;
  return '<svg class="weather-symbol" viewBox="0 0 24 26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+shape+'</svg>';
}
function weatherDescription(code) {
  if (code === 0) return '晴朗';
  if ([1,2,3].includes(code)) return '多云';
  if ([45,48].includes(code)) return '有雾';
  if ([71,73,75,77,85,86].includes(code)) return '有雪';
  if ([95,96,99].includes(code)) return '雷雨';
  return '有雨';
}

function itemMarkup(item) {
  const featured = item.type === 'widget' && ['weather','calendar','holiday','hotlist'].includes(item.kind);
  const wrapper = '<div class="board-item ' + escapeAttr(item.type) + (featured ? ' widget--featured' : '') + (item.type === 'folder' && item.size === 'large' ? ' folder--large' : '') +
    '" draggable="true" data-board-item="' + escapeAttr(item.id) +
    '" style="--item-w:' + (item.w || 2) + ';--item-h:' + (item.h || 2) + '">';
  if (item.type === 'shortcut') return wrapper + shortcutMarkup(item) + '</div>';
  if (item.type === 'folder') {
    return wrapper + '<button type="button" class="folder-card" aria-keyshortcuts="Shift+F10" aria-label="打开文件夹：' + escapeAttr(item.title) + '" data-action="open-folder" data-id="' + escapeAttr(item.id) + '">' +
      (item.children.length ? item.children.slice(0, 4).map(child => iconMarkup(child, true)).join('') : '<span class="folder-empty">空文件夹</span>') +
      '</button><div class="tile-label">' + escapeHtml(item.title) + '</div></div>';
  }
  return wrapper + widgetMarkup(item) + '</div>';
}

async function hydrateImages(root = document, force = false) {
  await Promise.all([...root.querySelectorAll('[data-site-icon]')].map(async element => {
    const img=element.querySelector('img');
    const url=element.dataset.assetId ? await getImageUrl(element.dataset.assetId).catch(()=> '') :
      await resolveSiteIcon(element.dataset.siteIcon,force,element.dataset.iconKey);
    if (img?.isConnected && url) img.src=url;
  }));
}

function renderBoard() {
  const group = getActiveGroup(state);
  const board = $('#board');
  const visible = group.items.filter(item => !item.hidden);
  if (state.appearance.layoutMode === 'organized') {
    board.className = 'board board--organized';
    const sections = [
      ['featured', visible.filter(item => item.type === 'widget' && ['weather','calendar','holiday','hotlist'].includes(item.kind))],
      ['shortcuts', visible.filter(item => item.type === 'shortcut' || item.type === 'folder')],
      ['tools', visible.filter(item => item.type === 'widget' && !['weather','calendar','holiday','hotlist'].includes(item.kind))]
    ];
    board.innerHTML = sections.filter(([,items]) => items.length).map(([kind,items]) =>
      '<div class="board-section board-section--' + kind + '">' + items.map(itemMarkup).join('') + '</div>').join('');
  } else {
    board.className = 'board board--free';
    board.innerHTML = visible.map(itemMarkup).join('');
  }
  hydrateImages();
  updateGrid();
  updateClock();
  refreshWeatherWidgets();
  refreshHotlistWidgets();
}

async function applyWallpaper() {
  const version = ++paperVersion;
  const element = $('#wallpaper');
  element.className = 'wallpaper';
  element.style.backgroundImage = '';
  element.style.backgroundColor = '';
  wallpaperLuminance = state.wallpaper.kind === 'local' ? 0.25 :
    ['mist','ivory','peach','sage','lavender','sky'].includes(state.wallpaper.id) ? 0.82 : 0.2;
  wallpaperLabelLuminance = wallpaperLuminance;
  applyAppearance();
  if (state.wallpaper.kind === 'local') {
    const url = await getImageUrl(state.wallpaper.assetId).catch(() => '');
    if (version !== paperVersion) return;
    if (url) {
      element.classList.add('wallpaper--local'); element.style.backgroundImage = 'url("' + url + '")';
      try {
        const blob = await getImage(state.wallpaper.assetId);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const width = bitmap.width * scale, height = bitmap.height * scale;
        context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        bitmap.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const sample = (left, top, right, bottom) => {
          let total = 0, count = 0;
          for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
            const index = (y * canvas.width + x) * 4;
            total += (pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722) / 255;
            count++;
          }
          return total / count;
        };
        if (version === paperVersion) {
          wallpaperLuminance = sample(12, 1, 28, 8);
          wallpaperLabelLuminance = sample(6, 9, 34, 22);
          updatePageColors();
        }
      } catch { /* Keep a high contrast light text fallback for unreadable image formats. */ }
      return;
    }
  }
  const id = presetNames[state.wallpaper.id] ? state.wallpaper.id : 'mist';
  element.classList.add('wallpaper--' + id);
  if (solidColors[id]) element.style.backgroundColor = solidColors[id];
  wallpaperLuminance = ['mist','ivory','peach','sage','lavender','sky'].includes(id) ? 0.82 : 0.2;
  wallpaperLabelLuminance = wallpaperLuminance;
  updatePageColors();
}

function updatePageColors() {
  const lightBackground = wallpaperLuminance * (1 - state.appearance.wallpaperDim) > 0.54;
  const lightLabels = wallpaperLabelLuminance * (1 - state.appearance.wallpaperDim) > 0.54;
  const color = lightBackground ? '#26394b' : '#ffffff';
  document.body.classList.toggle('light-wallpaper', lightBackground);
  const mode = state.appearance.clockMode || (state.appearance.autoText ? 'auto' : 'custom');
  const clockColor = mode === 'auto' ? color : mode === 'dark' ? '#26394b' :
    mode === 'light' ? '#ffffff' : state.appearance.clockColor;
  const channels = clockColor.slice(1).match(/../g).map(value => parseInt(value, 16));
  const clockIsDark = (channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722) < 135;
  document.body.style.setProperty('--page-text-color', color);
  document.body.style.setProperty('--clock-text-color', clockColor);
  document.body.style.setProperty('--clock-text-shadow', state.appearance.clockShadow > 0 ?
    '0 1px ' + state.appearance.clockShadow + 'px ' + (clockIsDark ? '#ffffffc9' : '#102133c9') : 'none');
  document.body.style.setProperty('--tile-label-color', state.appearance.adaptiveLabels ?
    (lightLabels ? '#26394b' : '#ffffff') : '#ffffff');
  document.body.style.setProperty('--tile-label-shadow', lightLabels && state.appearance.adaptiveLabels ?
    'none' : '0 1px 3px #253c5655');
}

function applyAppearance() {
  document.body.classList.toggle('focus-mode', state.appearance.focus);
  document.body.classList.toggle('compact', state.appearance.compact);
  document.body.classList.toggle('hide-labels', !state.appearance.showLabels);
  document.body.classList.toggle('hide-search', !state.appearance.showSearch);
  document.body.classList.toggle('hide-clock', !state.appearance.showClock);
  document.body.classList.toggle('icon-circle', state.appearance.iconShape === 'circle');
  document.body.style.setProperty('--search-height', state.appearance.searchHeight + 'px');
  document.body.style.setProperty('--search-radius', state.appearance.searchRadius + 'px');
  document.body.style.setProperty('--search-opacity', state.appearance.searchOpacity);
  document.body.style.setProperty('--icon-size', state.appearance.iconSize + 'px');
  document.body.style.setProperty('--icon-radius', state.appearance.iconRadius + 'px');
  document.body.style.setProperty('--icon-opacity', state.appearance.iconOpacity);
  document.body.style.setProperty('--icon-gap', state.appearance.iconGap + 'px');
  document.body.style.setProperty('--label-size', state.appearance.labelSize + 'px');
  document.body.style.setProperty('--clock-size', state.appearance.clockSize + 'px');
  document.body.style.setProperty('--clock-color', state.appearance.clockColor);
  document.body.style.setProperty('--wallpaper-dim', state.appearance.wallpaperDim);
  updatePageColors();
  document.body.classList.toggle('clock-bold', state.appearance.clockBold);
  document.body.classList.toggle('adaptive-labels',state.appearance.adaptiveLabels);
  document.body.style.setProperty('--board-width',state.appearance.boardWidth + 'px');
  updateGrid();
  $('#bottomQuote').hidden = !state.appearance.showQuote;
  $('#bottomQuote').textContent = state.quote && state.quote !== '把常用的，留在眼前。' ? state.quote : tabQuote;
}

function updateGrid() {
  const board=$('#board'); if (!board) return;
  const width=board.getBoundingClientRect().width;
  const gap=state.appearance.compact ? 16 : state.appearance.iconGap;
  const fit=Math.max(4,Math.floor((width+gap)/(state.appearance.iconSize+gap)));
  const columns=innerWidth<=760 ? 4 : Math.max(4,Math.min(state.appearance.iconColumns,Math.floor(fit/4)*4));
  const widgetColumns = innerWidth <= 760 ? 3 : width < 1050 ? 6 : 12;
  board.style.setProperty('--grid-columns',columns);
  board.style.setProperty('--widget-columns',widgetColumns);
  board.style.setProperty('--grid-gap',gap+'px');
  board.style.setProperty('--grid-row',Math.max(70,state.appearance.iconSize+20)+'px');
  board.querySelectorAll('.board-item.widget').forEach(node => {
    const item = findItem(node.dataset.boardItem)?.item;
    if (!item) return;
    const widthUnits = [2,3,4,6,12].includes(Number(item.w)) ? Number(item.w) : 2;
    node.style.gridColumn = 'span ' + (state.appearance.layoutMode === 'organized' ?
      Math.min(widthUnits,widgetColumns) : Math.min(columns,Math.max(1,Math.round(widthUnits * columns / 12))));
    node.style.gridRow = 'span ' + Math.min(4, Math.max(2, Number(item.h) || 2));
  });
}
window.addEventListener('resize',updateGrid);
function render() {
  renderGroups(); renderEngines(); renderBoard(); applyWallpaper(); applyAppearance();
}

function refreshWidgetView(id) {
  const item=findItem(id)?.item;
  const node=[...document.querySelectorAll('[data-board-item]')].find(node=>node.dataset.boardItem===id);
  if (node && item?.type==='widget') node.innerHTML=widgetMarkup(item);
}
async function refreshWeatherWidgets(forceId = '') {
  const widgets=getActiveGroup(state).items.filter(item=>item.kind==='weather'&&item.data.enabled&&!item.hidden);
  for (const widget of widgets) {
    const key=weatherKey(widget.data);
    let cached=weatherCache.get(widget.id);
    if (cached?.key!==key) cached={...(readServiceCache('weather',key)||{}),key};
    if (cached.loading || (!forceId && Date.now()-(cached.checkedAt||cached.time||0)<30*60000)) continue;
    if (forceId && widget.id!==forceId) continue;
    cached={...cached,loading:true,error:''}; weatherCache.set(widget.id,cached); refreshWidgetView(widget.id);
    try {
      if (globalThis.chrome?.permissions?.contains && !await chrome.permissions.contains({origins:['https://api.open-meteo.com/*']}))
        throw new Error('请在设置中授权天气查询');
      const fresh=await fetchWeather(widget.data);
      if (weatherKey(widget.data)===key) weatherCache.set(widget.id,{...fresh,key,loading:false});
    } catch(error) {
      if (weatherKey(widget.data)===key) weatherCache.set(widget.id,{...cached,loading:false,checkedAt:Date.now(),
        error:error.message.includes('授权')?error.message:'天气暂时不可用'});
    }
    refreshWidgetView(widget.id);
  }
}
async function refreshHotlistWidgets(forceSource = '') {
  const widgets=getActiveGroup(state).items.filter(item=>item.kind==='hotlist'&&item.data.enabled&&!item.hidden);
  for (const widget of widgets) {
    const source=widget.data.source||'zhihu';
    const cached=hotCache.get(source)||readServiceCache('hotlist',source)||{};
    if (cached.loading || (!forceSource && Date.now()-(cached.checkedAt||cached.time||0)<10*60000)) continue;
    if (forceSource && source!==forceSource) continue;
    hotCache.set(source,{...cached,loading:true,error:''}); refreshWidgetView(widget.id);
    try {
      if (globalThis.chrome?.permissions?.contains && !await chrome.permissions.contains({origins:[hotPermission(source)]}))
        throw new Error('请在设置中授权热搜榜');
      hotCache.set(source,{...await fetchHotlist(source),loading:false});
    } catch(error) {
      hotCache.set(source,{...cached,loading:false,checkedAt:Date.now(),
        error:error.message.includes('授权')?error.message:
          (source === 'yystv' ? '游研社最新文章暂时不可用' : '热搜暂时不可用，可切换榜单')});
    }
    for (const item of getActiveGroup(state).items.filter(item=>item.kind==='hotlist'&&item.data.source===source))
      refreshWidgetView(item.id);
  }
}

render();
setInterval(updateClock, 1000);
setInterval(() => {
  if (document.visibilityState === 'visible' && !document.activeElement?.matches('textarea, input')) { renderBoard(); updateClock(); }
}, 10 * 60 * 1000);

function openModal(title, content, wide = false) {
  if ($('#modalBackdrop').hidden) {
    const active = document.activeElement;
    modalReturnFocus = active?.closest?.('#contextMenu') && contextMenuReturnFocus ?
      contextMenuReturnFocus : focusReference(active);
  }
  $('#contextMenu').hidden = true;
  currentEditorCleanup?.(); currentEditorCleanup=null;
  const modal = $('#modal');
  modal.className = 'modal' + (wide ? ' modal--wide' : '');
  modal.innerHTML = '<div class="modal-header"><h2 id="modalTitle">' + escapeHtml(title) +
    '</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="关闭">×</button></div>' + content;
  $('#modalBackdrop').hidden = false;
  hydrateImages(modal);
  modal.querySelector('input:not([type=file]), textarea, button')?.focus();
}

function closeModal() {
  currentEditorCleanup?.(); currentEditorCleanup=null; pendingBackup=null; pendingWeatherLocation=null;
  $('#modalBackdrop').hidden = true; $('#modal').innerHTML = '';
  const returnFocus = modalReturnFocus;
  modalReturnFocus = null;
  if (returnFocus) restoreFocus(returnFocus);
}

function openGames(id, game) {
  const item = findItem(id)?.item;
  if (item?.kind !== 'games') return;
  openModal(item.title || '小游戏', '<div id="gameRoom"></div>', true);
  $('#modal').classList.add('game-modal');
  let saves = Promise.resolve();
  currentEditorCleanup = mountGames($('#gameRoom'), item.data, game, data => {
    const current = findItem(id)?.item;
    if (current?.kind !== 'games') return;
    current.data = data;
    saves = saves.then(() => persist());
  });
}

function openLocalTool(id) {
  const item = findItem(id)?.item;
  if (!item || !['calculator', 'timestamp', 'converter'].includes(item.kind)) return;
  if (item.kind === 'calculator') {
    const keys = ['C', '(', ')', '⌫', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+', '='];
    openModal('计算器', '<div id="localToolContent" class="tool-dialog"><label class="tool-label" for="calcExpression">算式</label>' +
      '<input id="calcExpression" class="tool-expression" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="120" value="' +
      escapeAttr(item.data.expression || '') + '" placeholder="例如 12.5 × (8 + 2)">' +
      '<div id="calcResult" class="tool-result" role="status">' + escapeHtml(item.data.result || '0') + '</div>' +
      '<div class="calculator-keys">' + keys.map(key => '<button type="button" data-calc-key="' + escapeAttr(key) +
      '" class="' + (key === '=' ? 'equals' : '') + '">' + escapeHtml(key) + '</button>').join('') + '</div>' +
      '<p>支持加、减、乘、除、括号和百分号；按 Enter 计算。</p></div>');
    const input = $('#calcExpression'), output = $('#calcResult');
    async function solve() {
      try {
        const value = calculate(input.value);
        output.textContent = formatToolNumber(value);
        output.classList.remove('tool-error');
        item.data = { expression: input.value.slice(0, 120), result: String(value) };
        await persist(); refreshWidgetView(item.id);
      } catch (error) { output.textContent = error.message; output.classList.add('tool-error'); }
    }
    $('#localToolContent').addEventListener('click', event => {
      const key = event.target.closest('[data-calc-key]')?.dataset.calcKey;
      if (!key) return;
      if (key === '=') { solve(); return; }
      if (key === 'C') input.value = '';
      else if (key === '⌫') input.value = input.value.slice(0, -1);
      else input.value += key;
      input.focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); solve(); }
    });
    return;
  }
  if (item.kind === 'timestamp') {
    const now = new Date();
    const localInput = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openModal('时间戳转换', '<div id="localToolContent" class="tool-dialog"><div class="timestamp-now">当前 Unix 时间戳 <strong data-live-timestamp>' +
      Math.floor(now.getTime() / 1000) + '</strong><button class="button" type="button" data-copy-tool="live">复制</button></div>' +
      '<div class="field"><label for="timestampValue">时间戳转日期</label><div class="tool-inline"><input id="timestampValue" inputmode="numeric" value="' +
      Math.floor(now.getTime() / 1000) + '"><select id="timestampUnit" aria-label="时间戳单位"><option value="s">秒</option><option value="ms">毫秒</option></select></div>' +
      '<div id="timestampDateResult" class="tool-output" role="status"></div></div>' +
      '<div class="field"><label for="dateTimeValue">本地日期转时间戳</label><input id="dateTimeValue" type="datetime-local" value="' + localInput + '">' +
      '<div class="tool-inline"><div id="dateTimestampResult" class="tool-output" role="status"></div><button class="button" type="button" data-copy-tool="date">复制</button></div></div>' +
      '<p>按本机时区转换；1970 年以前的时间戳可以为负数。</p></div>');
    const update = () => {
      try {
        const date = parseTimestamp($('#timestampValue').value, $('#timestampUnit').value);
        $('#timestampDateResult').textContent = date.toLocaleString('zh-CN', { hour12: false });
        $('#timestampDateResult').classList.remove('tool-error');
      } catch (error) { $('#timestampDateResult').textContent = error.message; $('#timestampDateResult').classList.add('tool-error'); }
      const date = new Date($('#dateTimeValue').value);
      $('#dateTimestampResult').textContent = Number.isNaN(date.getTime()) ? '请选择有效日期' :
        Math.floor(date.getTime() / 1000) + ' 秒 · ' + date.getTime() + ' 毫秒';
    };
    $('#localToolContent').addEventListener('input', update);
    $('#localToolContent').addEventListener('change', update);
    $('#localToolContent').addEventListener('click', async event => {
      const type = event.target.closest('[data-copy-tool]')?.dataset.copyTool;
      if (!type) return;
      const value = type === 'live' ? String(Math.floor(Date.now() / 1000)) :
        String(Math.floor(new Date($('#dateTimeValue').value).getTime() / 1000));
      if (value === 'NaN') { toast('请选择有效日期'); return; }
      try { await navigator.clipboard.writeText(value); toast('已复制时间戳'); }
      catch { toast('复制失败，请手动选中数字'); }
    });
    update();
    return;
  }
  const data = item.data || {};
  const category = Object.hasOwn(unitGroups, data.category) ? data.category : 'length';
  const groupOptions = Object.entries(unitGroups).map(([key, group]) =>
    '<option value="' + key + '"' + (key === category ? ' selected' : '') + '>' + group.label + '</option>').join('');
  openModal('单位换算', '<div id="localToolContent" class="tool-dialog"><div class="field"><label for="unitCategory">类别</label><select id="unitCategory">' +
    groupOptions + '</select></div><div class="tool-inline"><div class="field"><label for="unitValue">数值</label><input id="unitValue" type="number" step="any" value="' +
    escapeAttr(data.value ?? '1') + '"></div><div class="field"><label for="unitFrom">从</label><select id="unitFrom"></select></div>' +
    '<button class="button tool-swap" type="button" id="unitSwap" title="交换单位">⇄</button><div class="field"><label for="unitTo">到</label><select id="unitTo"></select></div></div>' +
    '<div id="unitResult" class="tool-result" role="status"></div><div class="modal-actions"><button class="button button--primary" type="button" id="unitSave">保存到卡片</button></div>' +
    '<p>长度、质量、面积、体积、温度、速度、时间和数据大小均在本机换算。</p></div>');
  const categoryInput = $('#unitCategory'), fromInput = $('#unitFrom'), toInput = $('#unitTo'), valueInput = $('#unitValue'), result = $('#unitResult');
  const refreshUnits = (preferredFrom, preferredTo) => {
    const units = unitGroups[categoryInput.value].units;
    const options = Object.entries(units).map(([key, entry]) => '<option value="' + key + '">' + escapeHtml(entry[0]) + '</option>').join('');
    fromInput.innerHTML = options; toInput.innerHTML = options;
    fromInput.value = Object.hasOwn(units, preferredFrom) ? preferredFrom : Object.keys(units)[0];
    toInput.value = Object.hasOwn(units, preferredTo) ? preferredTo : Object.keys(units)[1];
    preview();
  };
  const preview = () => {
    try {
      const converted = convertUnit(valueInput.value, categoryInput.value, fromInput.value, toInput.value);
      result.textContent = formatToolNumber(converted) + ' ' + unitGroups[categoryInput.value].units[toInput.value][0];
      result.classList.remove('tool-error');
    } catch (error) { result.textContent = error.message; result.classList.add('tool-error'); }
  };
  categoryInput.addEventListener('change', () => refreshUnits());
  $('#localToolContent').addEventListener('input', preview);
  $('#localToolContent').addEventListener('change', preview);
  $('#unitSwap').addEventListener('click', () => { [fromInput.value, toInput.value] = [toInput.value, fromInput.value]; preview(); });
  $('#unitSave').addEventListener('click', async () => {
    try { convertUnit(valueInput.value, categoryInput.value, fromInput.value, toInput.value); }
    catch (error) { toast(error.message); return; }
    item.data = { category: categoryInput.value, from: fromInput.value, to: toInput.value, value: valueInput.value };
    await persist(); refreshWidgetView(item.id); closeModal(); toast('换算已保存到卡片');
  });
  refreshUnits(data.from, data.to);
}

function openWidgetChooser() {
  openModal('添加组件', '<div class="choice-grid">' + Object.entries(widgetNames).map(([kind, name]) =>
    '<button class="choice" type="button" data-add-widget="' + kind + '"><span class="choice-symbol">' +
    ({ weather: '☀', calendar: '▣', holiday: '◈', hotlist: '♨', notes: '✎', todo: '☑', countdown: '⌛', clock: '◷', pomodoro: '◉', worldclock: '◴', quote: '❝', calculator: '＋', timestamp: '⌚', converter: '⇄', games: '♟' }[kind]) + '</span>' +
    escapeHtml(name) + '</button>').join('') + '</div>');
}

async function addWidget(kind) {
  if (!widgetNames[kind]) return;
  if (getActiveGroup(state).items.length >= 500) { toast('当前分组最多放 500 个内容'); return; }
  const item = { id: makeId(), type: 'widget', kind, title: widgetNames[kind], w: ['weather','calendar','holiday','hotlist','games'].includes(kind) ? 3 : 2, h: 2, data: {} };
  if (kind === 'weather') item.data = { enabled: false, city: '', latitude: '', longitude: '' };
  if (kind === 'hotlist') item.data = { enabled: false, source: 'zhihu' };
  if (kind === 'countdown') item.data = { title: '', date: '' };
  if (kind === 'notes') item.data = { text: '' };
  if (kind === 'todo') item.data = { todos: [] };
  if (kind === 'pomodoro') item.data = { duration: 25, remaining: 1500, endsAt: 0, running: false };
  if (kind === 'worldclock') item.data = { zone: 'Asia/Shanghai', city: '北京时间' };
  if (kind === 'quote') item.data = { text: '今天也要好好生活。' };
  if (kind === 'calculator') item.data = { expression: '', result: '' };
  if (kind === 'converter') item.data = { category: 'length', from: 'm', to: 'km', value: '1' };
  if (kind === 'games') item.data = normalizeGames();
  getActiveGroup(state).items.push(item);
  await persist(); render(); closeModal();
  if (['weather', 'hotlist', 'countdown', 'worldclock', 'quote'].includes(kind)) openWidgetEditor(item.id);
  else if (kind === 'games') toast('小游戏已添加，点击卡片选择游戏');
  else if (['calculator', 'timestamp', 'converter'].includes(kind)) openLocalTool(item.id);
  else toast('组件已添加');
}

function openShortcutEditor(id = '', folderId = '') {
  const found = id ? findItem(id) : null;
  const item = found?.item;
  if (id && item?.type !== 'shortcut') return;
  const parent = folderId ? findItem(folderId)?.item : found?.parent;
  const context = parent ? '<p>保存到文件夹「' + escapeHtml(parent.title) + '」</p>' : '';
  openModal(item ? '编辑网址' : '添加网址', context + '<form id="shortcutForm">' +
    '<div class="field"><label for="shortcutTitle">名称</label><input id="shortcutTitle" name="title" maxlength="80" required value="' + escapeAttr(item?.title || '') + '" placeholder="例如：我的网站"></div>' +
    '<div class="field"><label for="shortcutUrl">网址</label><input id="shortcutUrl" name="url" maxlength="2048" required value="' + escapeAttr(item?.url || '') + '" placeholder="https://example.com"></div>' +
    '<div id="iconEditorPreview" class="icon-editor-preview">' + iconMarkup(item || {url:'',title:''}) + '</div>' +
    '<p>优先使用精选本地图标和配套底色。新增网站时选择图库图标可填入对应官网，也可上传自己的图片。</p>' +
    '<div class="field"><label for="iconKey">本地图标库</label><select id="iconKey" name="iconKey"><option value="">推荐（按网址匹配）</option>' +
    [['extra','常用网站']].map(([group,label])=>'<optgroup label="'+label+'">'+iconCatalog.filter(icon=>icon.group===group).map(icon=>'<option value="'+icon.id+'"'+(item?.iconKey===icon.id?' selected':'')+'>'+escapeHtml(icon.name)+'</option>').join('')+'</optgroup>').join('') + '</select><span class="field-hint" id="iconSourceHint"></span></div>' +
    '<details class="icon-picker"><summary>浏览本地图标（'+iconCatalog.length+' 项）</summary><input id="iconLibrarySearch" type="search" placeholder="搜索图标名称或域名" aria-label="搜索本地图标"><div id="iconLibraryGrid" class="icon-picker-grid"></div></details>' +
    '<div class="field"><label for="shortcutImage">自定义图标图片</label><input id="shortcutImage" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/avif"><span class="field-hint">图片只保存在这台设备。留空则保持原图标。</span></div>' +
    '<div class="form-grid"><div class="field"><label for="iconFit">图标显示</label><select id="iconFit" name="iconFit">' +
    [['auto','推荐'],['contain','完整显示'],['cover','铺满方块']].map(([value,label])=>'<option value="'+value+'"'+((item?.iconFit||'auto')===value?' selected':'')+'>'+label+'</option>').join('') +
    '</select></div><div class="field"><label for="iconScale">图标缩放 <output id="iconScaleValue"></output></label><input id="iconScale" name="iconScale" type="range" min=".6" max="1.4" step=".05" value="'+(item?.iconScale||1)+'"></div></div>' +
    '<div class="field"><label for="iconBackground">图标底色</label><select id="iconBackground" name="iconBackground">' +
    [['auto','推荐底色'],['transparent','透明'],['#ffffff','白色'],['#eef3f7','浅灰'],['#18222f','深色']].map(([value,label])=>'<option value="'+value+'"'+((item?.iconBackground||'auto')===value?' selected':'')+'>'+label+'</option>').join('') + '</select></div>' +
    '<button type="button" class="button" id="refreshIconButton">重新获取网页图标</button>' +
    (item?.assetId ? '<label class="setting-row"><span>移除自定义图标</span><input name="removeImage" type="checkbox"></label>' : '') +
    '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button><button class="button button--primary" type="submit">保存网址</button></div></form>');
  let draftObjectUrl='';
  const editorForm=$('#shortcutForm');
  let suggestedUrl = '';
  let suggestedTitle = '';
  const updateIconPreview=() => {
    const remove=field(editorForm,'removeImage')?.checked;
    const draft={...item,url:normalizeUrl(field(editorForm,'url').value),assetId:draftObjectUrl?'preview':remove?'':item?.assetId,iconKey:field(editorForm,'iconKey').value,
      iconFit:field(editorForm,'iconFit').value,iconScale:Number(field(editorForm,'iconScale').value),
      iconBackground:field(editorForm,'iconBackground').value};
    $('#iconScaleValue').textContent=Math.round(draft.iconScale*100)+'%';
    const matched=iconSpec(draft.url,draft.iconKey);
    const matchedEntry = iconCatalog.find(icon => icon.id === matched.id);
    $('#iconSourceHint').textContent=draftObjectUrl || draft.assetId ? '当前使用你的自定义图片' : matched.id ? '本地图标 · '+matched.name+(matchedEntry?.domains?.length ? ' · '+matchedEntry.domains[0] : ' · 请手动填写网址') : '图库未匹配，尝试读取浏览器图标';
    const preview=$('#iconEditorPreview');
    preview.innerHTML=iconMarkup(draft);
    if (draftObjectUrl) preview.querySelector('img').src=draftObjectUrl;
    else hydrateImages(preview);
  };
  editorForm.addEventListener('input',updateIconPreview);
  $('#iconKey').addEventListener('change',()=>{
    const chosen = iconCatalog.find(icon => icon.id === field(editorForm,'iconKey').value);
    if (!item && chosen?.domains?.length) {
      const titleField = field(editorForm,'title');
      const urlField = field(editorForm,'url');
      if (!titleField.value.trim() || titleField.value === suggestedTitle) {
        titleField.value = chosen.name; suggestedTitle = chosen.name;
      }
      if (!urlField.value.trim() || urlField.value === suggestedUrl) {
        urlField.value = 'https://' + chosen.domains[0] + (chosen.pathPrefix || '/');
        suggestedUrl = urlField.value;
      }
    }
    if (field(editorForm,'removeImage')) field(editorForm,'removeImage').checked=true;
    field(editorForm,'image').value='';
    if(draftObjectUrl) { URL.revokeObjectURL(draftObjectUrl); draftObjectUrl=''; }
    field(editorForm,'iconFit').value='auto';field(editorForm,'iconScale').value='1';field(editorForm,'iconBackground').value='auto';
    updateIconPreview();
  });
  const renderIconLibrary=()=>{
    const query=$('#iconLibrarySearch').value.trim().toLocaleLowerCase();
    $('#iconLibraryGrid').innerHTML=iconCatalog.filter(icon=>(icon.name+' '+icon.domains.join(' ')).toLocaleLowerCase().includes(query)).map(icon=>
      '<button type="button" class="icon-picker-option" data-pick-icon="'+icon.id+'" title="'+escapeAttr(icon.name)+'">'+iconMarkup({url:'',iconKey:icon.id})+'<span>'+escapeHtml(icon.name)+'</span></button>').join('');
  };
  $('.icon-picker').addEventListener('toggle',event=>{if(event.currentTarget.open)renderIconLibrary();});
  $('#iconLibrarySearch').addEventListener('input',renderIconLibrary);
  $('#iconLibraryGrid').addEventListener('click',event=>{
    const button=event.target.closest('[data-pick-icon]');if(!button)return;
    $('#iconKey').value=button.dataset.pickIcon;
    $('#iconKey').dispatchEvent(new Event('change'));
  });
  $('#shortcutImage').addEventListener('change',event=>{
    if (draftObjectUrl) URL.revokeObjectURL(draftObjectUrl);
    draftObjectUrl=event.target.files[0]?URL.createObjectURL(event.target.files[0]):'';
    updateIconPreview();
  });
  currentEditorCleanup=()=>{if(draftObjectUrl) URL.revokeObjectURL(draftObjectUrl);};
  updateIconPreview();
  $('#refreshIconButton').addEventListener('click',async () => {
    const url=normalizeUrl($('#shortcutUrl').value);
    if (!url) { toast('请先填写网址'); return; }
    const chosen=iconSpec(url,field(editorForm,'iconKey').value);
    if(chosen.id) { updateIconPreview(); toast('当前使用本地图标：'+chosen.name+'，可在图库中切换'); return; }
    const result=await resolveSiteIcon(url,true); await hydrateImages(document,true);
    toast(result==='fallback-icon.svg'?'Edge 暂无这个图标，可访问网站后重试或上传图片':'网页图标已更新');
  });
  $('#shortcutForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const url = normalizeUrl(field(form, 'url').value);
    if (!url) { toast('请输入 http 或 https 网址'); return; }
    const title = cleanText(field(form, 'title').value, 80);
    if (!title) { toast('请填写名称'); return; }
    const next = item || { id: makeId(), type: 'shortcut', assetId: '' };
    next.title = title; next.url = url;
    next.iconKey=field(form,'iconKey').value;
    next.iconFit=field(form,'iconFit').value; next.iconScale=Number(field(form,'iconScale').value); next.iconBackground=field(form,'iconBackground').value;
    next.emoji = '';
    next.color = '#eef2f6';
    if (field(form, 'removeImage')?.checked) next.assetId = '';
    const file = field(form, 'image').files?.[0];
    if (file) {
      try { next.assetId = await putImage(file); }
      catch (error) { toast(error.message); return; }
    }
    if (!item) {
      if (parent?.type === 'folder') {
        if (parent.children.length >= 300) { toast('文件夹最多放 300 个网址'); return; }
        parent.children.push(next);
      } else {
        if (getActiveGroup(state).items.length >= 500) { toast('当前分组最多放 500 个内容'); return; }
        getActiveGroup(state).items.push(next);
      }
    }
    await persist(); render(); closeModal(); toast('网址已保存');
  });
}

function openFolderEditor(id = '') {
  const item = id ? findItem(id)?.item : null;
  if (id && item?.type !== 'folder') return;
  openModal(item ? '编辑文件夹' : '添加文件夹', '<form id="folderForm"><div class="field"><label for="folderName">文件夹名称</label>' +
    '<input id="folderName" name="name" maxlength="80" required value="' + escapeAttr(item?.title || '') + '" placeholder="例如：常用网站"></div>' +
    '<div class="field"><label for="folderSize">文件夹大小</label><select id="folderSize" name="size"><option value="small">普通图标</option><option value="large"' + (item?.size==='large'?' selected':'') + '>大文件夹（2×2）</option></select></div>' +
    '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button><button class="button button--primary" type="submit">保存</button></div></form>');
  $('#folderForm').addEventListener('submit', async event => {
    event.preventDefault();
    const title = cleanText(field(event.currentTarget, 'name').value, 80);
    if (!title) return;
    if (!item && getActiveGroup(state).items.length >= 500) { toast('当前分组最多放 500 个内容'); return; }
    const size=field(event.currentTarget,'size').value;
    if (item) { item.title = title; item.size=size; }
    else getActiveGroup(state).items.push({ id: makeId(), type: 'folder', title, size, children: [] });
    await persist(); render(); closeModal(); toast('文件夹已保存');
  });
}

function openFolder(id) {
  const folder = findItem(id)?.item;
  if (folder?.type !== 'folder') return;
  openModal(folder.title, '<div class="folder-dialog-grid">' + folder.children.map(item => shortcutMarkup(item, true)).join('') +
    '</div><div class="modal-actions"><button class="button" type="button" data-action="edit-folder" data-id="' + escapeAttr(id) + '">文件夹设置</button>' +
    '<button class="button button--primary" type="button" data-action="add-folder-shortcut" data-id="' + escapeAttr(id) + '">＋ 添加网址</button></div>', true);
}

function openGroupEditor(id = '') {
  const group = id ? state.groups.find(group => group.id === id) : null;
  openModal(group ? '编辑分组' : '添加分组', '<form id="groupForm"><div class="field"><label for="groupName">分组名称</label>' +
    '<input id="groupName" name="name" maxlength="40" required value="' + escapeAttr(group?.name || '') + '" placeholder="例如：工作"></div>' +
    '<div class="modal-actions">' + (group && state.groups.length > 1 ? '<button class="button button--danger" type="button" data-action="delete-group" data-id="' + escapeAttr(group.id) + '" style="margin-right:auto">删除分组</button>' : '') +
    '<button class="button" type="button" data-action="close-modal">取消</button><button class="button button--primary" type="submit">保存</button></div></form>');
  $('#groupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const name = cleanText(field(event.currentTarget, 'name').value, 40);
    if (!name) return;
    if (!group && state.groups.length >= 30) { toast('最多创建 30 个分组'); return; }
    if (group) group.name = name;
    else { const created = { id: makeId(), name, items: [] }; state.groups.push(created); state.activeGroupId = created.id; }
    await persist(); render(); closeModal(); toast('分组已保存');
  });
}

function openWidgetEditor(id) {
  const item = findItem(id)?.item;
  if (item?.type !== 'widget') return;
  let fields = '<div class="field"><label for="widgetTitle">组件名称</label><input id="widgetTitle" name="title" maxlength="80" value="' + escapeAttr(item.title) + '"></div>';
  fields += '<div class="form-grid"><div class="field"><label for="widgetWidth">卡片宽度</label><select id="widgetWidth" name="width">' +
    [[2,'窄'],[3,'标准'],[4,'宽'],[6,'半行'],[12,'整行']].map(([value,label]) => '<option value="' + value + '"' +
      (item.w === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="widgetHeight">卡片高度</label><select id="widgetHeight" name="height">' +
    [[2,'标准'],[3,'较高'],[4,'最高']].map(([value,label]) => '<option value="' + value + '"' +
      (item.h === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div></div>';
  if (item.kind === 'countdown') {
    fields += '<div class="field"><label for="eventName">事件名称</label><input id="eventName" name="eventName" maxlength="80" value="' + escapeAttr(item.data.title || '') + '" placeholder="例如：生日"></div>' +
      '<div class="field"><label for="eventDate">日期</label><input id="eventDate" name="eventDate" type="date" value="' + escapeAttr(item.data.date || '') + '"></div>';
  }
  if (item.kind === 'weather') {
    fields += '<div class="field"><label for="cityPreset">选择城市</label><select id="cityPreset"><option value="">选择常用城市，或展开下方自定义坐标</option>' +
      cities.map(([name,lat,lon],index)=>'<option value="'+index+'"'+(Number(item.data.latitude)===lat&&Number(item.data.longitude)===lon?' selected':'')+'>'+name+'</option>').join('') +
      '</select><span class="field-hint">使用城市中心位置查询天气，无需精确定位。</span></div>' +
      '<div class="setting-buttons"><button class="button" type="button" data-action="locate-weather" data-id="' +
      escapeAttr(item.id) + '">使用当前位置</button></div><p class="field-hint">定位只在你确认后读取；发送给天气服务前会把坐标取整到 0.1°。</p>' +
      '<p>启用后向 Open-Meteo 查询所选城市的天气。</p>' +
      '<label class="setting-row"><span>启用天气查询</span><input name="weatherEnabled" type="checkbox"' + (item.data.enabled ? ' checked' : '') + '></label>' +
      '<details class="coordinate-details"><summary>自定义城市与坐标</summary><div class="field"><label for="weatherCity">显示的城市名称</label><input id="weatherCity" name="city" maxlength="80" value="' + escapeAttr(item.data.city || '') + '" placeholder="例如：上海"></div>' +
      '<div class="form-grid"><div class="field"><label for="weatherLat">纬度</label><input id="weatherLat" name="latitude" type="number" step="any" min="-90" max="90" value="' + escapeAttr(item.data.latitude || '') + '" placeholder="31.23"></div>' +
      '<div class="field"><label for="weatherLon">经度</label><input id="weatherLon" name="longitude" type="number" step="any" min="-180" max="180" value="' + escapeAttr(item.data.longitude || '') + '" placeholder="121.47"></div></div></details>';
  }
  if (item.kind === 'hotlist') {
    fields += '<p>微博、知乎、百度通过 NewsNow 查询；游研社读取其官方 RSS 最新文章。所选服务可能暂时不可用。</p>' +
      '<label class="setting-row"><span>启用热搜榜</span><input name="hotEnabled" type="checkbox"' + (item.data.enabled ? ' checked' : '') + '></label>' +
      '<div class="field"><label for="hotSource">默认榜单</label><select name="hotSource" id="hotSource">' +
      [['weibo','微博'],['zhihu','知乎'],['baidu','百度'],['yystv','游研社最新']].map(([id,label]) => '<option value="' + id + '"' + (item.data.source === id ? ' selected' : '') + '>' + label + '</option>').join('') +
      '</select></div>';
  }
  if (item.kind === 'pomodoro') {
    fields += '<div class="field"><label for="pomodoroDuration">每次专注分钟数</label><input id="pomodoroDuration" name="duration" type="number" min="5" max="180" value="' +
      escapeAttr(item.data.duration || 25) + '"></div><p>修改时长会重置当前计时。</p>';
  }
  if (item.kind === 'worldclock') {
    fields += '<div class="field"><label for="worldClockCity">显示名称</label><input id="worldClockCity" name="city" maxlength="80" value="' +
      escapeAttr(item.data.city || '') + '" placeholder="例如：东京"></div><div class="field"><label for="worldClockZone">IANA 时区</label>' +
      '<input id="worldClockZone" name="zone" maxlength="80" value="' + escapeAttr(item.data.zone || 'Asia/Shanghai') +
      '" placeholder="例如：Asia/Tokyo"><span class="field-hint">示例：Asia/Shanghai、Asia/Tokyo、Europe/London、America/New_York</span></div>';
  }
  if (item.kind === 'quote') {
    fields += '<div class="field"><label for="quoteText">文字内容</label><textarea id="quoteText" name="text" maxlength="500">' +
      escapeHtml(item.data.text || '') + '</textarea></div>';
  }
  openModal('设置' + widgetNames[item.kind], '<form id="widgetForm">' + fields +
    '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button><button class="button button--primary" type="submit">保存</button></div></form>');
  $('#cityPreset')?.addEventListener('change',event=>{
    if (event.target.value==='') return;
    const [name,lat,lon]=cities[Number(event.target.value)];
    $('#weatherCity').value=name; $('#weatherLat').value=lat; $('#weatherLon').value=lon;
    field($('#widgetForm'),'weatherEnabled').checked=true;
  });
  $('#widgetForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (item.kind === 'weather' && field(form, 'weatherEnabled').checked) {
      const latitude = Number(field(form, 'latitude').value), longitude = Number(field(form, 'longitude').value);
      if (!field(form, 'latitude').value || !field(form, 'longitude').value || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        toast('请填写有效的经纬度'); return;
      }
      if (globalThis.chrome?.permissions?.request) {
        const granted = await chrome.permissions.request({ origins: ['https://api.open-meteo.com/*'] });
        if (!granted) { toast('未授权天气接口，保持关闭'); return; }
      }
      item.data = { enabled: true, city: cleanText(field(form, 'city').value, 80), latitude: String(latitude), longitude: String(longitude) };
      weatherCache.delete(item.id);
    } else if (item.kind === 'weather') {
      item.data.enabled = false; weatherCache.delete(item.id);
    }
    if (item.kind === 'hotlist') {
      if (field(form, 'hotEnabled').checked && globalThis.chrome?.permissions?.request) {
        const granted = await chrome.permissions.request({ origins: [hotPermission(field(form, 'hotSource').value)] });
        if (!granted) { toast('未授权热榜接口，保持关闭'); return; }
      }
      item.data = { enabled: field(form, 'hotEnabled').checked, source: field(form, 'hotSource').value };
      hotCache.delete(item.data.source);
    }
    if (item.kind === 'countdown') item.data = { title: cleanText(field(form, 'eventName').value, 80), date: field(form, 'eventDate').value };
    if (item.kind === 'pomodoro') {
      const duration = Math.max(5, Math.min(180, Number(field(form, 'duration').value) || 25));
      item.data = { duration, remaining: duration * 60, endsAt: 0, running: false };
    }
    if (item.kind === 'worldclock') {
      const zone = cleanText(field(form, 'zone').value, 80);
      try { new Intl.DateTimeFormat('zh-CN', { timeZone: zone }); }
      catch { toast('请输入有效的 IANA 时区'); return; }
      item.data = { zone, city: cleanText(field(form, 'city').value, 80) || zone };
    }
    if (item.kind === 'quote') item.data = { text: cleanText(field(form, 'text').value, 500) || '今天也要好好生活。' };
    item.w = Number(field(form, 'width').value);
    item.h = Number(field(form, 'height').value);
    item.title = cleanText(field(form, 'title').value, 80) || widgetNames[item.kind];
    await persist(); render(); closeModal(); toast('组件已保存');
  });
}

function nearbyWeatherName(latitude, longitude) {
  const nearest = cities.map(([name, lat, lon]) => ({
    name, distance: Math.hypot((latitude - lat) * 111,
      (longitude - lon) * 111 * Math.cos(latitude * Math.PI / 180))
  })).sort((a, b) => a.distance - b.distance)[0];
  return nearest?.distance < 45 ? nearest.name + '附近' : '当前位置';
}

function openWeatherLocationConsent(id) {
  if (findItem(id)?.item?.kind !== 'weather') return;
  if (!navigator.geolocation?.getCurrentPosition) { toast('当前浏览器无法读取位置，请手动选择城市'); return; }
  pendingWeatherLocation = { id, phase: 'consent' };
  openModal('使用当前位置查询天气', '<p>点击下方按钮后，栖点才会读取一次设备位置。坐标会取整到 0.1°，你确认结果后才会发给 Open-Meteo 查询天气。</p>' +
    '<p>不会持续定位。你也可以取消并手动选择城市。</p><div class="modal-actions">' +
    '<button class="button" type="button" data-action="close-modal">取消</button>' +
    '<button class="button button--primary" type="button" data-action="read-weather-location">读取一次位置</button></div>');
}

function readWeatherLocation() {
  if (pendingWeatherLocation?.phase !== 'consent') return;
  const { id } = pendingWeatherLocation;
  const requestId = makeId();
  pendingWeatherLocation = { id, requestId, phase: 'requesting' };
  openModal('正在获取位置', '<p>正在等待 Edge 或系统返回位置。你可以关闭此窗口，继续手动选择城市。</p>');
  try { navigator.geolocation.getCurrentPosition(position => {
    if (pendingWeatherLocation?.requestId !== requestId) return;
    let coarse;
    try { coarse = coarseWeatherLocation(position.coords.latitude, position.coords.longitude); }
    catch { pendingWeatherLocation = null; toast('位置数据无效，请手动选择城市'); return; }
    const { latitude, longitude } = coarse;
    const city = nearbyWeatherName(Number(latitude), Number(longitude));
    pendingWeatherLocation = { id, latitude, longitude, city, phase: 'ready' };
    openModal('确认天气位置', '<p>将使用「' + escapeHtml(city) + '」的模糊坐标查询天气：</p>' +
      '<p><strong>' + (Number(latitude) < 0 ? '南纬 ' : '北纬 ') + Math.abs(Number(latitude)).toFixed(1) + '°，' +
      (Number(longitude) < 0 ? '西经 ' : '东经 ') + Math.abs(Number(longitude)).toFixed(1) + '°</strong></p>' +
      '<p>确认后，这组坐标会保存在本机，并发给 Open-Meteo；以后打开标签页只刷新天气，不会再次读取设备位置。</p>' +
      '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button>' +
      '<button class="button button--primary" type="button" data-action="confirm-weather-location">使用此位置</button></div>');
  }, error => {
    if (pendingWeatherLocation?.requestId !== requestId) return;
    pendingWeatherLocation = null;
    const message = error?.code === 1 ? '位置权限被拒绝' : error?.code === 3 ? '定位超时' : '无法取得位置';
    openModal('定位失败', '<p>' + message + '。可以在天气组件设置中手动选择城市。</p>' +
      '<div class="modal-actions"><button class="button button--primary" type="button" data-action="close-modal">关闭</button></div>');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }); }
  catch { pendingWeatherLocation = null; openModal('定位失败', '<p>当前环境无法读取位置，请手动选择城市。</p>'); }
}

async function confirmWeatherLocation() {
  if (pendingWeatherLocation?.phase !== 'ready') return;
  const { id, latitude, longitude, city } = pendingWeatherLocation;
  const item = findItem(id)?.item;
  if (item?.kind !== 'weather') { closeModal(); return; }
  try {
    if (globalThis.chrome?.permissions?.request &&
        !await chrome.permissions.request({ origins: ['https://api.open-meteo.com/*'] })) {
      toast('未授权天气接口，位置未保存'); return;
    }
    const previous = item.data;
    item.data = { enabled: true, city, latitude, longitude };
    if (!await persist()) { item.data = previous; return; }
    weatherCache.delete(id);
    render(); closeModal(); toast('已启用当前位置天气');
  } catch (error) { console.error(error); toast('无法保存天气位置'); }
}

function openWallpaper() {
  const selected = state.wallpaper.kind === 'preset' ? state.wallpaper.id : 'local';
  openModal('更换壁纸', '<div class="wallpaper-grid">' + Object.entries(presetNames).map(([id, name]) =>
    '<button type="button" class="wallpaper-option wallpaper--' + id + (selected === id ? ' selected' : '') +
    '" data-preset="' + id + '" style="' + (solidColors[id] ? 'background:' + solidColors[id] + ';color:#243348' : '') + '"><span>' + escapeHtml(name) + '</span></button>').join('') +
    '<button type="button" id="localWallpaperOption" class="wallpaper-option wallpaper--local' +
    (selected === 'local' ? ' selected' : '') + '" data-action="upload-wallpaper"><span>选择本地图片</span></button></div>' +
    '<p>本地壁纸存放在浏览器的本地数据库中，备份文件会包含图片。</p>' +
    '<div class="setting-section"><h3>壁纸遮罩</h3>' + rangeControl('遮罩强度', 'wallpaperDim', 0, .5, .01, '') + '</div>', true);
  if (state.wallpaper.kind === 'local') {
    getImageUrl(state.wallpaper.assetId).then(url => {
      const element = $('#localWallpaperOption');
      if (element && url) element.style.setProperty('--local-preview', 'url("' + url + '")');
    });
  }
}

function settingsMarkup() {
  const custom = state.customEngines.map(engine => '<div class="setting-row"><span>' + escapeHtml(engine.name) +
    '<small>' + escapeHtml(engine.template) + '</small></span><button class="button button--danger" type="button" data-delete-engine="' + escapeAttr(engine.id) + '">移除</button></div>').join('');
  const lastBackup = state.backupLastExportedAt ? new Date(state.backupLastExportedAt).toLocaleString('zh-CN') : '尚未生成备份';
  return '<div class="setting-section"><h3>外观</h3>' +
    '<label class="setting-row"><span>时间显示秒数</span><input type="checkbox" data-setting="showSeconds"' + (state.appearance.showSeconds ? ' checked' : '') + '></label>' +
    '<label class="setting-row"><span>显示卡片名称</span><input type="checkbox" data-setting="showLabels"' + (state.appearance.showLabels ? ' checked' : '') + '></label>' +
    '<label class="setting-row"><span>紧凑布局</span><input type="checkbox" data-setting="compact"' + (state.appearance.compact ? ' checked' : '') + '></label>' +
    '<label class="setting-row"><span>首页布局</span><select data-layout-mode aria-label="首页布局"><option value="organized"' +
      (state.appearance.layoutMode === 'organized' ? ' selected' : '') + '>主组件 · 网址 · 其他组件</option><option value="free"' +
      (state.appearance.layoutMode === 'free' ? ' selected' : '') + '>自由混排（原始顺序）</option></select></label>' +
    '<label class="setting-row"><span>显示底部一言<small>每次打开新标签页从本地短句中选取</small></span><input type="checkbox" data-setting="showQuote"' + (state.appearance.showQuote ? ' checked' : '') + '></label>' +
    '</div><div class="setting-section"><h3>搜索引擎</h3>' + custom +
    '<form id="engineForm" class="form-grid"><div class="field"><label for="engineName">名称</label><input id="engineName" name="name" maxlength="30" placeholder="例如：DuckDuckGo" required></div>' +
    '<div class="field"><label for="engineTemplate">搜索地址</label><input id="engineTemplate" name="template" maxlength="500" placeholder="https://example.com/?q=%s" required></div>' +
    '<button class="button" type="submit" style="align-self:start">添加搜索引擎</button></form><p>搜索词位置用 %s 表示，只允许 HTTPS 地址。</p>' +
    '</div><div class="setting-section"><h3>备份与导入</h3><p>上次生成完整备份：' + escapeHtml(lastBackup) + '。备份保存在你选择的本地位置，包含界面设置与自定义图片。</p>' +
    '<div class="setting-buttons"><button class="button button--primary" type="button" data-action="export-backup">导出本地备份</button>' +
    '<button class="button" type="button" data-action="create-snapshot">创建本机快照</button>' +
    '<button class="button" type="button" data-action="manage-snapshots">管理历史快照</button>' +
    '<button class="button" type="button" data-action="import-backup">导入栖点备份</button>' +
    '<button class="button" type="button" data-action="import-bookmark-file">导入 HTML 书签文件</button>' +
    '<button class="button" type="button" data-action="import-edge-bookmarks">导入 Edge 收藏夹</button></div>' +
    '<p>导入 Edge 收藏夹时才会请求收藏夹读取权限。当前支持栖点备份与 HTML 收藏夹文件。</p></div>' +
    '<div class="setting-section"><h3>节假日数据</h3><p>内置 2026 年官方安排。2027 年放假安排待公布；可从本地 JSON 文件更新指定年份，并随完整备份迁移。</p>' +
    '<div class="setting-buttons"><button class="button" type="button" data-action="import-holiday-year">导入年度节假日文件</button>' +
    '<a class="button" href="节假日年度文件示例-2026.json" download="节假日年度文件示例-2026.json">下载格式示例</a></div>' +
    '<small class="field-hint">自定义年份：' + escapeHtml(Object.keys(state.holidayYears).join('、') || '暂无') + '</small></div>' +
    '<div class="setting-section"><h3>当前分组的组件</h3>' +
    getActiveGroup(state).items.filter(item=>item.type==='widget').map(item=>'<label class="setting-row"><span>'+escapeHtml(item.title)+'</span><input type="checkbox" data-widget-visible="'+escapeAttr(item.id)+'"'+(!item.hidden?' checked':'')+'></label>').join('') + '</div>' +
    '<div class="setting-section"><h3>隐私</h3><p>打开新标签页不会主动连接栖点服务器。天气可手动选择城市；点击“当前位置”并确认后才读取一次设备位置，坐标模糊化并再次确认后才保存和发送给 Open-Meteo。微博、知乎、百度通过 NewsNow 查询；游研社读取官方 RSS 最新文章。搜索时会打开所选搜索引擎。</p><a class="store-privacy-link" href="privacy.html" target="_blank" rel="noopener noreferrer">阅读完整隐私政策</a></div>';
}

function openBackupPanel() {
  const lastBackup = state.backupLastExportedAt ? new Date(state.backupLastExportedAt).toLocaleString('zh-CN') : '尚未生成备份';
  openModal('本地备份', '<p>上次生成完整备份：' + escapeHtml(lastBackup) + '。文件包含网址、分组、卡片布局、壁纸、设置和自定义图片。</p>' +
    '<div class="backup-actions"><button class="choice" type="button" data-action="export-backup"><span class="choice-symbol">↓</span>导出备份文件</button>' +
    '<button class="choice" type="button" data-action="import-backup"><span class="choice-symbol">↑</span>导入备份文件</button>' +
    '<button class="choice" type="button" data-action="create-snapshot"><span class="choice-symbol">＋</span>创建本机快照</button>' +
    '<button class="choice" type="button" data-action="manage-snapshots"><span class="choice-symbol">▤</span>管理历史快照</button></div>');
}

function openSettings() {
  openModal('设置', settingsMarkup(), true);
  $('#engineForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = cleanText(form.elements.namedItem('name').value, 30);
    const template = cleanText(form.elements.namedItem('template').value, 500);
    let valid = false;
    try { valid = template.includes('%s') && new URL(template.replace('%s', 'test')).protocol === 'https:'; }
    catch { valid = false; }
    if (!name || !valid) { toast('请输入 HTTPS 搜索地址，并用 %s 表示搜索词'); return; }
    if (state.customEngines.length >= 12) { toast('最多添加 12 个搜索引擎'); return; }
    state.customEngines.push({ id: makeId(), name, template });
    await persist(); renderEngines(); openSettings(); toast('搜索引擎已添加');
  });
}

function rangeControl(label, key, min, max, step, unit = 'px') {
  const value = state.appearance[key];
  return '<label class="setting-range"><span>' + label + '</span><input type="range" data-appearance-number="' + key +
    '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value +
    '"><output>' + value + (unit ? ' ' + unit : '') + '</output></label>';
}
function checkControl(label, key) {
  return '<label class="setting-row"><span>' + label + '</span><input type="checkbox" data-setting="' + key +
    '"' + (state.appearance[key] ? ' checked' : '') + '></label>';
}
function openAppearancePanel(section) {
  let html = '';
  if (section === 'search') {
    html = checkControl('显示搜索栏', 'showSearch') +
      rangeControl('搜索栏高度', 'searchHeight', 38, 90, 1) +
      rangeControl('搜索栏圆角', 'searchRadius', 0, 45, 1) +
      rangeControl('搜索栏透明度', 'searchOpacity', .3, 1, .01, '');
  } else if (section === 'icons') {
    html = '<div class="setting-row"><span>图标形状</span><select aria-label="图标形状" data-appearance-shape><option value="default"' +
      (state.appearance.iconShape === 'default' ? ' selected' : '') + '>默认</option><option value="circle"' +
      (state.appearance.iconShape === 'circle' ? ' selected' : '') + '>圆形</option></select></div>' +
      rangeControl('内容最大宽度', 'boardWidth', 800, 1600, 20) +
      '<div class="setting-row"><span>每行最多图标数</span><select aria-label="每行最多图标数" data-appearance-columns>' +
      [8,12,16,20].map(value=>'<option value="'+value+'"'+(state.appearance.iconColumns===value?' selected':'')+'>'+value+'</option>').join('') + '</select></div>' +
      checkControl('名称颜色跟随壁纸','adaptiveLabels') +
      rangeControl('图标大小', 'iconSize', 32, 72, 1) +
      rangeControl('图标圆角', 'iconRadius', 0, 36, 1) +
      rangeControl('图标透明度', 'iconOpacity', .35, 1, .01, '') +
      rangeControl('图标间距', 'iconGap', 8, 48, 1) +
      checkControl('显示图标名称', 'showLabels') +
      rangeControl('名称文字大小', 'labelSize', 10, 20, 1);
  } else if (section === 'clock') {
    html = checkControl('显示时间', 'showClock') + checkControl('显示日期', 'showDate') +
      checkControl('显示星期', 'showWeek') + checkControl('显示农历', 'showLunar') +
      checkControl('24 小时制', 'hour24') + checkControl('显示秒数', 'showSeconds') +
      checkControl('粗体', 'clockBold') + rangeControl('时间大小', 'clockSize', 44, 120, 1) +
      '<label class="setting-row"><span>时间与日期颜色</span><select data-clock-mode aria-label="时间与日期颜色">' +
      [['auto','随壁纸自动'],['dark','深色'],['light','白色'],['custom','自定义']].map(([value,label]) =>
        '<option value="' + value + '"' + (state.appearance.clockMode === value ? ' selected' : '') + '>' + label + '</option>').join('') +
      '</select></label>' +
      '<label class="setting-row"><span>字体</span><strong>Arial</strong></label>' +
      '<label class="setting-row"><span>自定义时间颜色</span><input type="color" data-appearance-color value="' +
      escapeAttr(state.appearance.clockColor) + '"' + (state.appearance.clockMode !== 'custom' ? ' disabled' : '') + '></label>' +
      rangeControl('文字阴影强度', 'clockShadow', 0, 10, 1);
  }
  openModal(({search:'搜索栏设置',icons:'图标设置',clock:'时间日期设置'})[section], html);
}

function openSearchResults(query) {
  const text = query.toLocaleLowerCase();
  const results = allShortcuts().filter(item => item.title.toLocaleLowerCase().includes(text) || item.url.toLocaleLowerCase().includes(text));
  openModal('搜索我的网址', results.length ? '<p>找到 ' + results.length + ' 个结果</p><div class="folder-dialog-grid">' +
    results.slice(0, 100).map(item => shortcutMarkup(item, true)).join('') + '</div>' : '<p>没有找到匹配的网址。</p>', true);
}

async function safeSnapshot(reason) {
  try { await saveSnapshot(state, reason); return true; }
  catch (error) { console.error(error); toast('无法创建恢复点，操作已取消'); return false; }
}

async function openSnapshots() {
  try {
    const entries = await listSnapshots();
    openModal('本机历史快照', entries.length ? '<p>保留最近 20 份本机快照。卸载扩展时会一同删除，请定期导出备份文件。</p>' +
      entries.map(entry => '<div class="setting-row"><span>' + escapeHtml(new Date(entry.createdAt).toLocaleString('zh-CN')) +
      '<small>' + escapeHtml(entry.reason) + ' · ' + (entry.state?.groups?.length || 0) + ' 个分组</small></span>' +
      '<button class="button" type="button" data-action="restore-snapshot" data-id="' + escapeAttr(entry.id) + '">恢复</button></div>').join('') :
      '<p>还没有历史快照。你可以在设置中手动创建。</p>', true);
  } catch (error) { console.error(error); toast('无法读取历史快照'); }
}

async function restoreSnapshot(id) {
  const entry = await getSnapshot(id).catch(() => null);
  if (!entry) { toast('快照不存在'); return; }
  if (!confirm('将布局恢复到这份本机快照？当前布局会先自动保存为一份快照。')) return;
  if (!await safeSnapshot('恢复前备份')) return;
  const previous = state;
  state = normalizeState(entry.state);
  if (!await persist()) { state = previous; return; }
  render(); closeModal(); toast('已从快照恢复');
}

function openCalendar(step = 0) {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + step, 1);
  const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const days = [];
  for (let index = 0; index < firstWeekday; index++) days.push('<span></span>');
  for (let day = 1; day <= lastDate; day++) {
    const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
    days.push('<span class="calendar-day' + (isToday ? ' today' : '') + '">' + day + '</span>');
  }
  openModal('日历', '<div class="calendar-modal-head"><button class="button" type="button" data-action="calendar-prev">‹</button><strong>' +
    year + ' 年 ' + (month + 1) + ' 月</strong><button class="button" type="button" data-action="calendar-next">›</button></div>' +
    '<div class="calendar-grid">' + ['日','一','二','三','四','五','六'].map(day => '<b>' + day + '</b>').join('') + days.join('') + '</div>' +
    '<div class="modal-actions"><button class="button" type="button" data-action="calendar-today">回到今天</button></div>');
}

function confirmDeleteItem(id) {
  const found = findItem(id);
  if (!found) return;
  openModal('删除内容', '<p>确定删除「' + escapeHtml(found.item.title) + '」？此操作会立即从本机布局中移除。</p>' +
    '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button>' +
    '<button class="button button--danger" type="button" data-action="confirm-delete-item" data-id="' + escapeAttr(id) + '">删除</button></div>');
}

function confirmDeleteGroup(id) {
  const group = state.groups.find(candidate => candidate.id === id);
  if (!group || state.groups.length < 2) return;
  openModal('删除分组', '<p>确定删除「' + escapeHtml(group.name) + '」及其中全部内容？建议先导出备份。</p>' +
    '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button>' +
    '<button class="button button--danger" type="button" data-action="confirm-delete-group" data-id="' + escapeAttr(id) + '">删除分组</button></div>');
}

function openMoveItem(id) {
  const found = findItem(id);
  if (!found) return;
  openModal('移动内容', '<p>将「' + escapeHtml(found.item.title) + '」移动到其他分组。</p><div class="field"><label for="moveGroup">目标分组</label><select id="moveGroup">' +
    state.groups.map(group => '<option value="' + escapeAttr(group.id) + '"' + (group.id === found.group.id ? ' selected' : '') + '>' + escapeHtml(group.name) + '</option>').join('') +
    '</select></div><div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button>' +
    '<button class="button button--primary" type="button" data-action="confirm-move-item" data-id="' + escapeAttr(id) + '">移动</button></div>');
}

function focusReference(node) {
  const element = node instanceof Element ? node : null;
  const item = element?.closest('[data-item-id], [data-board-item]');
  const group = element?.closest('[data-group-id]');
  const focusable = element?.closest('button, a[href], input, textarea, select, [tabindex]');
  return { element: focusable instanceof HTMLElement ? focusable : null,
    itemId: item?.dataset.itemId || item?.dataset.boardItem || '',
    groupId: group?.dataset.groupId || '', elementId: focusable?.id || '', game: focusable?.dataset.game || '' };
}

function restoreFocus(reference) {
  if (!reference) return;
  let target = reference.element?.isConnected && reference.element.getClientRects().length ? reference.element : null;
  if (!target && reference.itemId) {
    const item = [...document.querySelectorAll('[data-item-id], [data-board-item]')]
      .find(node => node.dataset.itemId === reference.itemId || node.dataset.boardItem === reference.itemId);
    target = reference.game ? [...(item?.querySelectorAll('[data-game]') || [])].find(node => node.dataset.game === reference.game) : null;
    target ||= item?.matches('a[href], button, [tabindex]') ? item : item?.querySelector('a[href], button, [tabindex]');
  }
  if (!target && reference.groupId) target = [...document.querySelectorAll('[data-group-id]')]
    .find(node => node.dataset.groupId === reference.groupId);
  if (!target && reference.element?.isConnected && reference.element.getClientRects().length) target = reference.element;
  if (!target && reference.elementId) target = document.getElementById(reference.elementId);
  (target || $('#dashboard')).focus({ preventScroll: true });
}

function showContextMenu(x, y, buttons, opener = document.activeElement) {
  const menu = $('#contextMenu');
  contextMenuReturnFocus = focusReference(opener);
  const entries = [...buttons, { action: 'open-backup', label: '备份', divider: true }, { action: 'open-settings', label: '设置' }];
  menu.innerHTML = entries.map(button => '<button type="button" class="' + (button.danger ? 'danger ' : '') + (button.divider ? 'menu-divider' : '') +
    '" role="menuitem" data-action="' + escapeAttr(button.action) + '" data-id="' + escapeAttr(button.id || '') + '">' + escapeHtml(button.label) + '</button>').join('');
  menu.hidden = false;
  menu.style.left = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8)) + 'px';
  menu.querySelector('button')?.focus({ preventScroll: true });
}

function visualSection(item) {
  if (item.type === 'shortcut' || item.type === 'folder') return 'shortcuts';
  return ['weather', 'calendar', 'holiday', 'hotlist'].includes(item.kind) ? 'featured' : 'tools';
}

function reorderPeers(found) {
  const siblings = found.parent ? found.parent.children : found.group.items;
  if (found.parent || state.appearance.layoutMode !== 'organized') return siblings.filter(item => !item.hidden);
  return siblings.filter(item => !item.hidden && visualSection(item) === visualSection(found.item));
}

function contextActions(target) {
  if (target.closest('input, textarea, select, [contenteditable], .context-menu')) return null;
  const groupButton = target.closest('[data-group-id]');
  if (groupButton) {
    const id = groupButton.dataset.groupId;
    const index = state.groups.findIndex(group => group.id === id);
    if (index < 0) return null;
    return [
      { action: 'edit-group', id, label: '编辑分组' },
      ...(index > 0 ? [{ action: 'move-group-up', id, label: '分组上移' }] : []),
      ...(index < state.groups.length - 1 ? [{ action: 'move-group-down', id, label: '分组下移' }] : []),
      { action: 'delete-group', id, label: '删除分组', danger: true }
    ];
  }
  const boardItem = target.closest('[data-board-item], .folder-dialog-grid [data-item-id]');
  if (boardItem) {
    const id = boardItem.dataset.boardItem || boardItem.dataset.itemId;
    const found = findItem(id);
    if (!found) return null;
    const peers = reorderPeers(found);
    const index = peers.findIndex(item => item.id === id);
    return [
      { action: 'edit-item', id, label: '编辑' },
      ...(index > 0 ? [{ action: 'move-item-up', id, label: '向前移动' }] : []),
      ...(index < peers.length - 1 ? [{ action: 'move-item-down', id, label: '向后移动' }] : []),
      { action: 'move-item', id, label: '移动到分组' },
      { action: 'delete-item', id, label: '删除', danger: true }
    ];
  }
  if (target.closest('.modal')) return null;
  return [
    { action: 'add-shortcut', label: '添加网址' },
    { action: 'add-folder', label: '添加文件夹' },
    { action: 'choose-widget', label: '添加组件' }
  ];
}

function openContextMenuFor(target, x, y) {
  const buttons = contextActions(target);
  if (!buttons) return false;
  showContextMenu(x, y, buttons, target);
  return true;
}

async function reorderItem(id, offset) {
  const found = findItem(id);
  if (!found) return;
  const siblings = found.parent ? found.parent.children : found.group.items;
  const peers = reorderPeers(found);
  const peerIndex = peers.findIndex(item => item.id === id);
  const neighbor = peers[peerIndex + offset];
  const index = siblings.findIndex(item => item.id === id);
  const other = siblings.findIndex(item => item.id === neighbor?.id);
  if (index < 0 || other < 0) return;
  [siblings[index], siblings[other]] = [siblings[other], siblings[index]];
  if (!await persist()) {
    [siblings[index], siblings[other]] = [siblings[other], siblings[index]];
    restoreFocus(contextMenuReturnFocus);
    return;
  }
  if (found.parent && !$('#modalBackdrop').hidden) openFolder(found.parent.id);
  else renderBoard();
  restoreFocus(contextMenuReturnFocus);
  toast('内容顺序已调整');
}

async function reorderGroup(id, offset) {
  const index = state.groups.findIndex(group => group.id === id);
  const other = index + offset;
  if (index < 0 || other < 0 || other >= state.groups.length) return;
  [state.groups[index], state.groups[other]] = [state.groups[other], state.groups[index]];
  if (!await persist()) {
    [state.groups[index], state.groups[other]] = [state.groups[other], state.groups[index]];
    restoreFocus(contextMenuReturnFocus);
    return;
  }
  renderGroups();
  restoreFocus(contextMenuReturnFocus);
  toast('分组顺序已调整');
}

async function exportBackup() {
  try {
    const workspace = structuredClone(state);
    const encoded = {};
    for (const id of referencedImageIds(workspace)) {
      const blob = await getImage(id);
      if (!blob) throw new Error('有自定义图片缺失，请检查壁纸或网站图标后重试');
      encoded[id] = await blobToDataUrl(blob);
    }
    // Edge's favicon store and our localStorage cache do not move to a new computer.
    // Embed the resolved icon for sites without a packaged or uploaded icon.
    const missingIcons = new Map();
    for (const group of workspace.groups) for (const item of group.items) {
      const shortcuts = item.type === 'folder' ? item.children : item.type === 'shortcut' ? [item] : [];
      for (const shortcut of shortcuts) {
        if (shortcut.assetId || iconSpec(shortcut.url, shortcut.iconKey).id) continue;
        const origin = new URL(shortcut.url).origin;
        if (!missingIcons.has(origin)) missingIcons.set(origin, []);
        missingIcons.get(origin).push(shortcut);
      }
    }
    const unresolved = [...missingIcons.entries()];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(8, unresolved.length) }, async () => {
      while (cursor < unresolved.length) {
        const [origin, shortcuts] = unresolved[cursor++];
        const favicon = await resolveSiteIcon(origin);
        if (!favicon.startsWith('data:image/png;base64,')) continue;
        const id = makeId();
        encoded[id] = favicon;
        for (const shortcut of shortcuts) shortcut.assetId = id;
      }
    }));
    const exportedAt = new Date().toISOString();
    workspace.backupLastExportedAt = exportedAt;
    const backup = createBackupDocument(workspace, encoded, exportedAt);
    const serialized = JSON.stringify(backup, null, 2);
    if (new Blob([serialized]).size > 120 * 1024 * 1024)
      throw new Error('备份超过 120 MB，请缩小部分自定义图片后重试');
    const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = '栖点工作区-' + exportedAt.slice(0, 10) + '.qidian.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const previousExportTime = state.backupLastExportedAt;
    state.backupLastExportedAt = exportedAt;
    if (!await persist()) state.backupLastExportedAt = previousExportTime;
    if (!$('#modalBackdrop').hidden) openBackupPanel();
    toast('完整备份文件已生成');
  } catch (error) { console.error(error); toast('导出失败：' + error.message); }
}

async function importBackup(file) {
  if (!file || file.size > 120 * 1024 * 1024) { toast('备份文件不能超过 120 MB'); return; }
  try {
    const parsed = readBackupDocument(JSON.parse(await file.text()));
    const next = normalizeState(parsed.workspace);
    const normalizedOverview = summarizeWorkspace(next, Object.keys(parsed.images).length);
    if (normalizedOverview.websites !== parsed.overview.websites ||
        normalizedOverview.folders !== parsed.overview.folders ||
        normalizedOverview.widgets !== parsed.overview.widgets)
      throw new Error('备份含有当前版本无法识别的内容，未执行恢复');
    pendingBackup = { ...parsed, next };
    const summary = parsed.overview;
    const date = parsed.exportedAt && !Number.isNaN(Date.parse(parsed.exportedAt)) ?
      new Date(parsed.exportedAt).toLocaleString('zh-CN') : '旧版备份未记录';
    openModal('预览备份内容', '<div class="backup-preview"><p>文件：' + escapeHtml(file.name) + '</p>' +
      '<div class="backup-summary"><span><strong>' + summary.groups + '</strong>个分组</span><span><strong>' + summary.websites +
      '</strong>个网址</span><span><strong>' + summary.folders + '</strong>个文件夹</span><span><strong>' + summary.widgets +
      '</strong>个组件</span><span><strong>' + summary.images + '</strong>张自定义图片</span></div>' +
      '<p>备份时间：' + escapeHtml(date) + '<br>壁纸：' + escapeHtml(summary.wallpaper) +
      ' · 布局：' + escapeHtml(summary.layout) + '<br>分组：' + escapeHtml(summary.groupNames.join('、')) + '</p>' +
      (parsed.legacy ? '<p class="backup-warning">这是旧版备份。恢复后可以重新导出新版完整备份。</p>' : '') +
      (parsed.missing.length ? '<p class="backup-warning">旧备份缺少 ' + parsed.missing.length + ' 张自定义图片，恢复后这些图片可能无法显示。</p>' : '') +
      '<p class="backup-warning">恢复会替换当前分组、网址、壁纸、组件、布局和设置；操作前会创建本机快照。</p>' +
      '<div class="modal-actions"><button class="button" type="button" data-action="close-modal">取消</button>' +
      '<button class="button button--primary" type="button" data-action="confirm-import-backup">确认恢复</button></div></div>', true);
  } catch (error) { pendingBackup=null; console.error(error); toast('无法预览备份：' + error.message); }
}

async function restorePendingBackup() {
  if (!pendingBackup) return;
  try {
    const { images, next } = pendingBackup;
    const decoded = [];
    for (const [id, dataUrl] of Object.entries(images)) {
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('图片编号无效');
      decoded.push([id, dataUrlToBlob(dataUrl)]);
    }
    if (!await safeSnapshot('导入备份前')) return;
    for (const [id, blob] of decoded) await putImage(blob, id);
    const previous = state;
    state = next;
    if (!await persist()) { state = previous; throw new Error('无法写入浏览器本地存储'); }
    render(); closeModal(); toast('备份已导入');
  } catch (error) { console.error(error); toast('恢复失败：' + error.message); }
}

async function importHolidayFile(file) {
  if (!file) return;
  if (file.size > 100 * 1024) { toast('节假日文件不能超过 100 KB'); return; }
  try {
    const { year, data } = parseHolidayFile(JSON.parse(await file.text()));
    if (!await safeSnapshot('更新节假日数据前')) return;
    const previous = state.holidayYears[year];
    state.holidayYears[year] = data;
    if (!await persist()) {
      if (previous) state.holidayYears[year] = previous;
      else delete state.holidayYears[year];
      throw new Error('无法保存节假日数据');
    }
    render(); openSettings(); toast('已更新 ' + year + ' 年节假日数据');
  } catch (error) { console.error(error); toast('节假日导入失败：' + error.message); }
}

async function importBookmarkFile(file) {
  if (!file || file.size > 15 * 1024 * 1024) { toast('书签文件不能超过 15 MB'); return; }
  try {
    const document = new DOMParser().parseFromString(await file.text(), 'text/html');
    const bookmarks = [...document.querySelectorAll('a[href]')].slice(0, 500).map(link => {
      const url = normalizeUrl(link.getAttribute('href'));
      return url ? { id: makeId(), type: 'shortcut', title: cleanText(link.textContent, 80) || new URL(url).hostname,
        url, emoji: '', color: '#5278c8', assetId: '' } : null;
    }).filter(Boolean);
    if (!bookmarks.length) throw new Error('没有找到可导入的网址');
    if (state.groups.length >= 30) throw new Error('分组已达到上限');
    const group = { id: makeId(), name: '导入的书签', items: bookmarks };
    state.groups.push(group); state.activeGroupId = group.id;
    await persist(); render(); closeModal(); toast('已导入 ' + bookmarks.length + ' 个书签');
  } catch (error) { console.error(error); toast('书签导入失败：' + error.message); }
}

async function importEdgeBookmarks() {
  if (!globalThis.chrome?.bookmarks || !globalThis.chrome?.permissions) {
    toast('请在 Edge 扩展页面中使用此功能'); return;
  }
  try {
    const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
    if (!granted) { toast('未授予收藏夹读取权限'); return; }
    const roots = await chrome.bookmarks.getTree();
    const bookmarks = [];
    const visit = nodes => {
      for (const node of nodes) {
        if (bookmarks.length >= 500) return;
        if (node.url) {
          const url = normalizeUrl(node.url);
          if (url) bookmarks.push({ id: makeId(), type: 'shortcut', title: cleanText(node.title, 80) || new URL(url).hostname,
            url, emoji: '', color: '#5278c8', assetId: '' });
        }
        if (node.children) visit(node.children);
      }
    };
    visit(roots);
    if (!bookmarks.length) throw new Error('未找到可导入的收藏夹');
    if (state.groups.length >= 30) throw new Error('分组已达到上限');
    const group = { id: makeId(), name: 'Edge 收藏夹', items: bookmarks };
    state.groups.push(group); state.activeGroupId = group.id;
    await persist(); render(); closeModal(); toast('已导入 ' + bookmarks.length + ' 个收藏夹网址');
  } catch (error) { console.error(error); toast('导入失败：' + error.message); }
}

function addTodo(widgetId) {
  const found = findItem(widgetId);
  const input = [...document.querySelectorAll('[data-todo-input]')].find(element => element.dataset.todoInput === widgetId);
  const value = cleanText(input?.value, 200);
  if (!value || found?.item?.kind !== 'todo') return;
  found.item.data.todos ||= [];
  if (found.item.data.todos.length >= 200) { toast('每个待办组件最多 200 条'); return; }
  found.item.data.todos.push({ id: makeId(), text: value, done: false });
  persist(); renderBoard();
}

const sidebarEdge = $('#sidebarEdge');
const sidebar = $('.sidebar');
sidebarEdge.addEventListener('pointerenter', () => document.body.classList.add('sidebar-open'));
sidebarEdge.addEventListener('click', () => document.body.classList.add('sidebar-open'));
sidebar.addEventListener('pointerleave', event => {
  if (event.clientX > sidebar.getBoundingClientRect().right || event.clientY < 0 ||
      event.clientY > innerHeight) document.body.classList.remove('sidebar-open');
});
document.addEventListener('pointermove', event => {
  if (document.body.classList.contains('sidebar-open') && event.clientX > 174)
    document.body.classList.remove('sidebar-open');
}, { passive: true });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.body.classList.remove('sidebar-open');
});

$('#addGroupButton').addEventListener('click', () => openGroupEditor());
$('#editGroupButton').addEventListener('click', () => openGroupEditor(getActiveGroup(state).id));
$('#settingsButton').addEventListener('click', openSettings);
$('#wallpaperButton').addEventListener('click', openWallpaper);
$('#searchSettingsButton').addEventListener('click', () => openAppearancePanel('search'));
$('#iconSettingsButton').addEventListener('click', () => openAppearancePanel('icons'));
$('#clockSettingsButton').addEventListener('click', () => openAppearancePanel('clock'));
$('#focusButton').addEventListener('click', toggleFocus);
$('#clockButton').addEventListener('click', toggleFocus);

async function toggleFocus() {
  state.appearance.focus = !state.appearance.focus;
  applyAppearance(); await persist();
}

$('#engineButton').addEventListener('click', () => {
  $('#engineMenu').hidden = !$('#engineMenu').hidden;
});

$('#searchForm').addEventListener('submit', event => {
  event.preventDefault();
  const query = $('#searchInput').value.trim();
  if (!query) { $('#searchInput').focus(); return; }
  const engine = currentEngine();
  if (engine.id === 'local') { openSearchResults(query); return; }
  const address = engine.template.replace('%s', encodeURIComponent(query));
  try {
    if (new URL(address).protocol !== 'https:') throw new Error('不安全的搜索地址');
    window.open(address, '_blank', 'noopener,noreferrer');
  } catch { toast('搜索地址无效'); }
});

document.addEventListener('click', async event => {
  const target = event.target;
  const groupButton = target.closest('[data-group-id]');
  if (groupButton) {
    state.activeGroupId = groupButton.dataset.groupId;
    await persist(); render();
  }
  const engineButton = target.closest('[data-engine]');
  if (engineButton) {
    state.searchEngine = engineButton.dataset.engine;
    $('#engineMenu').hidden = true;
    $('#searchInput').focus();
    await persist(); renderEngines();
  }
  const preset = target.closest('[data-preset]');
  if (preset) {
    state.wallpaper = { kind: 'preset', id: preset.dataset.preset, assetId: '' };
    await persist(); applyWallpaper(); openWallpaper(); toast('壁纸已更换');
  }
  const hotSourceButton = target.closest('[data-hot-source]');
  if (hotSourceButton) {
    const widget = findItem(hotSourceButton.dataset.hotId)?.item;
    if (widget?.kind === 'hotlist') {
      if (widget.data.enabled && globalThis.chrome?.permissions?.request) {
        const granted = await chrome.permissions.request({ origins: [hotPermission(hotSourceButton.dataset.hotSource)] });
        if (!granted) { toast('未授权此内容来源'); return; }
      }
      widget.data.source = hotSourceButton.dataset.hotSource;
      await persist(); renderBoard();
    }
    return;
  }
  const widgetChoice = target.closest('[data-add-widget]');
  if (widgetChoice) await addWidget(widgetChoice.dataset.addWidget);
  const addTodoButton = target.closest('[data-todo-add]');
  if (addTodoButton) addTodo(addTodoButton.dataset.todoAdd);
  const deleteTodoButton = target.closest('[data-todo-delete]');
  if (deleteTodoButton) {
    const item = findItem(deleteTodoButton.dataset.todoDelete)?.item;
    if (item?.kind === 'todo') {
      item.data.todos = item.data.todos.filter(todo => todo.id !== deleteTodoButton.dataset.todoId);
      await persist(); renderBoard();
    }
  }
  const deleteEngineButton = target.closest('[data-delete-engine]');
  if (deleteEngineButton) {
    state.customEngines = state.customEngines.filter(engine => engine.id !== deleteEngineButton.dataset.deleteEngine);
    if (state.searchEngine === deleteEngineButton.dataset.deleteEngine) state.searchEngine = 'bing';
    await persist(); renderEngines(); openSettings();
  }
  const actionButton = target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id || '';
    $('#contextMenu').hidden = true;
    if (action === 'close-modal') closeModal();
    else if (action === 'add-shortcut') openShortcutEditor();
    else if (action === 'add-folder') openFolderEditor();
    else if (action === 'choose-widget') openWidgetChooser();
    else if (action === 'open-folder') openFolder(id);
    else if (action === 'edit-folder') openFolderEditor(id);
    else if (action === 'add-folder-shortcut') openShortcutEditor('', id);
    else if (action === 'widget-settings') openWidgetEditor(id);
    else if (action === 'locate-weather') openWeatherLocationConsent(id);
    else if (action === 'read-weather-location') readWeatherLocation();
    else if (action === 'confirm-weather-location') confirmWeatherLocation();
    else if (action === 'open-games') openGames(id, actionButton.dataset.game);
    else if (action === 'open-local-tool') openLocalTool(id);
    else if (action === 'retry-weather') refreshWeatherWidgets(id);
    else if (action === 'retry-hotlist') {
      const source = findItem(id)?.item?.data?.source;
      if (source) refreshHotlistWidgets(source);
    }
    else if (action === 'hide-widget') {
      const item=findItem(id)?.item;
      if (item?.type==='widget') { item.hidden=true; await persist(); renderBoard(); toast('组件已隐藏，可在设置中重新显示'); }
    }
    else if (action === 'enable-hotlist') {
      const item=findItem(id)?.item;
      if (item?.kind==='hotlist') {
        try {
          if (globalThis.chrome?.permissions?.request && !await chrome.permissions.request({origins:[hotPermission(item.data.source)]})) {
            toast('启用热搜需要允许访问榜单服务'); return;
          }
          item.data.enabled=true; await persist(); renderBoard();
        } catch { toast('暂时无法启用，请在组件设置中重试'); }
      }
    }
    else if (action === 'open-calendar') { calendarCursor = new Date(); openCalendar(); }
    else if (action === 'calendar-prev') openCalendar(-1);
    else if (action === 'calendar-next') openCalendar(1);
    else if (action === 'calendar-today') { calendarCursor = new Date(); openCalendar(); }
    else if (action === 'pomodoro-toggle') {
      const item = findItem(id)?.item;
      if (item?.kind === 'pomodoro') {
        if (item.data.running) {
          item.data.remaining = pomodoroSeconds(item); item.data.running = false; item.data.endsAt = 0;
        } else {
          const remaining = pomodoroSeconds(item) || (item.data.duration || 25) * 60;
          item.data.remaining = remaining; item.data.endsAt = Date.now() + remaining * 1000; item.data.running = true;
        }
        await persist(); renderBoard();
      }
    } else if (action === 'pomodoro-reset') {
      const item = findItem(id)?.item;
      if (item?.kind === 'pomodoro') {
        item.data.remaining = (item.data.duration || 25) * 60; item.data.endsAt = 0; item.data.running = false;
        await persist(); renderBoard();
      }
    }
    else if (action === 'edit-item') {
      const found = findItem(id);
      if (found?.item.type === 'shortcut') openShortcutEditor(id);
      else if (found?.item.type === 'folder') openFolderEditor(id);
      else if (found?.item.type === 'widget') openWidgetEditor(id);
    } else if (action === 'move-item') openMoveItem(id);
    else if (action === 'move-item-up') await reorderItem(id, -1);
    else if (action === 'move-item-down') await reorderItem(id, 1);
    else if (action === 'delete-item') confirmDeleteItem(id);
    else if (action === 'edit-group') openGroupEditor(id);
    else if (action === 'move-group-up') await reorderGroup(id, -1);
    else if (action === 'move-group-down') await reorderGroup(id, 1);
    else if (action === 'delete-group') confirmDeleteGroup(id);
    else if (action === 'confirm-delete-item') {
      const found = findItem(id);
      if (found) {
        if (!await safeSnapshot('删除内容前')) return;
        const collection = found.parent ? found.parent.children : found.group.items;
        collection.splice(collection.findIndex(item => item.id === id), 1);
        await persist(); render(); closeModal(); toast('内容已删除');
      }
    } else if (action === 'confirm-delete-group') {
      if (!await safeSnapshot('删除分组前')) return;
      state.groups = state.groups.filter(group => group.id !== id);
      state.activeGroupId = state.groups[0].id;
      await persist(); render(); closeModal(); toast('分组已删除');
    } else if (action === 'confirm-move-item') {
      const found = findItem(id);
      const targetGroup = state.groups.find(group => group.id === $('#moveGroup')?.value);
      if (found && targetGroup) {
        const source = found.parent ? found.parent.children : found.group.items;
        source.splice(source.findIndex(item => item.id === id), 1);
        targetGroup.items.push(found.item);
        state.activeGroupId = targetGroup.id;
        await persist(); render(); closeModal(); toast('内容已移动');
      }
    } else if (action === 'upload-wallpaper') $('#wallpaperInput').click();
    else if (action === 'open-backup') openBackupPanel();
    else if (action === 'open-settings') openSettings();
    else if (action === 'export-backup') exportBackup();
    else if (action === 'confirm-import-backup') restorePendingBackup();
    else if (action === 'create-snapshot') { if (await safeSnapshot('手动快照')) toast('本机快照已保存'); }
    else if (action === 'manage-snapshots') openSnapshots();
    else if (action === 'restore-snapshot') restoreSnapshot(id);
    else if (action === 'import-backup') $('#backupInput').click();
    else if (action === 'import-holiday-year') $('#holidayInput').click();
    else if (action === 'import-bookmark-file') $('#bookmarkInput').click();
    else if (action === 'import-edge-bookmarks') importEdgeBookmarks();
  }
  if (!target.closest('.engine-menu, .engine-button')) $('#engineMenu').hidden = true;
  if (!target.closest('.context-menu')) $('#contextMenu').hidden = true;
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.matches('[data-widget-visible]')) {
    const item=findItem(target.dataset.widgetVisible)?.item;
    if (item) { item.hidden=!target.checked; await persist(); renderBoard(); }
  }
  if (target.matches('[data-appearance-columns]')) {
    state.appearance.iconColumns=Number(target.value); applyAppearance(); await persist();
  }
  if (target.matches('[data-layout-mode]')) {
    state.appearance.layoutMode = target.value === 'free' ? 'free' : 'organized';
    await persist(); renderBoard();
  }
  if (target.matches('[data-clock-mode]')) {
    state.appearance.clockMode = ['auto','dark','light','custom'].includes(target.value) ? target.value : 'auto';
    state.appearance.autoText = state.appearance.clockMode === 'auto';
    if ($('[data-appearance-color]')) $('[data-appearance-color]').disabled = state.appearance.clockMode !== 'custom';
    applyAppearance(); await persist();
  }
  if (target.matches('[data-setting]')) {
    state.appearance[target.dataset.setting] = target.checked;
    if (target.dataset.setting === 'autoText' && $('[data-appearance-color]'))
      $('[data-appearance-color]').disabled = target.checked;
    applyAppearance(); updateClock(); await persist();
  }
  if (target.matches('[data-appearance-number], [data-appearance-color], [data-appearance-shape]')) {
    await persist();
  }
  if (target.matches('[data-todo-toggle]')) {
    const item = findItem(target.dataset.todoToggle)?.item;
    const todo = item?.data?.todos?.find(todo => todo.id === target.dataset.todoId);
    if (todo) { todo.done = target.checked; await persist(); renderBoard(); }
  }
});

document.addEventListener('input', event => {
  const target = event.target;
  if (target.matches('[data-notes-id]')) {
    const item = findItem(target.dataset.notesId)?.item;
    if (!item || item.kind !== 'notes') return;
    item.data.text = target.value.slice(0, 12000);
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(persist, 500);
  }
  if (target.matches('[data-appearance-number]')) {
    const key = target.dataset.appearanceNumber;
    state.appearance[key] = Number(target.value);
    target.nextElementSibling.textContent = target.value + (['searchOpacity','iconOpacity','wallpaperDim'].includes(key) ? '' : ' px');
    applyAppearance();
  }
  if (target.matches('[data-appearance-color]')) {
    state.appearance.clockColor = target.value;
    applyAppearance();
  }
  if (target.matches('[data-appearance-shape]')) {
    state.appearance.iconShape = target.value;
    applyAppearance();
  }
});

document.addEventListener('keydown', event => {
  const menu = $('#contextMenu');
  const modal = $('#modal');
  if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) &&
      !event.target.closest('input, textarea, select, [contenteditable]')) {
    const target = event.target;
    if (target === $('#dashboard') || target.closest('[data-group-id], [data-board-item], .folder-dialog-grid [data-item-id]')) {
      const anchor = target.closest('[data-group-id], [data-board-item], [data-item-id]') || target;
      const rect = anchor.getBoundingClientRect();
      if (openContextMenuFor(target, rect.left + 18, rect.top + 22)) event.preventDefault();
      return;
    }
  }
  if (event.key === 'Tab' && !$('#modalBackdrop').hidden && menu.hidden) {
    const focusable = [...modal.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, summary, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (first && (event.shiftKey && document.activeElement === first ||
        !event.shiftKey && document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
  if (event.key === 'Escape') {
    let handled = false;
    if (!menu.hidden) { menu.hidden = true; restoreFocus(contextMenuReturnFocus); handled = true; }
    else if (!$('#modalBackdrop').hidden) { closeModal(); handled = true; }
    else if (!$('#engineMenu').hidden) { $('#engineMenu').hidden = true; handled = true; }
    if (handled) event.preventDefault();
  }
  if (event.key === 'Enter' && event.target.matches('[data-todo-input]')) {
    event.preventDefault(); addTodo(event.target.dataset.todoInput);
  }
});

$('#contextMenu').addEventListener('keydown', event => {
  const menu = $('#contextMenu');
  const buttons = [...menu.querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement);
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation();
    menu.hidden = true; restoreFocus(contextMenuReturnFocus);
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
});
document.addEventListener('focusin', event => {
  const menu = $('#contextMenu');
  if (!menu.hidden && !menu.contains(event.target)) menu.hidden = true;
});

$('#modalBackdrop').addEventListener('click', event => {
  if (event.target === $('#modalBackdrop')) closeModal();
});

document.addEventListener('contextmenu', event => {
  if (openContextMenuFor(event.target, event.clientX, event.clientY)) event.preventDefault();
  else $('#contextMenu').hidden = true;
}, true);

document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.hasAttribute('data-fallback-icon') &&
      !image.src.endsWith('/fallback-icon.svg')) image.src = 'fallback-icon.svg';
}, true);

$('#board').addEventListener('dragstart', event => {
  const item = event.target.closest('[data-board-item]');
  if (!item) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.dataset.boardItem);
  item.classList.add('dragging');
});
$('#board').addEventListener('dragend', () => {
  $('#board').querySelectorAll('.dragging, .drop-target').forEach(item => item.classList.remove('dragging', 'drop-target'));
});
$('#board').addEventListener('dragover', event => {
  const target = event.target.closest('[data-board-item]');
  if (!target) return;
  event.preventDefault();
  $('#board').querySelectorAll('.drop-target').forEach(item => item.classList.remove('drop-target'));
  target.classList.add('drop-target');
});
$('#board').addEventListener('drop', async event => {
  event.preventDefault();
  const sourceId = event.dataTransfer.getData('text/plain');
  const targetId = event.target.closest('[data-board-item]')?.dataset.boardItem;
  const items = getActiveGroup(state).items;
  const from = items.findIndex(item => item.id === sourceId);
  const to = items.findIndex(item => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const source = items[from], target = items[to];
  if (target.type === 'folder' && source.type === 'shortcut') {
    items.splice(from, 1); target.children.push(source); toast('已移入文件夹');
  } else if (state.appearance.layoutMode === 'organized' && visualSection(source) !== visualSection(target)) {
    toast('当前布局请在同一类卡片内排序'); return;
  } else {
    items.splice(from, 1); items.splice(to, 0, source);
  }
  await persist(); renderBoard();
});

$('#groupNav').addEventListener('dragstart', event => {
  const button = event.target.closest('[data-group-id]');
  if (!button) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', button.dataset.groupId);
});
$('#groupNav').addEventListener('dragover', event => {
  if (event.target.closest('[data-group-id]')) event.preventDefault();
});
$('#groupNav').addEventListener('drop', async event => {
  event.preventDefault();
  const from = state.groups.findIndex(group => group.id === event.dataTransfer.getData('text/plain'));
  const to = state.groups.findIndex(group => group.id === event.target.closest('[data-group-id]')?.dataset.groupId);
  if (from < 0 || to < 0 || from === to) return;
  const [group] = state.groups.splice(from, 1);
  state.groups.splice(to, 0, group);
  await persist(); renderGroups();
});

$('#backupInput').addEventListener('change', async event => {
  await importBackup(event.target.files?.[0]); event.target.value = '';
});
$('#holidayInput').addEventListener('change', async event => {
  await importHolidayFile(event.target.files?.[0]); event.target.value = '';
});
$('#bookmarkInput').addEventListener('change', async event => {
  await importBookmarkFile(event.target.files?.[0]); event.target.value = '';
});
$('#wallpaperInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const assetId = await putImage(file);
    state.wallpaper = { kind: 'local', id: '', assetId };
    await persist(); applyWallpaper(); closeModal(); toast('本地壁纸已设置');
  } catch (error) { toast(error.message); }
});

if (globalThis.chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes['qidian-state-v1']) {
      const signature = JSON.stringify(changes['qidian-state-v1'].newValue);
      if (localWriteSignatures.delete(signature)) return;
      state = await loadState(); render();
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateClock();
});


// Store distribution guide. All resources are packaged locally.
import { initializeStoreWelcome } from './store-welcome.js';
await initializeStoreWelcome();
