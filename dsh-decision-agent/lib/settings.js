import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, existsSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const EFFORTS = {
  codex: ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['', 'low', 'medium', 'high', 'xhigh', 'max'],
  grok: ['', 'low', 'medium', 'high', 'xhigh'],
};
export const BACKENDS = ['codex', 'claude', 'grok'];
// Grok Build defaults to its fast build model; the settings page offers exactly these models.
export const GROK_MODEL = 'grok-4.7-build-fast';
// Ids and reasoning efforts as reported by the Grok Build CLI's ACP model state (grok 1.0.66).
export const GROK_MODELS = [
  {id: GROK_MODEL, label: 'Grok 4.7 Build Fast', description: 'Grok Build 快速模型（默认，价格为 Grok 4.7 的 2 倍）。', efforts: ['low', 'medium', 'high', 'xhigh']},
  {id: 'grok-4.7', label: 'Grok 4.7', description: 'Grok 4.7 标准模型。', efforts: ['low', 'medium', 'high', 'xhigh']},
  {id: 'grok-4.6', label: 'Grok 4.6', description: 'Grok 4.6 模型。', efforts: ['low', 'medium', 'high', 'xhigh']},
];
export const DEFAULTS = { backend: 'codex', codex: {model: '', effort: ''}, claude: {model: '', effort: ''}, grok: {model: GROK_MODEL, effort: ''} };
export class SettingsError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateSettings(value) {
  if (!value || typeof value !== 'object' || !BACKENDS.includes(value.backend)) throw new SettingsError('请选择 Codex、Claude Code 或 Grok Build。');
  const result = {backend: value.backend};
  for (const backend of BACKENDS) {
    // Settings saved before Grok Build existed carry no grok entry; it starts from the pinned default.
    const p = backend === 'grok' && value.grok === undefined ? DEFAULTS.grok : value[backend];
    if (!p || typeof p.model !== 'string' || typeof p.effort !== 'string') throw new SettingsError('模型设置格式不正确。');
    const model = p.model.trim();
    if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]-]{0,159}$/.test(model)) throw new SettingsError('模型 ID 只能包含字母、数字、点、下划线、斜线、冒号、方括号或连字符。');
    if (!EFFORTS[backend].includes(p.effort)) throw new SettingsError('思考强度不受此后端支持。');
    result[backend] = {model, effort: p.effort};
  }
  return result;
}
// The same rules as resolveDshHome in @deepseek-ai/dsh-home-paths 0.2.1-rc.2 (plain Node cannot import that package; it also takes an explicit
// override, which this plugin never has): a blank DSH_HOME counts as unset, "~", "~/x" and "~\x" expand to the OS home, and the result is made
// absolute. The settings file and the failure log must land in Harness's own home, whatever spelling of DSH_HOME it was started with.
export function resolveDshHome(env = process.env, home = homedir()) {
  const configured = env.DSH_HOME;
  const raw = configured !== undefined && configured.trim().length > 0 ? configured : join(home, '.dsh');
  return resolve(raw === '~' ? home : raw.startsWith('~/') || raw.startsWith('~\\') ? join(home, raw.slice(2)) : raw);
}
// Where this plugin keeps its files; resolved on every call so DSH_HOME can redirect it.
export const dataDir = () => join(resolveDshHome(), 'decision-agent');
// Private files: 0700 directory (when created here), 0600 file, replaced atomically so a reader never sees a partial write.
export function writePrivateFile(file, text, id = randomUUID()) {
  mkdirSync(dirname(file), {recursive:true, mode:0o700});
  const tmp = file + '.' + id + '.tmp';
  const fd = openSync(tmp, 'wx', 0o600); // exclusive create: a link planted at the temp path is never followed
  try {
    try { writeFileSync(fd, text); } finally { closeSync(fd); }
    renameSync(tmp, file);
  } catch (error) {
    try { rmSync(tmp, {force:true}); } catch {}
    throw error;
  }
}
export function createStore(file = join(dataDir(), 'settings.json')) {
  const read = () => {
    if (!existsSync(file)) return {revision: 'initial', settings: structuredClone(DEFAULTS)};
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return {revision: raw.revision, settings: validateSettings(raw.settings)};
  };
  return {
    read,
    write(settings, revision) {
      const next = validateSettings(settings);
      if (read().revision !== revision) throw new SettingsError('设置已在其他窗口更新，请重新加载后再保存。', 409);
      const document = {version: 1, revision: randomUUID(), settings: next};
      writePrivateFile(file, JSON.stringify(document, null, 2) + '\n', document.revision);
      return {revision: document.revision, settings: next};
    }
  };
}

