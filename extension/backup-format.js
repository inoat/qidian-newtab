export const BACKUP_FORMAT = 'qidian-workspace';

export function referencedImageIds(workspace) {
  const ids = new Set();
  if (workspace?.wallpaper?.kind === 'local' && workspace.wallpaper.assetId) ids.add(workspace.wallpaper.assetId);
  for (const group of workspace?.groups || []) for (const item of group.items || []) {
    if (item.type === 'shortcut' && item.assetId) ids.add(item.assetId);
    if (item.type === 'folder') for (const child of item.children || []) if (child.assetId) ids.add(child.assetId);
  }
  return [...ids];
}

export function summarizeWorkspace(workspace, imageCount = 0) {
  const overview = { groups: workspace.groups.length, websites: 0, folders: 0, widgets: 0,
    images: imageCount, groupNames: workspace.groups.map(group => group.name),
    wallpaper: workspace.wallpaper?.kind === 'local' ? '本地图片' : workspace.wallpaper?.id || '默认',
    layout: workspace.appearance?.layoutMode === 'free' ? '自由混排' : '分区布局' };
  for (const group of workspace.groups) for (const item of group.items || []) {
    if (item.type === 'shortcut') overview.websites++;
    else if (item.type === 'folder') { overview.folders++; overview.websites += item.children?.length || 0; }
    else if (item.type === 'widget') overview.widgets++;
  }
  return overview;
}

export function createBackupDocument(workspace, images, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: 2,
    description: '栖点私人新标签页完整备份。工作区包含分组、网址、组件、布局、搜索、壁纸和外观设置；图片保存在文末。',
    exportedAt,
    overview: summarizeWorkspace(workspace, Object.keys(images).length),
    workspace,
    images
  };
}

export function readBackupDocument(raw) {
  const modern = raw?.format === BACKUP_FORMAT && raw?.formatVersion === 2;
  const legacy = raw?.app === 'qidian-local-newtab' && raw?.backupVersion === 1;
  if (!modern && !legacy) throw new Error('不是受支持的栖点备份文件');
  const workspace = modern ? raw.workspace : raw.state;
  if (!workspace || !Array.isArray(workspace.groups) || workspace.groups.length === 0 || workspace.groups.length > 30)
    throw new Error('备份中的分组数据无效');
  for (const group of workspace.groups)
    if (!Array.isArray(group?.items) || group.items.length > 500) throw new Error('备份中的内容数量无效');
  const images = raw.images && typeof raw.images === 'object' && !Array.isArray(raw.images) ? raw.images : {};
  if (Object.keys(images).length > 15000) throw new Error('备份中的图片数量过多');
  const missing = referencedImageIds(workspace).filter(id => !Object.hasOwn(images, id));
  if (modern && missing.length) throw new Error('备份缺少 ' + missing.length + ' 张自定义图片');
  return {
    workspace, images, legacy, missing,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    overview: summarizeWorkspace(workspace, Object.keys(images).length)
  };
}
