# FORK.md — 本地 fork `@deepseek-ai/dsh-subagent-claude-code` 的来源、差异、安装与回滚

本目录是 **`@deepseek-ai/dsh-subagent-claude-code@0.2.1-rc.2` 的本地 fork**（上游：
[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的
`packages/subagent/subagent-claude-code`，MIT，原始许可证见 [LICENSE](./LICENSE)）。
不发布、不推 npm，仅以 `link:` 方式装进本机 desktop profile 自用。

基线就是 registry 发布的 tarball：`npm pack @deepseek-ai/dsh-subagent-claude-code@0.2.1-rc.2`
（integrity `sha512-iyfQyKN+gM/gxS12uh904ddo7jbW7ezyerYWVStZf/bsLQ26hUwxf89sMv6sF1kuVTt+Zi9nOkjbA/tbM89nWA==`，
与 profile `pnpm-lock.yaml` 记录一致）解出来的文件，fork 前已用 `diff -r` 核对 profile 里装的副本与它逐字节相同。

## 为什么要 fork

CC Switch 对 Claude 是 `direct` 模式（不走本地代理），Claude Code 的用量只有一个来源：
扫描 `~/.claude/projects/**/*.jsonl` 会话日志，导入 `proxy_request_logs`（`data_source='session_log'`）。

上游包在 `claudeQueryOptions()` 里写死了 `persistSession: false`，Agent SDK 因此给 CLI 加
`--no-session-persistence`（`sdk.mjs`：`if(this.options.persistSession===!1)Y.push("--no-session-persistence")`）。
于是经 DSH（包括 `dsh-decision-agent` 的 Claude 后端，它直接复用本包的 `apply`）跑的
Claude Code 一条会话日志都不留，CC Switch 永远统计不到。fork 只做一件事：**让这些运行写会话日志。**

## 与原包（0.2.1-rc.2）的差异清单

| # | 位置 | 差异 | 为什么 |
|---|---|---|---|
| 1 | `lib/index.js:306`（`claudeQueryOptions`） | `persistSession: false,` → `persistSession: true,` | 唯一的行为差异：SDK 不再传 `--no-session-persistence`，CLI 按默认把会话写到 `~/.claude/projects/<cwd>/<session>.jsonl` |
| 2 | `package.json` | `version` → `0.2.1-rc.2-fork.1`；新增 `forkOf` | 身份标识。`name`、`exports`、`dsh.bundle.patch`、`dependencies`、`peerDependencies` 全部原样（包名必须保持，profile 的 bundle 列表与 `dsh-decision-agent` 都按这个名字解析） |
| 3 | `FORK.md`、`scripts/verify.sh`、`scripts/e2e-harness.mjs` | 新增 | 说明与验证工具，不参与运行时 |
| 4 | `pnpm-workspace.yaml`、`pnpm-lock.yaml`、`node_modules/`（git 忽略） | 新增 | fork 自己的运行时依赖（见下节） |

**没有差异的部分**（逐字节等价，`diff -r` 可复核）：`lib/index.js` 除第 306 行外的全部内容——一次性子代理、
abort / 取消、单飞的 run handle、诊断回调、`scrubbedParentEnv()` 环境、权限模式与 `canUseTool` 拒绝、
`onElicitation` / `onUserDialog`、`spawnClaudeCodeProcess` 托管进程；以及 `cordis.patch.yml`、`lib/types/**`、
`locale/`、`icon.svg`、`LICENSE`、`README*`。
`lib/index.js:295` 的 JSDoc 与 `lib/types/run.d.ts:79` 仍写着 “disabling persistence”，**故意不改**，
保持 `lib/index.js` 只有一行差异；README 里 “non-persisted product session” 的描述同理。

```bash
npm pack @deepseek-ai/dsh-subagent-claude-code@0.2.1-rc.2 && tar xzf deepseek-ai-dsh-subagent-claude-code-0.2.1-rc.2.tgz
diff -r package . -x node_modules -x scripts -x FORK.md -x pnpm-lock.yaml -x pnpm-workspace.yaml
# 预期只有 lib/index.js 第 306 行与 package.json（version / forkOf）
```

## 运行时怎么解析到这里

- profile 里 `node_modules/@deepseek-ai/dsh-subagent-claude-code` 是指向本目录的软链（`link:`），
  `dsh-app-boot` 把它当作 linked root：本包 `peerDependencies`（`dsh-subagent` / `dsh-subprocess` /
  `dsh-timeout` …）**一律路由到 DSH 安装副本**，与原来一致；非 peer 依赖（`@anthropic-ai/claude-agent-sdk`、
  `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-brand`）从**本目录的 `node_modules`** 解析。
- `link:` 依赖的依赖不会被 profile 的 pnpm 安装，所以本目录要自己装一份。版本与原 profile 安装一致：
  运行时闭包 `claude-agent-sdk@0.3.263`、`claude-agent-sdk-darwin-arm64@0.3.263`、`@anthropic-ai/sdk@0.93.0`、
  `schemastery@3.18.5`、`cosmokit`、`dsh-brand@0.2.1-rc.2`、`zod@4.4.3`、`@modelcontextprotocol/sdk@1.32.1`
  与原 profile 副本 `diff -rq` 完全相同（同一 pnpm store）。只有 `@modelcontextprotocol/sdk` 的 5 个传递依赖
  （`debug` / `eventsource` / `jose` / `pkce-challenge` / `which`）是更新的补丁版本——它们不在本包的执行路径上
  （`sdk.mjs` 自带打包，只引用 Node 内置模块）。
- `bundle patch` 插入的 `@deepseek-ai/dsh-tool-subagent` 由 loader 从 DSH 安装目录加载，不用本目录的副本。
- `dsh-decision-agent` 的 `import '@deepseek-ai/dsh-subagent-claude-code'` 经 profile 软链落到同一个真实路径，
  与 loader 加载的是同一个模块实例。

## 安装

```bash
PNPM=("/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node" \
      "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs")

# 1) fork 自己的运行时依赖（按 pnpm-lock.yaml 原样复现；devDependencies 不装）
cd /Users/psy/ai-chat/dsh-plugins/dsh-subagent-claude-code && "${PNPM[@]}" install --prod --frozen-lockfile

# 2) profile 改用 fork：只改 dependencies 里这一行（dsh.profile.bundles 里的包名不动）
#    "@deepseek-ai/dsh-subagent-claude-code": "0.2.1-rc.2"
#  → "@deepseek-ai/dsh-subagent-claude-code": "link:/Users/psy/ai-chat/dsh-plugins/dsh-subagent-claude-code"
cd ~/.dsh/profiles/desktop && "${PNPM[@]}" install
```

第 2 步的副作用（实测预览过 lock 差异）：

- 锁文件里该依赖变成 `link:`；顺带补上此前手工加入、但没进锁文件的 3 个 `link:` 依赖
  （`dsh-computer-use-compare` / `dsh-decision-agent` / `dsh-zoro-channel-theme`），软链目标不变。
- profile 根 `node_modules` 剪掉 94 个**只被 registry 版本本包引用**的包（lock 中 94 个，pnpm 输出 `+2 -125`
  个安装位置：`claude-agent-sdk` 及平台二进制、`@anthropic-ai/sdk`、`@modelcontextprotocol/sdk`、express 一族等）。
  已扫描 profile 内全部包与三个链接插件，没有未声明却依赖它们的代码（唯一命中是 `pngjs/browser.js` 的浏览器打包产物，
  不在 Node 侧加载）。顶层 `zod` 由 4.4.3 换成 4.6.5（4.4.3 改为嵌套在 `dsh-tool-subagent` 下），各依赖方拿到的版本不变，
  也没有未声明 `zod` 的使用方。
- **装完到重启前**，正在运行的 DSH 仍在内存里用旧 SDK；旧 SDK 每次 `query()` 都会去找 profile 里
  `claude-agent-sdk-darwin-arm64/claude`，已被剪掉 → 这段时间里 Claude Code 决策子代理会报
  “Native CLI binary for darwin-arm64 not found”。**装完立刻完全退出并重开 DeepSeek Harness。**

## 验证

```bash
S=/Users/psy/ai-chat/dsh-plugins/dsh-subagent-claude-code/scripts/verify.sh
"$S" structure                          # A：profile 解析到 fork、persistSession: true、依赖齐全
"$S" harness                            # B（自驱）：经 fork + decision-agent 的 captureClaude 真跑一次 haiku，
                                        #   再等 CC Switch 导入（最多 10 分钟）
"$S" check --since "2026-10-21 23:00" --wait 10
                                        # B（DSH 真实运行后）：找该时间后 entrypoint=sdk-ts 的会话日志及其 CC Switch 行
```

2026-10-21 实测（同一 harness、同一 haiku 任务，只换 `--lib`）：

| lib | 结果 | 会话日志 | CC Switch |
|---|---|---|---|
| 原包 0.2.1-rc.2 | `completed` / `OK` | 0 个 | 无 |
| 本 fork | `completed` / `OK` | `~/.claude/projects/-private-tmp-dsh-cc-fork-e2e/fabf2448-….jsonl`，`entrypoint: sdk-ts`，1 条带 usage 的 assistant 消息 | `22:37:51 claude-haiku-4-5-20251001 in=3570 out=43 $0.003785 session_log` |
| 本 fork，DSH 重启（23:09）后真实的 `subagent_decision` | `finished` / `FORK-E2E-OK` | `~/.claude/projects/-Users-psy-ai-chat/c2526433-….jsonl`，`entrypoint: sdk-ts`，opus，1 条带 usage 的 assistant 消息 | `23:14:23 claude-opus-5-5 out=12 cache_creation=3680 $0.029688 session_log` |

`e2e-harness.mjs` 用 DSH 自带的 Electron（node 模式）运行，peer 从 `app.asar` 的安装副本加载、非 peer 从本目录加载，
与 DSH 内的解析一致；子进程服务是一个最小的本地替身（不是 `dsh-subprocess-local`），环境变量按 DSH 宿主的样子清洗
（不带 `CLAUDE*` / `ANTHROPIC*`）。`--lib <path>` 可换成原包做对照。

## 回滚

```bash
P=~/.dsh/profiles/desktop
python3 - "$P/package.json" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('"@deepseek-ai/dsh-subagent-claude-code": "link:/Users/psy/ai-chat/dsh-plugins/dsh-subagent-claude-code"',
            '"@deepseek-ai/dsh-subagent-claude-code": "0.2.1-rc.2"')
open(p,'w').write(s)
PY
cd "$P" && "${PNPM[@]}" install        # 从 pnpm store 重新链接 registry 版本与被剪掉的依赖，无需联网
# 然后完全退出并重开 DeepSeek Harness
```

也可以直接用改动前的备份（`$P/subagent-claude-code-fork-backup-20261021-223915/` 里的 `package.json` /
`pnpm-lock.yaml`，另有原包目录、`.modules.yaml` 与切换前的顶层包版本清单）覆盖回去再 `install --frozen-lockfile`。插件管理器里对 “Claude Code 子智能体” 点安装 / 更新，会把依赖改回 registry
版本，效果等同回滚。回滚后已经写下的会话日志和 CC Switch 里已导入的用量不受影响。

## 行为影响

- 每次 Claude Code 子代理运行都会在 `~/.claude/projects/<工作区路径>/<session>.jsonl` 留一份会话日志
  （`entrypoint: "sdk-ts"`），内容含委派的任务文本与模型输出；会出现在该工作区的 `claude --resume` 列表里，
  按 Claude Code 的 `cleanupPeriodDays`（默认 30 天）自动清理。DSH 自己仍然是一次性运行，不会续接或恢复它们。
- 历史缺口补不回来：fork 生效之前的子代理运行没有写日志，CC Switch 无从导入。

## 上游升级步骤

1. `npm pack @deepseek-ai/dsh-subagent-claude-code@<新版本>`，解包后用其文件覆盖本目录
   （**不要覆盖** `FORK.md`、`scripts/`、`pnpm-workspace.yaml`）；
2. 在新版 `lib/index.js` 里重新把 `persistSession: false` 改成 `true`（`grep -n persistSession lib/index.js` 应只有这一处）；
3. `package.json`：`version` → `<新版本>-fork.1`，加回 `forkOf`（版本与 integrity 取自 `npm pack --json`）；
4. 删除 `pnpm-lock.yaml` 后 `install --prod`，对照 profile 旧副本核对运行时闭包；
5. 若新版 DSH 的 profile 还在用旧的 registry 规格，按「安装」第 2 步重新指向 fork；重启后跑 `verify.sh structure` 与 `check`。