export function textTask(prompt) {
  if (!Array.isArray(prompt) || !prompt.length || prompt.some(b => b.type !== 'text' || typeof b.text !== 'string')) throw new Error('决策子代理只接受文本任务。');
  const text = prompt.map(b => b.text).join('\n\n');
  if (!text.trim()) throw new Error('决策任务不能为空。');
  return text;
}
export function codexOverrides(argv, effort) {
  if (!EFFORTS.codex.includes(effort)) throw new SettingsError('无效的 Codex 思考强度。');
  return [...argv, '-c', 'sandbox_mode="read-only"', ...(effort ? ['-c', `model_reasoning_effort=${JSON.stringify(effort)}`] : [])];
}
export const CLAUDE_TOOLS = 'Read,Glob,Grep';
export const CLAUDE_REVIEW_PROMPT = '你是只读的决策与代码审查子代理。按委派任务给出简明的方案、证据与审查意见。不得修改文件、执行命令或再次委派任务。不确定时明确指出证据不足。';
// Flags this provider owns. If the adapter's SDK ever sets them itself, refuse to run rather than guess which value wins.
const CLAUDE_RESERVED = new Set(['--tools', '--allowedTools', '--allowed-tools', '--safe-mode', '--effort', '--append-system-prompt', '--mcp-config', '--plugin-dir', '--dangerously-skip-permissions', '--allow-dangerously-skip-permissions']);
export function claudeCatalogArgs() {
  return ['-p', '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--no-session-persistence', '--safe-mode', '--permission-mode', 'dontAsk', '--tools', ''];
}
// Appended to the CLI argv that the built-in adapter's SDK launches: read-only tools, no customizations, chosen effort.
export function claudeOverrides(argv, settings) {
  if (!EFFORTS.claude.includes(settings.effort)) throw new SettingsError('无效的 Claude Code 思考强度。');
  if (argv[argv.indexOf('--permission-mode') + 1] !== 'dontAsk' || argv.some(arg => CLAUDE_RESERVED.has(arg))) throw new Error('Claude Code 适配器的启动参数与只读决策模式冲突，已拒绝运行。');
  return [...argv, '--tools', CLAUDE_TOOLS, '--allowedTools', CLAUDE_TOOLS, '--safe-mode', '--append-system-prompt', CLAUDE_REVIEW_PROMPT, ...(settings.effort ? ['--effort', settings.effort] : [])];
}

