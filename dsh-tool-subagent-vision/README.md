# dsh-tool-subagent-vision

给 DeepSeek Harness 增加**视觉输入能力**的插件。核心设计:**视觉翻译层** —— 主模型永不切换,图片在后台由视觉模型识别成文字,再注入主 agent 上下文。视觉模型复用 DSH 现有的 `opencode-go/qwen3.7-plus`(**不需要额外网关、不需要新密钥**)。

两种能力:

1. **图片翻译(默认)**:对话框发"文字 + 图片" → **图片正常显示在会话里**(历史保留原图),插件在**请求层**把它交给视觉模型(qwen3.7-plus,走 DSH 的 LLM 服务)识别,输出**结构化结果**(caption / OCR / 元素列表 / 布局 / 问题 / 回答,对应 Open WebUI Vision Router 提案与 SeeingEye 的结构化中间表示)→ 请求发给主模型前,图片被替换为 `[图片后台识别结果]` 文本 → **主模型(如 deepseek-v4-flash)收到的是纯文本,永不切换模型**。同一张图只识别一次(进程内缓存,Open WebUI 的 "mark as processed" 行为);目标模型本身支持视觉时不做替换(直接看原图);嵌在 tool 结果里的图片(如 `read_image` 的返回)同样会被替换;旧版本产生的、历史里已含图片的会话由同一套请求层替换覆盖,无需单独的 legacy 路由。
2. **`subagent_vision` 工具**:显式派一个视觉子 agent 深度分析工作区图片(同一套视觉模型),返回结构化发现。

## 原理

- **图片准入**:包装 `apiProxy.sessions.prompt` + `selectModel` —— 图片正常进入会话历史(UI 显示),仅调用期间临时放行"模型支持图片"的能力回答(`finally` 恢复);`resolveCallConfig` 不读模态字段,无副作用。
- **请求层翻译**:包装 `llm.prepareCall`(loop 实际使用的入口)和 `llm.stream`(fallback)—— 请求消息含图且目标模型不支持图片时,先通过视觉模型(`prepareCall` + `stream` + `BlockAssembler`)翻译并缓存,再把消息里的 image block 替换为文本后转发;翻译请求带 `__visionTranslation` 标记不会递归。缓存按内容寻址 attachmentId,同一张图只翻译一次。
- **`subagent_vision`**:宿主平面注册工具,子 agent 继承父预设(含 `read_image`),`agentOptions` 覆盖模型,persona 注入视觉分析指令。

## 安装(web profile)

```bash
bash /Users/psy/ai-chat/dsh-tool-subagent-vision/install.sh
# 然后重启 web app / 刷新 GUI
```

> 注:`dsh plugin --profile web add file:...` 在这台机器上会卡死在 pnpm 的 lockfile 解析,install.sh 采用手工安装(拷贝 + 更新 package.json)。loader 按 app anchor → profile 目录解析 bundle,不依赖 pnpm 元数据。

## 使用

- **发图**:直接传图片(可带文字)→ **图片立即显示在会话里**,后台自动识别,主 agent 通过文字转述了解图片;主模型保持你的选择(如 deepseek-v4-flash),第一次请求会等待识别(数秒到几十秒),后续轮次直接复用缓存。
- **深度分析**:`subagent_vision(description, prompt)` — prompt 里给图片路径和问题,子 agent 用 `read_image` 看原图;`run_in_background: true` 可后台。
- **识别失败**时:消息里会出现 `[图片后台识别失败: 原因]`,主 agent 会告诉你;失败不进缓存,下一轮请求会自动重试,也可改用 `subagent_vision`。

## 配置

`cordis.patch.yml` 中 `tool-subagent-vision` 行:

| 字段 | 作用 | 默认 |
| --- | --- | --- |
| `provider` | subagent spawn provider | `spawn` |
| `modelProvider` / `model` | subagent_vision 子 agent 模型 | `opencode-go` / `qwen3.7-plus` |
| `enableRunInBackground` | 子 agent 工具后台开关 | `true` |
| `translateImages` | 图片翻译开关(关掉后:回退宿主默认行为,文本模型拒收图片,仅保留 `subagent_vision` 工具) | `true` |
| `translateModelProvider` / `translateModel` | 翻译用的视觉模型 | `opencode-go` / `qwen3.7-plus` |
| `translateTimeoutMs` | 单次翻译超时 | `120000` |

> `automaticRouting` / `visionProvider` / `visionModel` 与 `vision-auto` provider 注册已在 0.5.0 移除:请求层替换已覆盖旧含图会话,legacy 路由不再需要。

## 卸载

```bash
rm -rf "$HOME/.dsh/profiles/web/node_modules/dsh-tool-subagent-vision"
# 从 $HOME/.dsh/profiles/web/package.json 的 dependencies 和 dsh.profile.bundles 删除 dsh-tool-subagent-vision
```

## 局限与说明

- 视觉识别是**转述**,有信息损耗:主 agent 看到的是文字描述,不是原图。需要精确看图时用 `subagent_vision`(子 agent 直接读原图)。
- 图片走宿主的正常上传/准入路径进入会话历史(限额、附件存储 `~/.dsh/attachments/v1/` 均由宿主管理,与不带本插件时上传图片同待遇);翻译只发生在请求层,不额外落盘。
- 翻译是一次视觉模型调用,含图请求首次发出会等待识别(数秒到几十秒);多张图按顺序逐张翻译,最坏等待为 N × `translateTimeoutMs`。识别成功的译文按 attachmentId 进程内缓存,同一张图跨轮次/跨会话只翻译一次。
- 对 `apiProxy.sessions.prompt` / `sessions.selectModel` / `llm.prepareCall` / `llm.stream` 做了窄包装(edison 方案的延续);包装在调用期间生效,失败路径恢复原方法,插件卸载时全部还原。
- 若 app 升级后 profile node_modules 被重建,重跑 install.sh。
