const WELCOME_KEY = 'qidian-store-welcome-v1';
export async function initializeStoreWelcome() {
  let seen = false;
  try {
    seen = globalThis.chrome?.storage?.local ?
      Boolean((await chrome.storage.local.get(WELCOME_KEY))[WELCOME_KEY]) :
      localStorage.getItem(WELCOME_KEY) === 'yes';
  } catch { /* Show the guide if its local flag is unavailable. */ }
  if (seen) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'store-welcome';
  dialog.setAttribute('aria-labelledby', 'storeWelcomeTitle');
  dialog.innerHTML = '<img class="welcome-logo" src="icon-128.png" alt="">' +
    '<h1 id="storeWelcomeTitle">欢迎来到栖点</h1><p class="welcome-intro">把常用的，留在眼前。</p>' +
    '<ul><li><strong>你的新标签页</strong><span>安装后，Edge 新标签页会显示栖点；网址与搜索结果在新标签页打开。</span></li>' +
    '<li><strong>从右键开始</strong><span>右键空白处添加网址与组件。键盘可聚焦内容区域，按 Shift + F10 打开菜单；移动到左边缘展开设置。</span></li>' +
    '<li><strong>数据保存在本机</strong><span>网址、分组、笔记、壁纸与游戏进度本地保存。换电脑前，在“备份”中导出 .qidian.json 文件。</span></li>' +
    '<li><strong>联网功能由你开启</strong><span>天气和热搜默认关闭；天气定位需主动读取并再次确认。没有账号、广告或使用统计。</span></li></ul>' +
    '<div class="welcome-actions"><a href="privacy.html" target="_blank" rel="noopener noreferrer">隐私说明</a>' +
    '<button type="button" class="welcome-start">开始使用</button></div>';
  document.body.append(dialog);
  const finish = async () => {
    try {
      if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({[WELCOME_KEY]:true});
      else localStorage.setItem(WELCOME_KEY,'yes');
    } catch { /* Closing the guide still works without storage. */ }
    dialog.close(); dialog.remove();
    document.querySelector('#searchInput')?.focus();
  };
  dialog.querySelector('button').addEventListener('click', finish, {once:true});
  dialog.addEventListener('cancel', event => {event.preventDefault(); finish();}, {once:true});
  dialog.showModal();
}