export const GROK_TOOLS = 'read_file,grep,list_dir';
// Single-turn headless run: OS-level read-only sandbox, read tools only, no nested subagents or web access.
export function grokArgs(settings, promptFile, cwd) {
  if (!EFFORTS.grok.includes(settings.effort)) throw new SettingsError('无效的 Grok Build 思考强度。');
  return ['--prompt-file', promptFile, '--model', settings.model || GROK_MODEL, '--output-format', 'json', '--sandbox', 'read-only', '--tools', GROK_TOOLS, '--permission-mode', 'dontAsk', '--no-subagents', '--disable-web-search', '--rules', CLAUDE_REVIEW_PROMPT, '--cwd', cwd, ...(settings.effort ? ['--reasoning-effort', settings.effort] : [])];
}
const GROK_STOP = {end_turn: 'completed', max_tokens: 'max-tokens', refusal: 'refusal', cancelled: 'aborted'};
// Where the raw evidence of the latest failed run is kept (see startGrok); resolved on each call like the settings file.
export const grokFailureLog = () => join(dataDir(), 'grok-last-failure.log');
const GROK_SERVICE = 'Grok Build 无法连接服务或服务暂时不可用。请检查网络或代理设置，稍后重试。';
// Fixed explanations for recognizable failures, checked in order. A diagnostic reaches the parent agent's model, so child
// output is only classified here, never echoed. Phrases come from grok 1.0.67's own messages (read from the binary, not exercised);
// they stay phrase-level so unrelated text is unlikely to hit, and `.` stands in for the typographic apostrophes the CLI prints.
const GROK_FAILURES = [
  // Ahead of the sign-in class: "Authentication is temporarily unavailable. Run `grok login` if this persists." is a service blip, not a lapsed login.
  [/temporarily unavailable/i, GROK_SERVICE],
  [/not (?:signed|logged) in|grok login|requires a grok\.com session|sign-in was rejected|no cached credentials|authentication[ _]failed|unauthori[sz]ed|\b(?:http|status)\D{0,9}401\b/i, 'Grok Build 未登录或登录已失效，请在终端运行 `grok login` 后重试。'],
  [/\brate[ _-]?limit|too many requests|usage limit|(?:hit|reached|exceeded) your [a-z ]{0,24}limit|out of credits|purchase more credits|insufficient credits|payment required|service (?:is )?(?:busy|unavailable)|overloaded|\b(?:http|status)\D{0,9}(?:402|429|503|529)\b/i, 'Grok Build 触发了速率或用量限制，或服务繁忙。请稍后重试，并检查账号额度。'],
  // The fallback notices ("Requested model not found, falling back to ...") are non-fatal log lines, not failures.
  [/not in your available models|couldn.t set model|to see available models|(?:unknown model|model\b[^\n]{0,40}(?:not found|not available|no longer available))(?![^\n]*\bfalling\b)|this model isn.t available/i, '所选 Grok 模型当前不可用。请在设置中改选其他模型，或用 `grok models` 查看账号可用的模型。'],
  [/check your network|network (?:error|unreachable|connection)|connection (?:failed|refused|reset|stalled|error|timed out)|(?:secure )?connection to grok (?:failed|timed out)|connect error|dns error|tls handshake|error sending request|request timed out|took too long to respond|unexpected error \(http 5\d\d\)|\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b/i, GROK_SERVICE],
];
// Pure. `message` is the CLI's own wording (its error document, or plain stdout after a failed exit) and outranks `stderr`,
// which is consulted only when the message finds no class. Anything unrecognized falls back to the generic message with the exit code.
export function grokFailure(message, exitCode, stderr = '') {
  for (const text of [message, stderr]) {
    const hit = GROK_FAILURES.find(([pattern]) => pattern.test(text));
    if (hit) return hit[1];
  }
  return `Grok Build 未返回有效结果（退出码 ${exitCode ?? '未知'}）。`;
}
// The CLI prints one pretty-printed document; a trailing single-line document is accepted too.
function parseGrokDocument(stdout) {
  const text = stdout.trim();
  try { return JSON.parse(text); } catch { try { return JSON.parse(text.split('\n').filter(Boolean).at(-1) || ''); } catch {} }
}
const isObject = value => Boolean(value) && typeof value === 'object';
// A result document that was cut off (output cap, killed mid-write): it starts with "{" but does not parse, so it is the model's answer
// rather than CLI wording. Neither classified nor logged.
export const grokCutOff = stdout => stdout.trim().startsWith('{') && !isObject(parseGrokDocument(stdout));
// Map the headless JSON document to a subagent result; only the final text is kept.
export function grokResult(stdout, exitCode, stderr = '') {
  const doc = parseGrokDocument(stdout);
  const isDoc = isObject(doc);
  // A failed headless run prints {"type":"error","message":...} instead of a result. Other stdout is CLI wording only after a failed exit,
  // read from its tail, and not when it is a cut-off result document.
  if (!isDoc || doc.type === 'error') {
    let message = '';
    if (isDoc) { if (typeof doc.message === 'string') message = doc.message; }
    else if (exitCode !== 0 && !grokCutOff(stdout)) message = stdout.trim().slice(-4096);
    return {output: [], stopReason: 'error', diagnostic: grokFailure(message, exitCode, stderr)};
  }
  const text = typeof doc.text === 'string' ? doc.text : '';
  const stopReason = GROK_STOP[doc.stopReason] || 'error';
  const output = text.trim() ? [{type: 'text', text}] : [];
  if (stopReason === 'completed' && !output.length) return {output, stopReason: 'error', diagnostic: 'Grok Build 未给出答复。'};
  // The stop reason reaches the model, so only a bare token (end_turn, max_turn_requests, ...) is echoed, never free text.
  const reason = typeof doc.stopReason === 'string' && /^[a-z][a-z0-9_]{0,31}$/i.test(doc.stopReason) ? doc.stopReason : '未知原因';
  return stopReason === 'completed' ? {output, stopReason} : {output, stopReason, diagnostic: `Grok Build 运行结束：${reason}。`};
}
