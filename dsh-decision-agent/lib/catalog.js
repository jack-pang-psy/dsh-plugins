import { createRequire } from 'node:module';
import { readFileSync, readdirSync, accessSync, constants } from 'node:fs';
import { dirname, resolve, join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { claudeCatalogArgs, EFFORTS, GROK_MODEL, GROK_MODELS } from './settings.js';

export function codexArgv() {
  const require = createRequire(import.meta.url);
  const native = require.resolve('@deepseek-ai/dsh-subagent-codex/package.json');
  const req = createRequire(native);
  const p = req.resolve('@openai/codex/package.json');
  const manifest = JSON.parse(readFileSync(p, 'utf8'));
  return [process.execPath, resolve(dirname(p), manifest.bin.codex), 'app-server', '--stdio'];
}
// The host CLI rather than the adapter's bundled one: the bundled build lags behind and rejects newer models (e.g. claude-opus-5-5).
export function findClaude() {
  const dirs = (process.env.PATH || '').split(delimiter);
  const candidates = [join(homedir(), '.local/bin/claude'), ...dirs.map(d => join(d,'claude')), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for(const root of [join(homedir(),'.nvm/versions/node'),join(homedir(),'.local/share/mise/installs/node')]){
    try {for(const version of readdirSync(root).sort().reverse())candidates.push(join(root,version,'bin/claude'));}catch{}
  }
  for (const p of candidates) {
    try { accessSync(p, constants.X_OK); return p; } catch {}
  }
  throw new Error('未找到 Claude Code。请安装 CLI 后重新打开 Harness。');
}
// Grok Build installs itself under ~/.grok/bin, which GUI-launched apps usually lack on PATH.
export function findGrok() {
  const dirs = (process.env.PATH || '').split(delimiter);
  const candidates = [join(homedir(), '.grok/bin/grok'), ...dirs.map(d => join(d,'grok')), '/opt/homebrew/bin/grok', '/usr/local/bin/grok'];
  for (const p of candidates) {
    try { accessSync(p, constants.X_OK); return p; } catch {}
  }
  throw new Error('未找到 Grok Build。请安装 grok CLI 后重新打开 Harness。');
}
export async function stopChild(child) {
  try { child.stdin?.end(); } catch {}
  child.terminate();
  await child.waitForExit();
  await child.done.catch(() => {});
}
// A bounded metadata-only probe: it never starts a model turn or retains account data.
async function withLines(spawn, argv, handler) {
  const child = spawn({argv, cwd: homedir(), stdio:{stdin:'pipe',stdout:'pipe',stderr:'pipe'}, env:{}, graceMs:1500});
  let pending = '', total = 0, nextId = 1;
  const requests = new Map();
  let receive = () => {};
  let rejectClosed;
  const closed = new Promise((_,reject) => { rejectClosed=reject; });
  closed.catch(() => {});
  const send = value => child.stdin.write(JSON.stringify(value)+'\n');
  child.stdin.on('error', () => rejectClosed(new Error('后端通信已关闭。')));
  child.stderr?.resume();
  child.stdout.on('data',chunk => {
    pending += chunk.toString(); total += chunk.length;
    if(total>2*1024*1024){rejectClosed(new Error('模型目录响应过大。'));child.terminate();return;}
    let i;
    while((i=pending.indexOf('\n'))>=0){
      const line=pending.slice(0,i);pending=pending.slice(i+1);
      if(!line.trim())continue;
      let m;try{m=JSON.parse(line);}catch{continue;}
      if(m.id!==undefined && requests.has(m.id)) {
        const {resolve,reject}=requests.get(m.id);requests.delete(m.id);
        m.error ? reject(new Error('后端拒绝模型目录请求。')) : resolve(m.result);
      } else if(m.method && m.id!==undefined) send({id:m.id,error:{code:-32601,message:'Unsupported catalog request'}});
      receive(m);
    }
  });
  child.done.then(()=>rejectClosed(new Error('后端在返回模型列表前退出。')),()=>rejectClosed(new Error('无法启动后端。')));
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=nextId++;requests.set(id,{resolve,reject});send({id,method,params});});
  let timer;
  try {
    return await Promise.race([handler({request,send,onMessage:fn=>{receive=fn;}}),closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('读取模型列表超时，请检查 CLI 后重试。')),20000);})]);
  } finally {clearTimeout(timer);await stopChild(child);}
}
export async function codexCatalog(spawn, argv = codexArgv()) {
  return withLines(spawn,argv,async ({request,send})=>{
    await request('initialize',{clientInfo:{name:'dsh-decision-agent',version:'0.1.0'},capabilities:{experimentalApi:true}});
    send({method:'initialized'});
    const rows=[];let cursor;
    for(let page=0;page<8;page++){
      const r=await request('model/list',{limit:100,includeHidden:false,...cursor?{cursor}:{}});
      rows.push(...(r.data||[]));cursor=r.nextCursor;if(!cursor)break;
    }
    let authenticated;
    try {const r=await request('account/read',{refreshToken:false});authenticated=Boolean(r.account);}catch{}
    let defaults={model:'',effort:''};
    try {const r=await request('config/read',{includeLayers:false});defaults={model:r.config?.model||'',effort:r.config?.model_reasoning_effort||''};}catch{}
    const models=rows.filter(x=>typeof x.id==='string').map(x=>({id:x.model||x.id,label:x.displayName||x.id,description:x.description||'',efforts:(x.supportedReasoningEfforts||[]).map(e=>e.reasoningEffort).filter(e=>EFFORTS.codex.includes(e)),defaultEffort:x.defaultReasoningEffort||''}));
    if(!models.length)throw new Error('Codex 未返回可用模型。');
    return {models,defaults,authenticated,source:'Codex app-server',fetchedAt:Date.now()};
  });
}
export async function claudeCatalog(spawn, binary=findClaude()) {
  const catalog = await withLines(spawn,[binary,...claudeCatalogArgs()],({send,onMessage})=>new Promise((resolve,reject)=>{
    onMessage(m=>{
      if(m.type!=='control_response'||m.response?.request_id!=='dsh-models')return;
      if(m.response.subtype!=='success'){reject(new Error('Claude Code 拒绝了模型目录请求。'));return;}
      const response=m.response.response||{};
      const models=(response.models||[]).filter(x=>typeof x.value==='string').map(x=>({id:x.value,label:x.displayName||x.value,description:x.description||'',resolvedModel:x.resolvedModel||x.value,efforts:(x.supportedEffortLevels||[]).filter(e=>EFFORTS.claude.includes(e))}));
      if(!models.length){reject(new Error('Claude Code 未返回模型列表。'));return;}
      let effort='',connection='native';
      // Only safe scalar fields are returned, never auth/environment values.
      try {const s=JSON.parse(readFileSync(join(homedir(),'.claude/settings.json'),'utf8'));effort=s.effortLevel||'';if(s.env?.ANTHROPIC_BASE_URL)connection='relay';}catch{}
      const defaultModel=models.find(x=>x.id==='default');
      resolve({models,connection,defaults:{model:defaultModel?.resolvedModel||'Claude Code 默认',effort},source:'Claude Code 初始化',fetchedAt:Date.now()});
    });
    send({type:'control_request',request_id:'dsh-models',request:{subtype:'initialize'}});
  }));
  const child=spawn({argv:[binary,'auth','status','--json'],cwd:homedir(),stdio:{stdin:'pipe',stdout:'pipe',stderr:'pipe'},env:{},graceMs:1000});
  let output='';child.stdout.on('data',chunk=>{if(output.length<32768)output+=chunk.toString();});child.stderr?.resume();child.stdin?.on('error',()=>{});child.stdin?.end();
  const timer=setTimeout(()=>child.terminate(),5000);
  try {await child.done;const status=JSON.parse(output);if(typeof status.loggedIn==='boolean')catalog.authenticated=status.loggedIn;}catch{}finally{clearTimeout(timer);await stopChild(child);}
  return catalog;
}
// `grok models` lists the account's models without starting a model turn; only the curated GROK_MODELS are offered.
export function parseGrokModels(text) {
  const ids=[];let defaultModel='';
  for(const line of text.split('\n')){
    const m=/^\s*[-*]\s+([a-zA-Z0-9][a-zA-Z0-9._:\/-]*)(\s+\(default\))?\s*$/.exec(line);
    if(m){ids.push(m[1]);if(m[2])defaultModel=m[1];}
  }
  return {ids,defaultModel,authenticated:/logged in/i.test(text)?true:(/not logged in|log in|login/i.test(text)?false:undefined)};
}
export async function grokCatalog(spawn, binary=findGrok()) {
  const child=spawn({argv:[binary,'models'],cwd:homedir(),stdio:{stdin:'pipe',stdout:'pipe',stderr:'pipe'},env:{},graceMs:1000});
  let output='';child.stdout.on('data',chunk=>{if(output.length<65536)output+=chunk.toString();});child.stderr?.resume();child.stdin?.on('error',()=>{});child.stdin?.end();
  let timer;
  try{
    await Promise.race([child.done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('读取模型列表超时，请检查 CLI 后重试。')),20000);})]);
  }finally{clearTimeout(timer);await stopChild(child);}
  const parsed=parseGrokModels(output);
  // When the CLI lists models, offer only the curated ones the account actually has.
  const models=GROK_MODELS.filter(m=>!parsed.ids.length||parsed.ids.includes(m.id)).map(m=>({...m,efforts:m.efforts.filter(e=>EFFORTS.grok.includes(e))}));
  if(!models.length)throw new Error('当前 Grok 账号没有可用的 Grok 4.7 Build Fast / 4.7 / 4.6 模型。');
  let effort='';
  // Only the default effort scalar is read from the native config, never credentials.
  try{const m=/^\s*default_reasoning_effort\s*=\s*"([a-z]+)"/m.exec(readFileSync(join(homedir(),'.grok/config.toml'),'utf8'));if(m&&EFFORTS.grok.includes(m[1]))effort=m[1];}catch{}
  return {models,defaults:{model:GROK_MODEL,effort},authenticated:parsed.authenticated,source:'Grok Build CLI',fetchedAt:Date.now()};
}
export function createCatalogs(spawn) {
  const cached=new Map(),running=new Map();
  return {
    async get(backend,refresh=false){
      if(!refresh&&cached.has(backend)&&Date.now()-cached.get(backend).fetchedAt<300000)return cached.get(backend);
      if(running.has(backend))return running.get(backend);
      const call=(backend==='codex'?codexCatalog(spawn):backend==='grok'?grokCatalog(spawn):claudeCatalog(spawn)).then(value=>{cached.set(backend,value);return value;}).finally(()=>running.delete(backend));
      running.set(backend,call);return call;
    },
    peek:backend=>cached.get(backend)
  };
}
