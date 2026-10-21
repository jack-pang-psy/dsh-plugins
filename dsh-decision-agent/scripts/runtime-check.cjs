// Run with the installed Harness Electron binary and ELECTRON_RUN_AS_NODE=1.
// --catalog reads metadata only. --smoke starts two minimal, read-only model turns.
const {createRequire,registerHooks}=require('node:module');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const path=require('node:path');
const anchor='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json';
const nativeRequire=createRequire(anchor);
const profileRequire=createRequire(path.join(require('node:os').homedir(),'.dsh/profiles/desktop/package.json'));
let resolving=false;
registerHooks({resolve(spec,context,next){
 try{return next(spec,context);}catch(error){
  if(resolving||spec.startsWith('.')||spec.startsWith('/')||spec.includes('://')||spec.startsWith('node:'))throw error;
  resolving=true;let found;
  try{try{found=nativeRequire.resolve(spec);}catch{found=profileRequire.resolve(spec);}}finally{resolving=false;}
  return next(found,context);
 }
}});
function managedSpawn(spec){
 const child=spawn(spec.argv[0],spec.argv.slice(1),{cwd:spec.cwd,env:{...process.env,...spec.env},stdio:['pipe','pipe','pipe'],detached:true});
 let killTimer,exit;
 const done=new Promise(resolve=>{child.on('error',()=>resolve({exitCode:127,signal:null}));child.on('close',(exitCode,signal)=>{clearTimeout(killTimer);exit=true;resolve({exitCode,signal});});});
 return {stdin:child.stdin,stdout:child.stdout,stderr:child.stderr,done,terminate(){if(exit)return;try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer??=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1000);killTimer.unref();},waitForExit:()=>done.then(()=>true)};
}
(async()=>{
 const lib=path.resolve(__dirname,'../lib');
 const {codexCatalog,claudeCatalog}=await import(pathToFileURL(path.join(lib,'catalog.js')).href);
 const onlyClaude=process.argv.includes('--claude-only');
 for(const [name,fn] of (onlyClaude?[['claude',claudeCatalog]]:[['codex',codexCatalog],['claude',claudeCatalog]])){
  try{const c=await fn(managedSpawn);console.log(JSON.stringify({backend:name,models:c.models.map(m=>({id:m.id,efforts:m.efforts})),defaults:c.defaults}));}catch(e){console.error(name+' catalog: '+e.message);process.exitCode=1;}
 }
 if(process.argv.includes('--smoke')){
  const {apply}=profileRequire('@deepseek-ai/dsh-subagent-codex');
  const {apply:applyClaude}=await import(pathToFileURL(profileRequire.resolve('@deepseek-ai/dsh-subagent-claude-code')).href);
  const {captureCodex,captureClaude}=await import(pathToFileURL(path.join(lib,'runtime.js')).href);
  const ctx={subprocess:{spawn:managedSpawn},logger:{warn:()=>{}}};
  for(const backend of (onlyClaude?['claude']:['codex','claude'])){
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);
   let run;
   try{
    const request={cwd:require('node:os').homedir(),prompt:[{type:'text',text:'This is a connection test. Do not read files or use any tools. Reply with exactly DECISION_AGENT_OK.'}],signal:controller.signal};
    run=backend==='codex'?await captureCodex(apply,ctx,{model:'gpt-6.1-sol',effort:'low'}).start(request):await captureClaude(applyClaude,ctx,{model:'',effort:''}).start(request);
    const result=await run.result;const ok=result.stopReason==='completed'&&result.output.some(b=>b.text?.includes('DECISION_AGENT_OK'));
    console.log(JSON.stringify({smoke:backend,ok,stopReason:result.stopReason,diagnostic:result.diagnostic}));if(!ok)process.exitCode=1;
   }catch(e){console.error(backend+' smoke: '+e.message);process.exitCode=1;}finally{clearTimeout(timer);if(run)await run.dispose();}
  }
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
