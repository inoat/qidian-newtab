import { getActiveGroup, loadState, makeId, normalizeUrl, saveState, cleanText } from './storage.js';

const form = document.querySelector('#form');
const message = document.querySelector('#message');
let state = await loadState();
const groups = document.querySelector('#group');
for (const group of state.groups) {
  const option = document.createElement('option');
  option.value = group.id; option.textContent = group.name;
  groups.append(option);
}
groups.value = getActiveGroup(state).id;

if (globalThis.chrome?.tabs?.query) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = normalizeUrl(tab?.url);
    if (url) {
      form.elements.namedItem('url').value = url;
      form.elements.namedItem('title').value = cleanText(tab.title, 80) || new URL(url).hostname;
    } else {
      message.textContent = '当前页面无法自动获取网址，请手动输入。';
    }
  } catch { message.textContent = '无法读取当前页面，请手动输入网址。'; }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const url = normalizeUrl(form.elements.namedItem('url').value);
  const title = cleanText(form.elements.namedItem('title').value, 80);
  if (!url || !title) { message.textContent = '请填写有效名称和 http/https 网址。'; return; }
  const group = state.groups.find(item => item.id === groups.value) || getActiveGroup(state);
  group.items.push({ id: makeId(), type: 'shortcut', title, url, emoji: '', color: '#5278c8', assetId: '' });
  try {
    await saveState(state);
    message.textContent = '已保存到「' + group.name + '」';
    form.querySelector('button').disabled = true;
  } catch (error) { message.textContent = '保存失败：' + error.message; }
});
