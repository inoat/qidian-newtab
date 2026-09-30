// Packaged website icons are local; unknown sites use only Edge's favicon store.
import { iconCatalog as bundledIcons } from './icon-catalog.js';
import { personalIcons } from './personal-icon-catalog.js';
export const iconCatalog = bundledIcons.map(icon => personalIcons.find(own=>own.id===icon.id) || icon).concat(personalIcons.filter(own=>!bundledIcons.some(icon=>icon.id===own.id))); 
const pending = new Map();
const prefix = 'qidian-site-icon:';
let placeholderPromise;
export function iconSpec(address, iconKey = '') {
  let entry = iconCatalog.find(item => item.id === iconKey);
  if (!entry) {
    try {
      const url = new URL(address);
      if (!['http:','https:'].includes(url.protocol)) throw new Error('Unsupported URL');
      const host = url.hostname.toLowerCase();
      let best = -1;
      for (const candidate of iconCatalog) {
        const path = candidate.pathPrefix;
        if (path && url.pathname !== path && !url.pathname.startsWith(path.replace(/\/$/,'') + '/')) continue;
        for (const domain of candidate.domains) {
          if (host !== domain && !host.endsWith('.' + domain)) continue;
          // Exact subsite/path identities win; screenshot profiles win otherwise equal matches.
          const score = domain.length * 100 + (path?.length || 0) + (candidate.group === 'reference' ? 10 : 0);
          if (score > best) { entry = candidate; best = score; }
        }
      }
    } catch { /* Unknown/invalid address uses the browser fallback. */ }
  }
  return entry ? {src:entry.file,background:entry.background,fit:entry.fit,scale:entry.scale,id:entry.id,name:entry.name} :
    {src:'fallback-icon.svg',background:'transparent',fit:'contain',scale:1,id:'',name:''};
}
function cacheKey(address) {
  try { return prefix + new URL(address).origin; } catch { return prefix + 'invalid'; }
}
function browserUrl(address) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', address); url.searchParams.set('size', '64');
  return url.href;
}
function raster(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => { img.src = ''; reject(new Error('图标读取超时')); }, 5000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,64,64);
        resolve(canvas.toDataURL('image/png'));
      } catch(error) { reject(error); }
    };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('没有可用图标')); };
    img.src = url;
  });
}
export async function resolveSiteIcon(address, force = false, iconKey = '') {
  const local = iconSpec(address, iconKey);
  if (local.src !== 'fallback-icon.svg') return local.src;
  if (!globalThis.chrome?.runtime?.getURL) return local.src;
  const key = cacheKey(address);
  if (force) { localStorage.removeItem(key); pending.delete(key); }
  if (!force) {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.src?.startsWith('data:image/png;base64,') && saved.src.length < 80000 &&
          Date.now() - saved.time < 30 * 86400000) return saved.src;
    } catch { /* Ignore damaged or unavailable cache. */ }
  }
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {
      placeholderPromise ||= raster(browserUrl('https://qidian-missing-favicon.invalid/')).catch(() => '');
      const [src, placeholder] = await Promise.all([raster(browserUrl(address)), placeholderPromise]);
      // The browser can return a default document icon with HTTP success.
      if (!placeholder || src === placeholder) return 'fallback-icon.svg';
      try { localStorage.setItem(key,JSON.stringify({src,time:Date.now()})); } catch { /* Cache is optional. */ }
      return src;
    } catch { return 'fallback-icon.svg'; }
    finally { pending.delete(key); }
  })();
  pending.set(key,task);
  return task;
}
