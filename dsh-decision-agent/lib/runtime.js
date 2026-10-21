import { textTask, codexOverrides, claudeOverrides } from './settings.js';
import { findClaude } from './catalog.js';

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
// Like Codex, Claude Code runs have no wall-clock limit; long runs are cancelled by the caller.
export function makeProvider({ctx,store,applyCodex,applyClaude,claudeBinary=findClaude,onRun=()=>{}}) {
  return {
    name:'decision',inheritsParentContext:false,
    capabilities:{agentOptions:false,agentPreset:false,outputSchema:false,depthLimit:false},
    async start(request){
      textTask(request.prompt);
      const selection=structuredClone(store.read().settings);
      const backend=selection.backend;
      const run=backend==='codex' ? await captureCodex(applyCodex,ctx,selection.codex).start(request) : await captureClaude(applyClaude,ctx,selection.claude,claudeBinary()).start(request);
      const info={backend,model:selection[backend].model||'原生默认',effort:selection[backend].effort||'原生默认',startedAt:Date.now(),status:'running'};
      onRun(info);
      const result=run.result.then(value=>{onRun({...info,status:value.stopReason,finishedAt:Date.now()});return value;},()=>{onRun({...info,status:'error',finishedAt:Date.now()});return {output:[],stopReason:'error',diagnostic:'决策子代理未正常完成。'};});
      return {...run, result};
    }
  };
}
