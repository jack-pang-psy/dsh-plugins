# dsh-plugins

DeepSeek Harness 插件集合：一组为 DSH（DeepSeek Harness）编写的插件包，通过 `cordis.patch.yml` 注入 web profile 的 loader entry。

## 目录结构

| 插件 | 说明 |
| --- | --- |
| [`dsh-skin-desktop`](./dsh-skin-desktop) | 桌面优先主题插件：7 套精选皮肤、壁纸（透明度与模糊）、与 Electron 原生窗口的主题联动；持久化在主进程 `$DSH_HOME/desktop/theme.json`。 |
| [`dsh-tool-subagent-vision`](./dsh-tool-subagent-vision) | 视觉输入插件：request 层图片翻译（图片块在被纯文本模型看到前替换为视觉模型翻译结果，按附件缓存）+ `subagent_vision` 委派工具。 |
| [`dsh-ui-session-tree`](./dsh-ui-session-tree) | Git-graph 风格会话树插件：把会话分支渲染为右侧面板中的垂直交互式分支树，支持 fork-at-turn 与 rewind。 |

## 安装

每个插件目录内都有 `install.sh`，例如：

```bash
bash dsh-plugins/dsh-skin-desktop/install.sh
```

执行每个插件自带的 `cordis.patch.yml` 补丁，然后在 Web/桌面 app 中重启插件以生效。

## 环境

- 需要 DeepSeek Harness 运行时与对应版本的 `@deepseek-ai/*` peer 依赖（各插件 `package.json` 中声明）。
- 各插件均声明 `@deepseek-ai/cordis` 为 peer 依赖，通过 DSH 的 bundle/patch 机制加载。

## License

各插件均为 MIT（见各插件目录内 `LICENSE`）。
