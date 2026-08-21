# dsh-skin-desktop

DeepSeek Harness Electron 壳的桌面优先主题插件:7 套精选皮肤、背景图片/壁纸(透明度与模糊),以及与 Electron 原生窗口的联动。

与 Web 版 `dsh-skin` 的区别:

- **持久化在主进程**:皮肤与壁纸写入 `$DSH_HOME/desktop/theme.json`,不再依赖随机端口 origin 下的 `localStorage`(壁纸不会再每次启动丢失)。
- **原生窗口联动**:Electron 主进程把皮肤映射到 `nativeTheme.themeSource`,并在窗口创建/重建时设置 `BrowserWindow` 的 `backgroundColor`,启动不再闪白。
- **安全桥**:`apps/desktop/config/preload.cjs` 用 `contextBridge` 暴露 `window.dshDesktopTheme`,渲染进程仍然保持 `sandbox: true` / `contextIsolation: true`。
- **Web 兜底**:在普通浏览器打开同一个 profile 时自动回退到 `dsh-skin` 的 cookie/localStorage 路径。
- **首屏即皮肤**:host 半边在 `dsh web` 返回 index.html 前注入上次选择的皮肤,首帧不再先显示默认主题。

## 组成

- `lib/index.js` — host 半边:读取 `$DSH_HOME/desktop/theme.json`,通过 `webServer.tapIndex` 注入首屏皮肤
- `lib/skins.js` — host 半边使用的皮肤目录(由 `scripts/generate-skins.mjs` 从 client bundle 同步生成)
- `lib/client.js` — 浏览器半边(`__ModuleLoader__` CJS bundle):注册皮肤、Settings 行、壁纸层,等待 `ui-theme` 设置加载完成后恢复皮肤
- `cordis.patch.yml` — 向 web profile 插入 `skin-desktop` loader entry

## 安装到 web profile

```bash
bash /Users/psy/ai-chat/dsh-skin-desktop/install.sh
```

然后重启 Web/桌面 app。

桌面桥需要 `apps/desktop` 的以下文件(已随壳构建进入 app):

- `src/desktop-theme-state.ts` — 纯状态/校验/JSON 持久化
- `src/desktop-theme.ts` — Electron store、nativeTheme、IPC
- `config/preload.cjs` — 渲染进程安全桥
- `src/window.ts` / `src/main.ts` — 创建窗口时挂 preload 与背景色

打包工具不需要额外改动:packager 已经会复制 shell 的 `lib/` 和 `config/`。
