import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const EFFORTS = {
  codex: ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  claude: ['', 'low', 'medium', 'high', 'xhigh', 'max'],
};
export const DEFAULTS = { backend: 'codex', codex: {model: '', effort: ''}, claude: {model: '', effort: ''} };
export class SettingsError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateSettings(value) {
  if (!value || typeof value !== 'object' || !['codex', 'claude'].includes(value.backend)) throw new SettingsError('请选择 Codex 或 Claude Code。');
  const result = {backend: value.backend};
  for (const backend of ['codex', 'claude']) {
    const p = value[backend];
    if (!p || typeof p.model !== 'string' || typeof p.effort !== 'string') throw new SettingsError('模型设置格式不正确。');
    const model = p.model.trim();
    if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]-]{0,159}$/.test(model)) throw new SettingsError('模型 ID 只能包含字母、数字、点、下划线、斜线、冒号、方括号或连字符。');
    if (!EFFORTS[backend].includes(p.effort)) throw new SettingsError('思考强度不受此后端支持。');
    result[backend] = {model, effort: p.effort};
  }
  return result;
}
export function createStore(file = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'decision-agent', 'settings.json')) {
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
      mkdirSync(dirname(file), {recursive:true, mode:0o700});
      const tmp = file + '.' + document.revision + '.tmp';
      writeFileSync(tmp, JSON.stringify(document, null, 2) + '\n', {mode:0o600});
      renameSync(tmp, file);
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
