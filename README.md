# 栖点 · 本地新标签页

一个面向 Microsoft Edge 的 Manifest V3 新标签页扩展。网址、布局、壁纸与组件数据保存在本机，可通过可读的 `.qidian.json` 文件备份和迁移。

[项目主页](https://inoat.github.io/qidian-newtab/) · [隐私政策](https://inoat.github.io/qidian-newtab/privacy.html) · [反馈问题](https://github.com/inoat/qidian-newtab/issues)

![栖点首页](assets/screenshots/home.png)

## 功能

- 网址图标、分组和文件夹；右键添加、拖动排序和键盘移动。
- 搜索引擎切换；搜索与网址在新标签页打开。
- 时间、日期、农历；可调字体、颜色、遮罩与组件尺寸。
- 纯色、渐变及本地图片壁纸；随壁纸调整文字深浅。
- 天气、日历、下一个假期、热搜、笔记、待办和计时工具。
- 计算器、时间戳、单位换算；2048、扫雷和落块消除。
- 完整备份、导入预览和本机快照；按年导入节假日数据。

天气与热搜默认关闭。设备位置需主动读取并再次确认，坐标取整到 0.1° 后才保存和发送给天气接口。没有发布者数据接收服务器、广告或遥测；使用第三方服务和搜索时会按隐私政策向相应服务发送请求。

## 安装

当前版本：**1.0.0**。Microsoft Edge 扩展商店版本正在准备提交，尚未通过审核。

1. 下载 [qidian-edge-1.0.0.zip](https://github.com/inoat/qidian-newtab/raw/refs/heads/main/dist/qidian-edge-1.0.0.zip)，解压到固定位置。
2. 在 Edge 打开 `edge://extensions`，开启“开发人员模式”。
3. 选择“加载解压缩的扩展”，选中直接含 `manifest.json` 的目录。
4. 打开新标签页，查看首次使用说明。按 `Shift+F10` 或在空白处右键添加内容。

也可克隆仓库后直接加载 `extension/` 目录。安装包的 SHA-256 见 [dist/SHA256.txt](dist/SHA256.txt)。

## 备份与换电脑

在右键菜单或侧边栏进入“备份与恢复”，导出完整 `.qidian.json` 文件。在新电脑安装扩展后导入，检查预览并确认恢复。文件包含网址、界面设置、卡片排序和尺寸、壁纸、自定义图片、组件及游戏数据；请自行保管，文件未经加密。

商店版和本地加载版的扩展 ID 不同，不共享浏览器存储，需要手动迁移。旧版的用户图片可以恢复；仅引用旧图标库的图标可能重新匹配或使用默认图标。

## 开发与构建

无需 npm 依赖。使用 Python 3.9+ 和 Node.js 20+：

```sh
python scripts/verify.py
python scripts/package.py
```

构建只打包 `scripts/runtime-files.json` 列出的运行文件，不打包测试、网站、个人备份或 Git 历史。更新运行文件列表或图标资源时，需要同步维护来源与校验值。

- `extension/`：可直接加载的扩展源码。
- `docs/`：GitHub Pages 项目主页和隐私政策。
- `tests/`：备份、工具及游戏规则的功能检查。
- `assets/`：图标来源、校验值和无个人配置的演示截图。
- `dist/`：已校验的商店提交安装包。

GitHub Pages 使用 `main` 分支的 `/docs` 目录。在线政策与 `extension/privacy.html` 保持相同内容。GitHub Pages 页面本身由 GitHub 托管，扩展数据不会因访问该页面而上传给发布者。

## 资源与许可

此公开仓库发布经过清理的商店版，不包含自用版复制的 iTab 图标库或个人网站配置。品牌图标来自 Simple Icons 16.33.0，按 CC0 1.0 使用，并保留来源与声明；商标权仍属于对应品牌，项目与这些品牌无隶属或背书关系。

详见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) 和 [assets/icon-sources.json](assets/icon-sources.json)。项目原创代码目前未指定开放源代码许可证；公开查看不等于授予再分发许可。

## 当前验证范围

运行文件完整性、JavaScript 语法、备份恢复、工具换算、游戏规则和图标匹配检查已通过。浏览器预览已检查主要界面、键盘菜单和游戏弹窗。实际安装后的权限提示、系统定位和商店审核仍需验证。
