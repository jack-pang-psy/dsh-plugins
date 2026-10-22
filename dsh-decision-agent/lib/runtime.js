import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { textTask, codexOverrides, claudeOverrides, grokArgs, grokResult, grokCutOff, grokFailureLog, writePrivateFile, GROK_MODEL } from './settings.js';
import { findClaude, findGrok } from './catalog.js';

const STDERR_TAIL = 8 * 1024; // enough for a stack trace or a few error lines
const STDOUT_TAIL = 2 * 1024;

export function captureCodex(applyCodex, ctx, settings) {
  let provider;
  applyCodex({
    subagents:{registerProvider(p){provider=p;}},
    subprocess:{spawn(spec){return ctx.subprocess.spawn({...spec,argv:codexOverrides(spec.argv,settings.effort)});}},
    logger:ctx.logger
  }, {providerName:'decision-codex', ...(settings.model?{model:settings.model}:{}), env:{}, permissionMode:'never',disposeGraceMs:3000});
  if(!provider?.start)throw new Error('Codex 适配器不兼容当前 Harness 版本。');
  return provider;
}
// The adapter's SDK drives the run, but launches the host CLI instead of its bundled one (which rejects newer models).
export function captureClaude(applyClaude, ctx, settings, binary=findClaude()) {
  let provider;
  applyClaude({
    subagents:{registerProvider(p){provider=p;}},
    subprocess:{spawn(spec){return ctx.subprocess.spawn({...spec,argv:[binary,...claudeOverrides(spec.argv,settings).slice(1)]});}},
    logger:ctx.logger
  }, {providerName:'decision-claude', ...(settings.model?{model:settings.model}:{}), env:{}, permissionMode:'dontAsk',disposeGraceMs:3000});
  if(!provider?.start)throw new Error('Claude Code 适配器不兼容当前 Harness 版本。');
  return provider;
}
// Grok Build has no SDK adapter in this Harness: one headless `grok --prompt-file` run per delegation,
// spawned through the shared subprocess service so cancellation and teardown follow the same owner.
// Result settlement and the run handle are the Harness's out-of-process helpers (settleRunResult, subprocessRunHandle from
// @deepseek-ai/dsh-subagent, as the built-in Codex adapter uses them). Only the Harness runtime can resolve that package, so index.js injects them.
export async function startGrok(ctx, settings, request, binary=findGrok(), helpers={}) {
  const {settleRunResult,subprocessRunHandle}=helpers;
  // Checked before spawning: discovering a missing helper afterwards would orphan the child.
  if(typeof settleRunResult!=='function'||typeof subprocessRunHandle!=='function')throw new Error('Grok Build 缺少 Harness 子代理运行辅助函数。');
  const text=textTask(request.prompt);
  const cwd=request.parent?.session?.header?.cwd||request.cwd;
  if(!cwd)throw new Error('决策子代理缺少工作目录。');
  const signal=request.signal??new AbortController().signal; // both helpers call signal.removeEventListener unconditionally
  if(signal.aborted)throw new Error('决策任务已在启动前取消。');
  const dir=mkdtempSync(join(tmpdir(),'dsh-decision-grok-'));
  const cleanup=()=>{try{rmSync(dir,{recursive:true,force:true});}catch{}}; // runs inside the result chain, which must never reject
  const promptFile=join(dir,'prompt.txt');
  let child;
  try{
    writeFileSync(promptFile,text,{mode:0o600});
    // RUST_LOG would make headless grok log to stderr, possibly including request content. Harness's env scrub keeps it, and an explicit
    // undefined removes an inherited variable, so grok falls back to its own default (no stderr logging).
    child=ctx.subprocess.spawn({argv:[binary,...grokArgs(settings,promptFile,cwd)],cwd,stdio:{stdin:'pipe',stdout:'pipe',stderr:'pipe'},env:{RUST_LOG:undefined},graceMs:3000});
  }catch(error){cleanup();throw error;}
  let stdout='',tail=Buffer.alloc(0),cancelled=false,exited=false;
  child.done.then(()=>{exited=true;},()=>{exited=true;});
  child.stdout.setEncoding('utf8'); // decode incrementally so a multi-byte character split across chunks survives
  child.stdout.on('data',chunk=>{if(stdout.length<4*1024*1024)stdout+=chunk;});
  child.stderr?.on('data',chunk=>{tail=Buffer.concat([tail,Buffer.from(chunk)]).subarray(-STDERR_TAIL);});
  child.stdin?.on('error',()=>{});child.stdin?.end();
  // Marks the run cancelled (so it settles as aborted) only while the direct child still runs: dispose() calls this even after a
  // normal finish, which must stay completed. Sweeping what the child left in its process group is teardown's job.
  const requestCancel=()=>{if(exited||cancelled)return;cancelled=true;child.terminate();};
  const onAbort=()=>requestCancel();
  signal.addEventListener('abort',onAbort,{once:true});
  // The raw evidence of a failed run goes to a private file, never into the result: `diagnostic` is shown to the parent agent's
  // model, and the Harness logger drops warn-level messages by default. Latest failure only, bounded, never the prompt.
  // Returns the pointer to append to the diagnostic, or '' when the file could not be written (which must not affect the result).
  const recordFailure=(headline,outcome,value)=>{
    // Stdout is kept only when it is CLI wording: an answer, or a result document cut off before its end, is the model's text.
    const withheld=value?.output.length?'it holds the answer text':grokCutOff(stdout)?'it is a cut-off result document, i.e. answer text':'';
    const lines=[
      "Grok Build failure kept by dsh-decision-agent (the next failure overwrites this file). The plugin never writes the task prompt here; the output below is the CLI's own.",
      `time: ${new Date().toISOString()}`,`model: ${settings.model||GROK_MODEL}`,`effort: ${settings.effort||'(default)'}`,
      headline,`exit code: ${outcome?.exitCode??'none'}`,`signal: ${outcome?.signal||'none'}`,
      `--- stderr, last ${STDERR_TAIL} bytes at most ---`,tail.toString()||'(empty)',
      ...(withheld?[`--- stdout omitted: ${withheld} ---`]:[`--- stdout, last ${STDOUT_TAIL} characters at most ---`,stdout.slice(-STDOUT_TAIL)||'(empty)'])
    ];
    let file;
    try{file=grokFailureLog();writePrivateFile(file,lines.join('\n')+'\n');}catch{file=undefined;}
    try{ctx.logger?.warn('decision-agent: Grok Build run failed; raw output %s',file?`saved to ${file}`:'could not be saved');}catch{}
    return file?`详细输出见 \`${file}\`。`:'';
  };
  let launchNote=''; // pointer appended to the diagnostic when the process itself failed
  const result=settleRunResult({
    attempt:async()=>{
      let outcome;
      try{outcome=await child.done;}
      catch(error){if(!cancelled)launchNote=recordFailure(`process error: ${error.message}`);throw error;}
      const value=grokResult(stdout,outcome?.exitCode,tail.toString());
      if(value.stopReason==='completed'||cancelled)return value;
      return {...value,diagnostic:`${value.diagnostic??''}${recordFailure(`stop reason: ${value.stopReason}`,outcome,value)}`};
    },
    collectOutput:()=>[],collectDiagnostic:()=>`无法启动 Grok Build。${launchNote}`,cancelled:()=>cancelled,
    signal,onAbort
  }).finally(cleanup);
  // Terminate before waiting, even for a child that exited by itself: waitForExit() resolves only once the whole process group is gone,
  // so anything the CLI left behind (a leader, an MCP server, a hook) would keep dispose() pending forever. terminate() is
  // idempotent and does nothing once the range is empty, as in the built-in Codex adapter.
  return subprocessRunHandle({id:randomUUID(),result,signal,onAbort,requestCancel,teardown:async()=>{child.terminate();await child.waitForExit?.();await result;}});
}
// Like Codex, Claude Code runs have no wall-clock limit; long runs are cancelled by the caller.
export function makeProvider({ctx,store,applyCodex,applyClaude,runHelpers,claudeBinary=findClaude,grokBinary=findGrok,startGrokRun=startGrok,onRun=()=>{}}) {
  return {
    name:'decision',inheritsParentContext:false,
    capabilities:{agentOptions:false,agentPreset:false,outputSchema:false,depthLimit:false},
    async start(request){
      textTask(request.prompt);
      const selection=structuredClone(store.read().settings);
      const backend=selection.backend;
      const run=backend==='codex' ? await captureCodex(applyCodex,ctx,selection.codex).start(request) : backend==='grok' ? await startGrokRun(ctx,selection.grok,request,grokBinary(),runHelpers) : await captureClaude(applyClaude,ctx,selection.claude,claudeBinary()).start(request);
      const info={backend,model:selection[backend].model||'原生默认',effort:selection[backend].effort||'原生默认',startedAt:Date.now(),status:'running'};
      onRun(info);
      const result=run.result.then(value=>{onRun({...info,status:value.stopReason,finishedAt:Date.now()});return value;},()=>{onRun({...info,status:'error',finishedAt:Date.now()});return {output:[],stopReason:'error',diagnostic:'决策子代理未正常完成。'};});
      return {...run, result};
    }
  };
}
