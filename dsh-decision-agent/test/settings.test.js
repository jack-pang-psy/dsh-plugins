import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,symlinkSync,existsSync,statSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createStore,DEFAULTS,validateSettings,codexOverrides,claudeCatalogArgs,claudeOverrides,CLAUDE_TOOLS,textTask,resolveDshHome,dataDir,writePrivateFile} from '../lib/settings.js';
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
test('DSH_HOME resolves like Harness: unset, absolute, relative, ~, ~/x and blank',()=>{
 // Cases of resolveDshHome in @deepseek-ai/dsh-home-paths 0.2.1-rc.2, which was also run against this function with the Harness binary.
 const home='/home/tester',at=value=>resolveDshHome(value===undefined?{}:{DSH_HOME:value},home);
 assert.equal(at(undefined),'/home/tester/.dsh'); // unset: the default home
 assert.equal(at('/srv/dsh'),'/srv/dsh'); // absolute: as given
 assert.equal(at('dsh-alt'),resolve('dsh-alt')); // relative: made absolute
 assert.equal(at('./a/../dsh-alt/'),resolve('dsh-alt'));
 assert.equal(at('~'),'/home/tester'); // ~ expands to the OS home
 assert.equal(at('~/dsh-alt'),'/home/tester/dsh-alt'); // ~/x
 assert.equal(at('~\\dsh-alt'),'/home/tester/dsh-alt'); // ~\x
 for(const blank of ['','   ','\t \n'])assert.equal(at(blank),'/home/tester/.dsh'); // blank counts as unset, never the working directory
 const saved=process.env.DSH_HOME;
 try{process.env.DSH_HOME='rel-home';assert.equal(dataDir(),resolve('rel-home','decision-agent'));} // dataDir only computes a path
 finally{if(saved===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=saved;}
});
test('private files are 0600, replace the old file atomically, and are created exclusively',()=>{
 const dir=mkdtempSync(join(tmpdir(),'decision-test-'));try{
  const file=join(dir,'data','private.log'),victim=join(dir,'victim');
  writePrivateFile(file,'first');
  assert.equal(statSync(file).mode&0o777,0o600);assert.equal(statSync(join(dir,'data')).mode&0o777,0o700);
  writeFileSync(victim,'untouched');
  symlinkSync(victim,file+'.fixed.tmp'); // a link planted at the temp path must never be followed
  assert.throws(()=>writePrivateFile(file,'second','fixed'),/EEXIST/);
  assert.equal(readFileSync(victim,'utf8'),'untouched');assert.equal(readFileSync(file,'utf8'),'first');
  rmSync(file+'.fixed.tmp');
  writeFileSync(file,'loose',{mode:0o644});
  writePrivateFile(file,'third');
  assert.equal(readFileSync(file,'utf8'),'third');assert.equal(statSync(file).mode&0o777,0o600); // a looser old file does not leak its mode
  mkdirSync(join(dir,'taken'));
  assert.throws(()=>writePrivateFile(join(dir,'taken'),'x','gone')); // the final rename fails ...
  assert.equal(existsSync(join(dir,'taken.gone.tmp')),false); // ... and the temp file is removed
  assert.deepEqual(readdirSync(join(dir,'data')),['private.log']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('private writes close their file descriptors',t=>{
 if(!existsSync('/dev/fd'))return t.skip('no /dev/fd on this platform');
 const dir=mkdtempSync(join(tmpdir(),'decision-test-'));try{
  const open=()=>readdirSync('/dev/fd').length,file=join(dir,'f.log');
  writePrivateFile(file,'warm up');
  const before=open();for(let i=0;i<40;i++)writePrivateFile(file,String(i));
  assert.ok(open()-before<5,`${open()-before} descriptors leaked`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
