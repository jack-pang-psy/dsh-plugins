import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore,DEFAULTS,validateSettings,codexOverrides,claudeCatalogArgs,claudeOverrides,CLAUDE_TOOLS,textTask} from '../lib/settings.js';
import {trustedRequest} from '../lib/http.js';
import {captureCodex,captureClaude,makeProvider} from '../lib/runtime.js';

test('backend switching persists each independent selection and rejects stale writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'decision-test-'));try{
  const file=join(dir,'settings.json'),store=createStore(file);
  const first=store.read();const settings=structuredClone(DEFAULTS);
  settings.codex={model:'gpt-6-astra',effort:'high'};settings.claude={model:'sonnet',effort:'medium'};
  const one=store.write(settings,first.revision);const two=store.write({...settings,backend:'claude'},one.revision);
  assert.deepEqual(createStore(file).read(),two);assert.equal(two.settings.codex.model,'gpt-6-astra');
  assert.throws(()=>store.write(DEFAULTS,one.revision),/其他窗口/);
  assert.equal(JSON.parse(readFileSync(file)).settings.backend,'claude');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid model IDs, backend names and effort combinations are rejected',()=>{
 for(const model of [';rm -rf /','--model bad','x\nunsafe'])assert.throws(()=>validateSettings({...DEFAULTS,codex:{model,effort:''}}));
 assert.throws(()=>validateSettings({...DEFAULTS,backend:'arbitrary'}));
 assert.throws(()=>validateSettings({...DEFAULTS,claude:{model:'sonnet',effort:'ultra'}}));
 assert.equal(validateSettings({...DEFAULTS,claude:{model:'opus[1m]',effort:'high'}}).claude.model,'opus[1m]');
});
test('Codex passes model/effort overrides without changing global config',()=>{
 let passed;const ctx={subprocess:{spawn:s=>{passed=s;return 'child';}},logger:{}};
 const adapter=(c,config)=>c.subagents.registerProvider({start(){return c.subprocess.spawn({argv:['node','codex.js','app-server','--stdio'],cwd:'/tmp'});},config});
 const p=captureCodex(adapter,ctx,{model:'gpt-6-astra',effort:'high'});assert.equal(p.config.model,'gpt-6-astra');p.start();
 assert.deepEqual(passed.argv.slice(-4),['-c','sandbox_mode="read-only"','-c','model_reasoning_effort="high"']);
 assert.equal(codexOverrides(['codex'], '').includes('model_reasoning_effort=""'),false);
});
test('Claude reuses the built-in adapter on the host CLI with the selected model, read-only tools and effort',()=>{
 let passed;const ctx={subprocess:{spawn:s=>{passed=s;return 'child';}},logger:{}};
 const sdkArgv=['/bundled/claude','--output-format','stream-json','--model','sonnet','--permission-mode','dontAsk','--no-session-persistence'];
 const adapter=(c,config)=>c.subagents.registerProvider({start(){return c.subprocess.spawn({argv:sdkArgv,cwd:'/tmp'});},config});
 const p=captureClaude(adapter,ctx,{model:'sonnet',effort:'high'},'/host/claude');p.start();
 assert.deepEqual(p.config,{providerName:'decision-claude',model:'sonnet',env:{},permissionMode:'dontAsk',disposeGraceMs:3000});
 const a=passed.argv;assert.deepEqual(a.slice(0,sdkArgv.length),['/host/claude',...sdkArgv.slice(1)]);
 assert.equal(a[a.indexOf('--tools')+1],CLAUDE_TOOLS);assert.equal(a[a.indexOf('--allowedTools')+1],CLAUDE_TOOLS);
 assert.ok(a.includes('--safe-mode'));assert.ok(a.includes('--append-system-prompt'));assert.equal(a[a.indexOf('--effort')+1],'high');
 assert.equal('model' in captureClaude(adapter,ctx,{model:'',effort:''},'/host/claude').config,false);
 assert.ok(!claudeOverrides(sdkArgv,{model:'',effort:''}).includes('--effort'));
 const catalog=claudeCatalogArgs();assert.equal(catalog[catalog.indexOf('--tools')+1],'');assert.ok(catalog.includes('--safe-mode'));
});
test('Claude refuses adapter argv that could widen tools or permissions',()=>{
 const base=['/x/claude','--permission-mode','dontAsk'];
 for(const argv of [['/x/claude'],['/x/claude','--permission-mode','bypassPermissions'],[...base,'--tools','default'],[...base,'--mcp-config','{}'],[...base,'--allow-dangerously-skip-permissions']])assert.throws(()=>claudeOverrides(argv,{model:'',effort:''}),/冲突/);
 assert.throws(()=>claudeOverrides(base,{model:'',effort:'ultra'}),/思考强度/);
});
test('the saved Claude selection drives the built-in adapter',async()=>{
 const value={...structuredClone(DEFAULTS),backend:'claude',claude:{model:'opus',effort:'max'}};let config;const runs=[];
 const applyClaude=(c,cfg)=>{config=cfg;c.subagents.registerProvider({start:async()=>({id:'c',result:Promise.resolve({output:[{type:'text',text:'OK'}],stopReason:'completed'}),dispose:async()=>{}})});};
 const p=makeProvider({ctx:{},store:{read:()=>({settings:value})},applyCodex:()=>assert.fail('Codex must not start'),applyClaude,claudeBinary:()=>'/host/claude',onRun:i=>runs.push(i)});
 const run=await p.start({prompt:[{type:'text',text:'Review'}],signal:new AbortController().signal});
 assert.equal(config.model,'opus');assert.equal((await run.result).stopReason,'completed');
 assert.equal(runs.at(-1).backend,'claude');assert.equal(runs.at(-1).status,'completed');
});
test('settings API rejects cross-site, wrong host and missing custom headers',()=>{
 const req={headers:{host:'127.0.0.1:3000','x-dsh-decision':'1',origin:'http://127.0.0.1:3000'}};
 assert.ok(trustedRequest(req,'http://127.0.0.1:3000'));
 assert.ok(trustedRequest({headers:{...req.headers,origin:'dsh-app://app'}},'http://127.0.0.1:3000'));
 for(const delta of [{origin:'https://evil.test'},{host:'evil.test'},{'sec-fetch-site':'cross-site'},{'x-dsh-decision':undefined},{origin:'null'}])assert.equal(trustedRequest({headers:{...req.headers,...delta}},'http://127.0.0.1:3000'),false);
});
test('a running delegation keeps its initial selection when settings change',async()=>{
 let value=structuredClone(DEFAULTS),configs=[];let finish;
 value.codex={model:'gpt-6.1-sol',effort:'high'};
 const applyCodex=(ctx,config)=>{configs.push(config);ctx.subagents.registerProvider({start:async()=>({id:'fake',result:new Promise(r=>finish=r),dispose:async()=>{}})});};
 const p=makeProvider({ctx:{},store:{read:()=>({settings:value})},applyCodex});
 const run=await p.start({prompt:[{type:'text',text:'Review'}],signal:new AbortController().signal});
 value={...value,codex:{model:'gpt-6-astra',effort:'max'}};
 assert.equal(configs[0].model,'gpt-6.1-sol');finish({output:[{type:'text',text:'OK'}],stopReason:'completed'});assert.equal((await run.result).stopReason,'completed');
});
test('text-only task boundary rejects images and empty prompts',()=>{
 assert.throws(()=>textTask([{type:'image'}]));assert.throws(()=>textTask([{type:'text',text:' '}]))
 assert.equal(textTask([{type:'text',text:'one'},{type:'text',text:'two'}]),'one\n\ntwo');
});
