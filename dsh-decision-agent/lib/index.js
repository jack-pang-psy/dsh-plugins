import { apply as applyCodex } from '@deepseek-ai/dsh-subagent-codex';
import { apply as applyClaude } from '@deepseek-ai/dsh-subagent-claude-code';
import { settleRunResult, subprocessRunHandle } from '@deepseek-ai/dsh-subagent';
import { createStore } from './settings.js';
import { createCatalogs } from './catalog.js';
import { makeProvider } from './runtime.js';
import { route } from './http.js';

export const name='decision-agent';
export const inject=[];
export function apply(ctx) {
  ctx.inject(['subagents','subprocess','webServer'], host => mount(host));
}
function mount(ctx) {
  const store=createStore();
  store.read(); // Reject a corrupt persisted configuration instead of silently changing the chosen backend.
  const catalogs=createCatalogs(spec=>ctx.subprocess.spawn(spec));
  let latest=null;
  ctx.subagents.registerProvider(makeProvider({ctx,store,applyCodex,applyClaude,runHelpers:{settleRunResult,subprocessRunHandle},onRun:info=>{if(!latest||info.startedAt>=latest.startedAt)latest=info;}}));
  ctx.effect(()=>ctx.webServer.register(route({origin:()=>ctx.webServer.getOrigin(),store,catalogs,lastRun:()=>latest})), 'decision-agent:settings');
}
