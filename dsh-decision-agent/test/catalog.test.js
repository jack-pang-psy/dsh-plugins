import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {codexCatalog} from '../lib/catalog.js';

// A scripted Codex app-server: each JSON-RPC request is answered from `answers` (a result, or {error} for a refused method).
// The shapes are the ones codex 0.163.0 returned on 2026-10-26 for each setup (official login, two relays, logged out).
function fakeAppServer(answers){
 const calls=[];const stdout=new EventEmitter();let finish;
 const done=new Promise(r=>{finish=r;});
 const stdin={on(){},end(){},write(line){
  const m=JSON.parse(line);calls.push(m);if(m.id===undefined)return true;
  const answer=answers[m.method];
  const reply=answer===undefined||answer.error?{id:m.id,error:{code:-32601,message:'unsupported'}}:{id:m.id,result:answer};
  setImmediate(()=>stdout.emit('data',Buffer.from(JSON.stringify(reply)+'\n')));return true;
 }};
 const child={stdin,stdout,stderr:{resume(){}},done,terminate(){finish({exitCode:0,signal:null});},waitForExit:()=>done.then(()=>true)};
 return {spawn:()=>child,calls};
}
const models={data:[{id:'gpt-6.1-sol',model:'gpt-6.1-sol',displayName:'GPT-6.1 Sol',supportedReasoningEfforts:[{reasoningEffort:'high'}],defaultReasoningEffort:'high'}]};
const catalog=async answers=>{const server=fakeAppServer({initialize:{},'model/list':models,...answers});return {c:await codexCatalog(server.spawn,['codex','app-server','--stdio']),calls:server.calls};};
const params=(calls,method)=>calls.find(m=>m.method===method)?.params;

test('a ChatGPT login whose access token awaits renewal is not reported as logged out',async()=>{
 const {c,calls}=await catalog({'config/read':{config:{model:'gpt-6.1-sol',model_reasoning_effort:'high'}},'account/read':{account:null,requiresOpenaiAuth:true},getAuthStatus:{authMethod:'chatgpt',authToken:null,requiresOpenaiAuth:true}});
 assert.equal(c.authenticated,true);assert.equal(c.connection,'native');assert.deepEqual(c.defaults,{model:'gpt-6.1-sol',effort:'high'});
 // Neither probe may refresh the shared auth file or ask for the token itself.
 assert.deepEqual(params(calls,'account/read'),{refreshToken:false});assert.deepEqual(params(calls,'getAuthStatus'),{includeToken:false,refreshToken:false});
});
test('a relay that needs no OpenAI auth is shown as a relay, with no login alert',async()=>{
 const {c,calls}=await catalog({'config/read':{config:{model:'gpt-6-astra',model_provider:'custom'}},'account/read':{account:null,requiresOpenaiAuth:false}});
 assert.equal(c.connection,'relay');assert.equal(c.authenticated,undefined);assert.equal(params(calls,'getAuthStatus'),undefined);
});
test('a relay keyed through auth.json counts as authenticated',async()=>{
 const {c}=await catalog({'config/read':{config:{model_provider:'custom'}},'account/read':{account:{type:'apiKey'},requiresOpenaiAuth:true}});
 assert.equal(c.connection,'relay');assert.equal(c.authenticated,true);
});
test('a missing login is still reported, and an unknown auth status raises no alert',async()=>{
 const loggedOut=await catalog({'config/read':{config:{}},'account/read':{account:null,requiresOpenaiAuth:true},getAuthStatus:{authMethod:null,authToken:null,requiresOpenaiAuth:true}});
 assert.equal(loggedOut.c.authenticated,false);assert.equal(loggedOut.c.connection,'native');
 const unknown=await catalog({'config/read':{config:{}},'account/read':{account:null,requiresOpenaiAuth:true},getAuthStatus:{error:true}});
 assert.equal(unknown.c.authenticated,undefined);
 // The OpenAI provider named explicitly is not a relay.
 const official=await catalog({'config/read':{config:{model_provider:'openai'}},'account/read':{account:{type:'chatgpt'},requiresOpenaiAuth:true}});
 assert.equal(official.c.connection,'native');assert.equal(official.c.authenticated,true);
});
