// Services are requested only after the corresponding widget has been enabled.
export const cities = [
  ['南京',32.06,118.80],['北京',39.90,116.40],['上海',31.23,121.47],
  ['广州',23.13,113.26],['深圳',22.54,114.06],['杭州',30.27,120.15],
  ['苏州',31.30,120.59],['无锡',31.49,120.31],['常州',31.81,119.97],
  ['扬州',32.39,119.41],['南通',31.98,120.89],['徐州',34.26,117.18],
  ['成都',30.57,104.07],['重庆',29.56,106.55],['武汉',30.59,114.31],
  ['西安',34.34,108.94],['天津',39.08,117.20],['郑州',34.75,113.62],
  ['长沙',28.23,112.94],['合肥',31.82,117.23],['济南',36.65,117.12],
  ['青岛',36.07,120.38],['厦门',24.48,118.09],['福州',26.07,119.30],
  ['宁波',29.87,121.54],['温州',28.00,120.70],['南昌',28.68,115.86],
  ['昆明',25.04,102.72],['贵阳',26.65,106.63],['南宁',22.82,108.37],
  ['海口',20.04,110.20],['太原',37.87,112.55],['石家庄',38.04,114.51],
  ['沈阳',41.81,123.43],['大连',38.91,121.61],['长春',43.82,125.32],
  ['哈尔滨',45.80,126.54],['兰州',36.06,103.83],['乌鲁木齐',43.83,87.62],
  ['呼和浩特',40.84,111.75],['银川',38.49,106.23],['西宁',36.62,101.78],
  ['拉萨',29.65,91.17],['香港',22.32,114.17],['澳门',22.20,113.55],['台北',25.03,121.57]
];
export const sourceLinks = {weibo:'https://s.weibo.com/top/summary',zhihu:'https://www.zhihu.com/hot',
  baidu:'https://top.baidu.com/board',yystv:'https://www.yystv.cn/rss/'};
const prefix = 'qidian-service:';
export const weatherKey = data => String(Number(data.latitude)) + ',' + String(Number(data.longitude));
export function coarseWeatherLocation(latitude, longitude) {
  if (![latitude, longitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    throw new Error('位置数据无效');
  return { latitude: (Math.round(latitude * 10) / 10).toFixed(1),
    longitude: (Math.round(longitude * 10) / 10).toFixed(1) };
}
export function readServiceCache(type,key) {
  try {
    const value = JSON.parse(localStorage.getItem(prefix + type + ':' + key));
    if (!value || !Number.isFinite(value.time) || Date.now() - value.time > 7*86400000) return null;
    if (type === 'weather' && (!Number.isFinite(value.temperature) || !Array.isArray(value.daily))) return null;
    if (type === 'hotlist') {
      if (!Array.isArray(value.items)) return null;
      value.items=value.items.map(item=>({...item,heat:String(item.heat||'').replace(/\s|热度|热搜指数/g,'')}));
    }
    return value;
  } catch { return null; }
}
function save(type,key,data) {
  try { localStorage.setItem(prefix + type + ':' + key,JSON.stringify(data)); } catch { /* Fresh data still works without disk cache. */ }
  return data;
}
async function request(url, format = 'json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),12000);
  try {
    const result = await fetch(url,{cache:'no-store',signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if (!result.ok) throw new Error('服务暂时不可用');
    return format === 'text' ? await result.text() : await result.json();
  } finally { clearTimeout(timer); }
}
export async function fetchWeather(data) {
  const lat=Number(data.latitude),lon=Number(data.longitude);
  if (data.latitude === '' || data.longitude === '' || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      Math.abs(lat)>90 || Math.abs(lon)>180) throw new Error('请先选择城市');
  const result = await request('https://api.open-meteo.com/v1/forecast?latitude=' + lat +
    '&longitude=' + lon + '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto');
  const daily = (result.daily?.time || []).map((date,i) => ({
    date,code:result.daily.weather_code?.[i],high:result.daily.temperature_2m_max?.[i],low:result.daily.temperature_2m_min?.[i]
  })).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && [day.code,day.high,day.low].every(Number.isFinite));
  if (!Number.isFinite(result.current?.temperature_2m) || !Number.isFinite(result.current?.weather_code) || daily.length<2)
    throw new Error('天气数据不完整');
  return save('weather',weatherKey(data),{time:Date.now(),temperature:result.current.temperature_2m,code:result.current.weather_code,daily});
}
export async function fetchHotlist(source) {
  if (!(source in sourceLinks)) throw new Error('不支持的榜单');
  if (source === 'yystv') {
    const xml = await request('https://www.yystv.cn/rss/feed', 'text');
    if (xml.length > 1_000_000) throw new Error('游研社数据过大');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('游研社数据无法解析');
    const items = [...document.querySelectorAll('item, entry')].slice(0, 30).map(entry => {
      const title = String(entry.querySelector('title')?.textContent || '').trim().slice(0, 140);
      const rawUrl = entry.querySelector('link')?.getAttribute('href') || entry.querySelector('link')?.textContent || '';
      let url = '';
      try {
        const parsed = new URL(rawUrl.trim());
        if (['http:','https:'].includes(parsed.protocol) && ['www.yystv.cn','yystv.cn'].includes(parsed.hostname)) {
          parsed.protocol = 'https:';
          url = parsed.href;
        }
      } catch { /* Ignore invalid feed links. */ }
      return { title, url, heat: '' };
    }).filter(entry => entry.title && entry.url);
    if (!items.length) throw new Error('游研社暂时没有新文章');
    return save('hotlist', source, {time: Date.now(), checkedAt: Date.now(), items});
  }
  const result = await request('https://newsnow.busiyi.world/api/s?id=' + source);
  const items = (Array.isArray(result.items)?result.items:[]).slice(0,30).map(entry => {
    let url='';
    try { const parsed=new URL(entry.url); if (['http:','https:'].includes(parsed.protocol)) url=parsed.href; } catch {}
    return {title:String(entry.title||'').trim().slice(0,140),url,heat:String(entry.extra?.info||'').replace(/\s|热度|热搜指数/g,'').slice(0,16)};
  }).filter(entry=>entry.title&&entry.url);
  if (!items.length) throw new Error('该榜单暂无内容');
  const time=Number.isFinite(result.updatedTime) && result.updatedTime>0 ? Math.min(result.updatedTime,Date.now()) : Date.now();
  return save('hotlist',source,{time,checkedAt:Date.now(),items});
}
export function cacheTime(value) {
  if (!value?.time) return '';
  const date=new Date(value.time),today=new Date();
  const day=date.toDateString()===today.toDateString()?'':(date.getMonth()+1)+'月'+date.getDate()+'日 ';
  return day+date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
}
