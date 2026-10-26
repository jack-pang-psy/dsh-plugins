# 决策子代理 · Codex / Claude Code / Grok Build

为 DeepSeek Harness 提供一个统一的 `subagent_decision` 工具，以及 **设置 → 决策子代理** 页面。

主代理负责编码、测试与交付；决策子代理负责重要方案和关键结果审查。可在 Codex、Claude Code 和 Grok Build 间切换，各后端的模型和思考强度分别保存。保存只影响下一次委派，正在执行的任务继续使用启动时的选择。

## 使用

1. 在设置中打开「决策子代理」。
2. 选择 Codex、Claude Code 或 Grok Build。
3. 从该后端返回的模型列表中选择模型和思考强度，或使用「继承原生设置」。支持输入自定义模型 ID。
4. 保存。需要决策审查分工时，新建使用「子Agent 决策模式」的会话。

仅切换表单中的卡片不会立即改变后端，点击保存才生效。Codex 默认仍继承用户原有配置；安装不修改 Codex 或 Claude Code 的全局配置、认证文件和 cc-switch 设置。

### Claude Code 与中转

Claude Code 是运行工具，并不要求底层一定是 Anthropic 模型。它会读取原生认证、`~/.claude/settings.json` 的中转地址和模型映射；cc-switch 已切换的兼容中转也可使用。2026-10-19 已实测当前 OMC / cc-switch 的 DeepSeek V4.1 Flash 路由可完成委派，不要求官方账号登录。

使用中转时，建议选择「继承原生设置」，使 cc-switch 的模型映射继续生效。模型列表与思考能力来自本机 Claude Code，与实际运行使用同一个可执行文件；中转是否接受某个模型或思考参数，以实际服务响应为准。内置别名可能映射到同一个中转模型。

不使用内置「Claude Code 子智能体」自带的 CLI：它跟随 Harness 更新，版本落后时较新的模型不可用（2026-10-21 实测自带 2.1.263 不识别 `claude-opus-5-5`，`opus` 只对应 Opus 5）。

### Codex 与中转

Codex 同样直接使用 `~/.codex` 的当前配置，cc-switch 切换的中转（`model_provider = "custom"`）无需 OpenAI 官方账号。设置页按 app-server 的元数据判断连接方式：`config/read` 的 `model_provider` 不是 `openai` 时显示为中转；登录提示读取 `account/read`，返回空账号时再以 `getAuthStatus`（不带 token）判断登录方式，中转声明 `requires_openai_auth = false` 时不检查 OpenAI 认证。两者都不刷新 token，避免改写与 Codex 其他客户端共用的 `auth.json`；因此 ChatGPT 登录的 access token 待刷新时也不会误报未登录（2026-10-26 以 codex 0.163.0 实测官方登录、两种中转和未登录四种情况）。

## 实现边界

