// One real Claude Code run through a dsh-subagent-claude-code lib/index.js, driven
// the way DSH's decision subagent drives it: dsh-decision-agent's captureClaude
// (host `claude` + read-only decision overrides) -> apply() -> official Agent SDK
// query() -> CLI. Peers come from the DSH installation inside app.asar, the way
// dsh-app-boot's routeLinked() routes every peerDependency of a linked package
// (the non-peer dependencies resolve natively from the package's node_modules),
// so run it under the DSH Electron binary in node mode; scripts/verify.sh does.
// The subprocess service is a minimal local stand-in for dsh-subprocess-local.
// Prints a JSON report including every transcript written under ~/.claude/projects.
import { registerHooks } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const { values: opt } = parseArgs({
  options: {
    lib: { type: 'string', default: join(here, '..', 'lib', 'index.js') },
    asar: { type: 'string', default: '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar' },
    'decision-agent': { type: 'string', default: '/Users/psy/ai-chat/dsh-plugins/dsh-decision-agent' },
    cwd: { type: 'string', default: '/tmp/dsh-cc-fork-e2e' },
    model: { type: 'string', default: 'haiku' },
    effort: { type: 'string', default: 'low' },
    prompt: { type: 'string', default: 'Reply with exactly one word: OK' },
  },
});

const PEERS = new Set(['@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-subprocess', '@deepseek-ai/dsh-timeout']);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!PEERS.has(specifier)) return nextResolve(specifier, context);
    return { url: pathToFileURL(`${opt.asar}/dsh/node_modules/${specifier}/lib/index.js`).href, shortCircuit: true };
  },
});
const { apply } = await import(pathToFileURL(resolve(opt.lib)).href);
const { captureClaude } = await import(pathToFileURL(join(opt['decision-agent'], 'lib', 'runtime.js')).href);
const { findClaude } = await import(pathToFileURL(join(opt['decision-agent'], 'lib', 'catalog.js')).href);

/** Managed-process handle with the shape the provider uses: streams, done, terminate, waitForExit. */
function managedSpawn(spec) {
  const env = { ...process.env };
  for (const [name, value] of Object.entries(spec.env ?? {})) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  const [command, ...args] = spec.argv;
  const child = spawn(command, args, {
    cwd: spec.cwd,
    env,
    detached: true,
    stdio: [spec.stdio?.stdin ?? 'ignore', spec.stdio?.stdout ?? 'ignore', spec.stdio?.stderr ?? 'inherit'],
  });
  const done = new Promise((settle, fail) => {
    child.once('error', fail);
    child.once('exit', (exitCode, signal) => settle({ exitCode, signal }));
  });
  done.catch(() => {});
  let killTimer;
  const terminate = () => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    killTimer ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, spec.graceMs ?? 3000);
    killTimer.unref?.();
  };
  spec.signal?.addEventListener('abort', terminate, { once: true });
  const settled = () => clearTimeout(killTimer);
  return { stdin: child.stdin, stdout: child.stdout, done, terminate, waitForExit: () => done.then(settled, settled) };
}

/** Transcripts under ~/.claude/projects touched since `since` whose records ran in `cwd`. */
function transcriptsFor(cwd, since) {
  const projects = join(homedir(), '.claude', 'projects');
  const found = [];
  for (const project of readdirSync(projects)) {
    let files;
    try { files = readdirSync(join(projects, project)); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const path = join(projects, project, file);
      if (statSync(path).mtimeMs < since) continue;
      const records = readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
      if (!records.some((record) => record.cwd === cwd)) continue;
      // Claude Code writes one record per content block, each repeating its message's usage.
      const usage = [...new Map(records.filter((record) => record.type === 'assistant' && record.message?.usage)
        .map((record) => [record.message.id, record])).values()];
      found.push({
        path,
        sessionId: records.find((record) => record.sessionId)?.sessionId,
        entrypoint: records.find((record) => record.entrypoint)?.entrypoint,
        messagesWithUsage: usage.length,
        models: [...new Set(usage.map((record) => record.message.model))],
        outputTokens: usage.reduce((sum, record) => sum + (record.message.usage.output_tokens ?? 0), 0),
      });
    }
  }
  return found;
}

mkdirSync(opt.cwd, { recursive: true });
const cwd = realpathSync(opt.cwd);
const logger = { warn: (...args) => console.error('[provider warn]', ...args), error: (...args) => console.error('[provider error]', ...args), info() {}, debug() {} };
const binary = findClaude();
const provider = captureClaude(apply, { subprocess: { spawn: managedSpawn }, logger }, { model: opt.model, effort: opt.effort }, binary);
const started = Date.now();
const run = await provider.start({ prompt: [{ type: 'text', text: opt.prompt }], cwd, signal: new AbortController().signal });
const result = await run.result;
await run.dispose();
console.log(JSON.stringify({
  lib: realpathSync(opt.lib),
  binary,
  cwd,
  model: opt.model,
  startedAt: new Date(started).toISOString(),
  stopReason: result.stopReason,
  output: (result.output ?? []).map((block) => block.text).join(''),
  diagnostic: result.diagnostic,
  transcripts: transcriptsFor(cwd, started - 1000),
}, null, 2));
