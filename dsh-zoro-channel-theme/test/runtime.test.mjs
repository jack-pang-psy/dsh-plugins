import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('src/preferences.js',root),'utf8').replace(/export \{ SuitRuntime, SKINS \};/,'');
function harness(user={}) {
 let snapshot={status:'ready',writable:true,user,value:{...user},revision:1}, layers=new Map(), listeners=new Set(), writes=[];
 const scope={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:async(k,v)=>{
   writes.push([k,v]);snapshot={...snapshot,user:{...snapshot.user,[k]:v},value:{...snapshot.value,[k]:v},revision:snapshot.revision+1};
   for(const fn of listeners)fn();
 }};
 const host={overrideTokens:(id,tokens)=>{layers.set(id,tokens);return()=>layers.delete(id)}};
 const context={tokensFor:suit=>({suit}),localStorage:{getItem:()=>null,setItem(){}},structuredClone};
 vm.createContext(context);
 const Runtime=vm.runInContext(source+';SuitRuntime',context);
 const runtime=new Runtime(host,scope);runtime.start();
 return {runtime,layers,writes,listeners};
}
test('host selection, palette switch, native rollback and disposal',async()=>{
 const h=harness({suit:'enma'});assert.equal(h.runtime.skin,'enma');assert.equal(h.layers.size,1);
 h.runtime.setSuit('santoryu');await new Promise(r=>setImmediate(r));
 assert.equal(h.writes.at(-1)[1],'santoryu');assert.equal(h.layers.size,1);
 h.runtime.setSuit('native');assert.equal(h.layers.size,0);
 h.runtime.dispose();assert.equal(h.listeners.size,0);
});
test('schema default never overwrites explicit stored preference',()=>{
 const h=harness({suit:'native'});assert.equal(h.runtime.skin,'native');assert.equal(h.writes.length,0);assert.equal(h.layers.size,0);h.runtime.dispose();
});
test('both themes define every host alias for light and dark',()=>{
 const context={TOKEN_MAP:JSON.parse(readFileSync(new URL('src/token-map.json',root),'utf8'))};vm.createContext(context);
 vm.runInContext(readFileSync(new URL('src/palette.js',root),'utf8')+';globalThis.make=tokensFor',context);
 for(const suit of ['santoryu','enma'])for(const [key,value] of Object.entries(context.make(suit))){assert.ok(value.light,`${suit} ${key} light`);assert.ok(value.dark,`${suit} ${key} dark`);}
});
