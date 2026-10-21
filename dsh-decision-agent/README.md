# 决策子代理 · Codex / Claude Code

为 DeepSeek Harness 提供一个统一的 `subagent_decision` 工具，以及 **设置 → 决策子代理** 页面。

主代理负责编码、测试与交付；决策子代理负责重要方案和关键结果审查。可在 Codex 和 Claude Code 间切换，两者的模型和思考强度分别保存。保存只影响下一次委派，正在执行的任务继续使用启动时的选择。

## 使用

1. 在设置中打开「决策子代理」。
2. 选择 Codex 或 Claude Code。
3. 从该后端返回的模型列表中选择模型和思考强度，或使用「继承原生设置」。支持输入自定义模型 ID。
4. 保存。需要决策审查分工时，新建使用「子Agent 决策模式」的会话。

仅切换表单中的卡片不会立即改变后端，点击保存才生效。Codex 默认仍继承用户原有配置；安装不修改 Codex 或 Claude Code 的全局配置、认证文件和 cc-switch 设置。

### Claude Code 与中转

Claude Code 是运行工具，并不要求底层一定是 Anthropic 模型。它会读取原生认证、`~/.claude/settings.json` 的中转地址和模型映射；cc-switch 已切换的兼容中转也可使用。2026-10-19 已实测当前 OMC / cc-switch 的 DeepSeek V4.1 Flash 路由可完成委派，不要求官方账号登录。

使用中转时，建议选择「继承原生设置」，使 cc-switch 的模型映射继续生效。模型列表与思考能力来自本机 Claude Code，与实际运行使用同一个可执行文件；中转是否接受某个模型或思考参数，以实际服务响应为准。内置别名可能映射到同一个中转模型。

不使用内置「Claude Code 子智能体」自带的 CLI：它跟随 Harness 更新，版本落后时较新的模型不可用（2026-10-21 实测自带 2.1.263 不识别 `claude-opus-5-5`，`opus` 只对应 Opus 5）。

## 实现边界

- Codex 复用已安装的 `@deepseek-ai/dsh-subagent-codex` 适配器、认证、进程生命周期和错误处理。模型通过适配器配置覆盖，思考强度通过本次 app-server 命令的配置覆盖传递。
- Claude Code 同样复用已安装的 `@deepseek-ai/dsh-subagent-claude-code` 适配器：由其官方 Agent SDK 驱动运行和清理进程，但启动的是本机 `claude`，只有这一个 CLI 进程。认证读取 `~/.claude` 原生配置与钥匙串。模型通过适配器配置覆盖；适配器启动 CLI 时追加 `--tools Read,Glob,Grep`、`--safe-mode`（关闭 CLAUDE.md、插件、hooks、MCP 等定制）、只读审查提示词和所选思考强度。若适配器自身的启动参数已包含这些项、MCP/插件目录或非 `dontAsk` 权限模式，拒绝运行。适配器本身没有运行时限，决策运行保留 15 分钟上限。适配器的 SDK 协议版本固定（当前 0.3.263），本机 CLI 升级后应重跑 `--claude-only --smoke` 确认兼容。
- 决策模式只读：Codex 使用只读文件沙箱；Claude Code 仅开放上述读取工具。实现任务由主代理执行。
- 模型目录来自 Codex `model/list`、Claude Code 初始化协议；目录刷新不发起模型推理。列表缓存 5 分钟，可手动刷新。
- 错误不会触发自动切换后端；取消、超时、无有效结果都不能计为成功。
- 配置保存在 `$DSH_HOME/decision-agent/settings.json`，默认目录为 `~/.dsh/decision-agent/`。采用版本检查、原子写入和限制访问权限。界面/API 不读取或返回凭据值。
- 设置 API 仅接受当前 Harness 本机来源与指定请求头，不提供跨域访问。此版本以本机桌面使用为目标。
- 所选模型/强度是请求设置；“继承”时显示的原生默认值来自元数据探测，实际任务的项目级设置和中转映射仍可能影响最终模型。

## 安装

适配已安装的 Harness `0.2.1-rc.2` 插件接口。安装脚本仅创建本地链接和更新 profile，不下载依赖。

```sh
python3 scripts/install.py
```

安装前自动备份 desktop profile 的 `package.json` 和 `cordis.patch.yml`，使用应用自带加载器在隔离 profile 中验证合成配置。安装会将已有 `standard` 预设改成中立的「子Agent 决策模式」，把重要决策指令改为 `subagent_decision`，关闭全局直接 Codex 工具以避免绕过所选后端。Codex 原生提供方仍保留。

需要保留内置「Codex 子智能体」与「Claude Code 子智能体」两个包：插件页开关可以关闭（只取消配置层），但不能移除包。Claude Code 后端还需要本机已安装 `claude` CLI。

重启 Harness 后加载插件。源码为本地链接；移动或删除此目录前，应先移除 profile 中相应的 bundle/dependency 和插件入口。

## 验证

```sh
npm test
```

测试覆盖独立配置与持久化、并发编辑冲突、模型参数校验、两个后端的参数传递、只读参数冲突时拒绝运行、Claude Code 运行上限、HTTP 来源检查、运行中选择冻结。

以下脚本复用桌面应用内的模块进行集成验证：

```sh
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --catalog
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --smoke
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --claude-only --smoke
```

`--smoke` 会发送最小连接测试，产生少量实际模型用量；不读取工作区文件。