- Codex 复用已安装的 `@deepseek-ai/dsh-subagent-codex` 适配器、认证、进程生命周期和错误处理。模型通过适配器配置覆盖，思考强度通过本次 app-server 命令的配置覆盖传递。
- Claude Code 同样复用已安装的 `@deepseek-ai/dsh-subagent-claude-code` 适配器：由其官方 Agent SDK 驱动运行和清理进程，但启动的是本机 `claude`，只有这一个 CLI 进程。认证读取 `~/.claude` 原生配置与钥匙串。模型通过适配器配置覆盖；适配器启动 CLI 时追加 `--tools Read,Glob,Grep`、`--safe-mode`（关闭 CLAUDE.md、插件、hooks、MCP 等定制）、只读审查提示词和所选思考强度。若适配器自身的启动参数已包含这些项、MCP/插件目录或非 `dontAsk` 权限模式，拒绝运行。与 Codex 一致，不设运行时限，长时间运行由调用方取消。适配器的 SDK 协议版本固定（当前 0.3.263），本机 CLI 升级后应重跑 `--claude-only --smoke` 确认兼容。
- Grok Build 没有 Harness 内置适配器：每次委派在父会话工作区运行一次本机 `grok`（优先 `~/.grok/bin/grok`）的无界面单轮模式 `--prompt-file … --output-format json`，模型可选 `grok-4.7-build-fast`（默认）、`grok-4.7`、`grok-4.6`，附加 `--sandbox read-only`（系统级只读沙箱）、`--tools read_file,grep,list_dir`、`--permission-mode dontAsk`、`--no-subagents`、`--disable-web-search`、只读审查提示词（`--rules`）和所选思考强度（`--reasoning-effort`）。进程经共享 subprocess 服务启动，取消时终止进程；提示词写入权限 600 的临时文件，结束后删除。启动时显式移除继承的 `RUST_LOG`（Harness 的环境清洗会保留它；开启后 headless 会向 stderr 输出调试日志，可能带出请求内容，未验证），使 grok 保持默认静默。释放（dispose）时无论 CLI 是否已自行退出，都会先终止整个进程组再等待其清空，否则它遗留的子进程会使委派一直挂起。运行失败（非取消）时，已识别的原因（未登录须运行 `grok login`、速率/用量限制、网络或服务暂时不可用、模型不可用）在结果中只给出固定提示，未识别的只报告退出码，两者都附上日志文件路径。CLI 原始 stderr 的末尾 8 KiB 与 stdout 的末尾 2 KiB（仅当结果没有答复文本、且不是被截断的结果文档）连同退出码和时间，只写入 `$DSH_HOME/decision-agent/grok-last-failure.log`，不进入模型可见的结果；`DSH_HOME` 的解析与 Harness 一致（空白视为未设置，展开 `~`，转为绝对路径），默认 `~/.dsh/decision-agent/`。文件权限始终为 600、原子覆盖、只保留最近一次失败；目录仅在由插件新建时设为 700，已存在的目录保持原权限。插件不写入提示词，但这些内容是 grok 自己的输出，不由插件控制。Harness 日志器默认丢弃 warn 级消息，因此日志器里另发的那一行指向该文件的提示默认也不可见。结果结算与运行句柄复用 Harness 的 `settleRunResult` / `subprocessRunHandle`（与内置 Codex 适配器一致）。认证读取 `~/.grok` 原生登录。
- 决策模式只读：Codex 使用只读文件沙箱；Claude Code 仅开放上述读取工具；Grok Build 使用只读沙箱与读取工具。实现任务由主代理执行。
- 模型目录来自 Codex `model/list`、Claude Code 初始化协议；Grok Build 提供 `grok-4.7-build-fast`（默认）、`grok-4.7`、`grok-4.6` 三个模型（思考强度均为 low / medium / high / xhigh），并用 `grok models` 检查登录状态，只列出当前账号可用的模型。目录刷新不发起模型推理。列表缓存 5 分钟，可手动刷新。
- 错误不会触发自动切换后端；取消、超时、无有效结果都不能计为成功。
- 配置保存在 `$DSH_HOME/decision-agent/settings.json`，默认目录为 `~/.dsh/decision-agent/`。采用版本检查、原子写入和限制访问权限。界面/API 不读取或返回凭据值。
- 设置 API 仅接受当前 Harness 本机来源与指定请求头，不提供跨域访问。此版本以本机桌面使用为目标。
- 所选模型/强度是请求设置；“继承”时显示的原生默认值来自元数据探测，实际任务的项目级设置和中转映射仍可能影响最终模型。

## 安装

适配 Harness `0.2.1-rc.2` 与 `0.2.1-rc.3` 的插件接口（两版的 Codex / Claude Code 适配器代码相同）。Harness 自 `0.2.1-rc.3` 起在启动时检查插件声明的 `@deepseek-ai/dsh-*` peer 版本，不满足即跳过整个插件；因此 peer 范围为 `^0.2.1-rc.2`，0.2.x 内的更新无需改动即可加载，适配器参数不兼容时仍由运行时拒绝。安装脚本仅创建本地链接和更新 profile，不下载依赖。

```sh
python3 scripts/install.py
```

安装前自动备份 desktop profile 的 `package.json` 和 `cordis.patch.yml`，使用应用自带加载器在隔离 profile 中验证合成配置。安装会将已有 `standard` 预设改成中立的「子Agent 决策模式」，把重要决策指令改为 `subagent_decision`，关闭全局直接 Codex 工具以避免绕过所选后端。Codex 原生提供方仍保留。

需要保留内置「Codex 子智能体」与「Claude Code 子智能体」两个包：插件页开关可以关闭（只取消配置层），但不能移除包。Claude Code 后端还需要本机已安装 `claude` CLI；Grok Build 后端需要本机已安装并登录 `grok` CLI（`grok login`）。

重启 Harness 后加载插件。源码为本地链接；移动或删除此目录前，应先移除 profile 中相应的 bundle/dependency 和插件入口。

## 验证

```sh
npm test
```

测试覆盖独立配置与持久化、并发编辑冲突、模型参数校验、三个后端的参数传递、只读参数冲突时拒绝运行、HTTP 来源检查、运行中选择冻结。

以下脚本复用桌面应用内的模块进行集成验证：

```sh
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --catalog
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --smoke
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --claude-only --smoke
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' scripts/runtime-check.cjs --grok-only --smoke
```

`--smoke` 会发送最小连接测试，产生少量实际模型用量；不读取工作区文件。
