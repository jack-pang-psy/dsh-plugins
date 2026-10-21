#!/bin/bash
# Verify the dsh-subagent-claude-code fork (see FORK.md).
#   verify.sh structure                 A: the profile resolves to this fork and the fork persists sessions
#   verify.sh harness [harness args]    B: one real run through this fork (scripts/e2e-harness.mjs), then `check`
#   verify.sh check [--since TIME] [--wait MIN]
#                                       B: Agent SDK transcripts (entrypoint sdk-ts) written since TIME
#                                          (default: 30 minutes ago) and their CC Switch usage rows
set -uo pipefail

FORK="$(cd "$(dirname "$0")/.." && pwd -P)"
PROFILE="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/desktop}"
APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
DB="${CC_SWITCH_DB:-$HOME/.cc-switch/cc-switch.db}"
PKG="$PROFILE/node_modules/@deepseek-ai/dsh-subagent-claude-code"
DSH_NODE="$APP/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"

structure() {
  local ok=0
  echo "\$ readlink -f $PKG"; readlink -f "$PKG"
  [ "$(readlink -f "$PKG")" = "$FORK" ] && echo "  -> resolves to the fork" || { echo "  -> NOT the fork"; ok=1; }
  echo "\$ grep -n persistSession $FORK/lib/index.js"; grep -n "persistSession" "$FORK/lib/index.js"
  grep -q "persistSession: true," "$FORK/lib/index.js" || ok=1
  echo "\$ profile dependency spec"
  grep -n '"@deepseek-ai/dsh-subagent-claude-code"' "$PROFILE/package.json"
  echo "\$ node --check lib/index.js"; "$DSH_NODE" --check "$FORK/lib/index.js" && echo "  syntax OK" || ok=1
  echo "\$ fork runtime dependencies"
  for dep in @anthropic-ai/claude-agent-sdk @anthropic-ai/claude-agent-sdk-darwin-arm64 @deepseek-ai/schemastery @deepseek-ai/dsh-brand; do
    local v; v=$("$DSH_NODE" -p "require('$FORK/node_modules/$dep/package.json').version" 2>/dev/null) || { echo "  MISSING $dep"; ok=1; continue; }
    echo "  $dep@$v"
  done
  [ -x "$FORK/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude" ] || { echo "  MISSING bundled claude binary"; ok=1; }
  echo "\$ DSH's own runtime resolution (installation dsh-app-boot)"
  ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DeepSeek Harness" --input-type=module -e '
    import { realpathSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    const [app, dir, home] = process.argv.slice(1);
    const boot = await import(pathToFileURL(`${app}/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`).href);
    const anchor = `${app}/package.json`;
    const profile = boot.loadProfileDirectory("dsh", dir, anchor);
    const layer = profile.layers.find((l) => l.packageName === "@deepseek-ai/dsh-subagent-claude-code");
    console.log(`  bundle layers=${profile.layers.length} skipped=${JSON.stringify(profile.skippedBundles)}`);
    console.log(`  claude-code layer -> ${layer ? realpathSync(layer.packageDir) : "MISSING"}`);
    const res = await boot.createRuntimeResolution({ installAnchor: anchor, profile, home });
    console.log(`  linked root: ${JSON.stringify(res.linkedRoots.find((r) => r.name === "@deepseek-ai/dsh-subagent-claude-code"))}`);
    for (const e of res.entries) if (/^(@anthropic-ai\/claude-agent-sdk|@deepseek-ai\/(dsh-subagent|dsh-subprocess|dsh-timeout))$/.test(e.name)) console.log(`  ${e.name} -> ${e.scope} ${e.version} ${e.packageDir}`);
    process.exitCode = layer && profile.skippedBundles.length === 0 ? 0 : 1;
  ' "$APP/Contents/Resources/app.asar/dsh" "$PROFILE" "$(dirname "$(dirname "$PROFILE")")" || ok=1
  return $ok
}

check() {
  local since="" wait=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --since) since="$2"; shift 2 ;;
      --wait) wait="$2"; shift 2 ;;
      *) echo "unknown option $1" >&2; return 2 ;;
    esac
  done
  python3 - "$since" "$wait" "$DB" <<'PY'
import glob, json, os, sqlite3, sys, time
from datetime import datetime, timedelta
since_arg, wait_min, db = sys.argv[1], float(sys.argv[2]), sys.argv[3]
since = datetime.strptime(since_arg, "%Y-%m-%d %H:%M") if since_arg else datetime.now() - timedelta(minutes=30)
cutoff = since.timestamp()
print(f"Agent SDK transcripts (entrypoint sdk-ts) modified since {since:%Y-%m-%d %H:%M}:")
sessions = {}
for path in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    if os.path.getmtime(path) < cutoff: continue
    records = []
    with open(path, errors="ignore") as f:
        for line in f:
            try: records.append(json.loads(line))
            except ValueError: pass
    if not any(r.get("entrypoint") == "sdk-ts" for r in records): continue
    # one record per content block, each repeating its message's usage -> dedupe by message id
    usage = list({r["message"].get("id"): r for r in records if r.get("type") == "assistant" and (r.get("message") or {}).get("usage")}.values())
    sid = next((r["sessionId"] for r in records if r.get("sessionId")), os.path.basename(path)[:-6])
    cwd = next((r["cwd"] for r in records if r.get("cwd")), "?")
    out = sum(r["message"]["usage"].get("output_tokens", 0) for r in usage)
    print(f"  {path}\n    session={sid} cwd={cwd} assistant_messages_with_usage={len(usage)} output_tokens={out}")
    if usage: sessions[sid] = len(usage)
if not sessions:
    print("  none with usage -> B not satisfied (trigger a Claude Code decision run in DSH first)")
    sys.exit(1)
deadline = time.time() + wait_min * 60
con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
marks = ",".join("?" * len(sessions))
while True:
    rows = con.execute(f"select datetime(created_at,'unixepoch','localtime'), session_id, model, input_tokens, output_tokens, total_cost_usd, data_source from proxy_request_logs where session_id in ({marks}) order by created_at", list(sessions)).fetchall()
    imported = {r[1] for r in rows if r[6] == "session_log"}
    if imported >= set(sessions) or time.time() >= deadline: break
    time.sleep(15)
print("CC Switch proxy_request_logs rows for those sessions:")
for r in rows: print("  " + "|".join(str(x) for x in r))
missing = set(sessions) - imported
print("  all sessions imported (data_source=session_log)" if not missing else f"  NOT YET IMPORTED: {sorted(missing)}")
sys.exit(0 if not missing else 1)
PY
}

harness() {
  local -a keep=(HOME USER LOGNAME SHELL TMPDIR LANG PATH HTTPS_PROXY HTTP_PROXY ALL_PROXY NO_PROXY no_proxy NVM_DIR)
  local -a env_args=()
  local name
  for name in "${keep[@]}"; do [ -n "${!name:-}" ] && env_args+=("$name=${!name}"); done
  local start; start=$(date "+%Y-%m-%d %H:%M")
  # Clean environment like the DSH host: no CLAUDE*/ANTHROPIC* variables leak in from the caller.
  env -i "${env_args[@]}" ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DeepSeek Harness" "$FORK/scripts/e2e-harness.mjs" "$@" || return $?
  check --since "$start" --wait 10
}

cmd="${1:-structure}"; shift || true
case "$cmd" in
  structure) structure ;;
  check) check "$@" ;;
  harness) harness "$@" ;;
  *) echo "usage: $0 structure | check [--since 'YYYY-MM-DD HH:MM'] [--wait MIN] | harness [e2e-harness args]" >&2; exit 2 ;;
esac
