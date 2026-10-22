// Validate imports, plugin wiring and routing against the installed desktop runtime.
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const root='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh';
const req=createRequire(root+'/package.json');
(async()=>{
 const boot=req('@deepseek-ai/dsh-app-boot'),{Context}=req('@deepseek-ai/cordis');
 const anchor=root+'/node_modules/@deepseek-ai/dsh/package.json';
 const profile=boot.loadProfileDirectory('dsh',require('node:path').join(require('node:os').homedir(),'.dsh/profiles/desktop'),anchor);
 const resolution=await boot.createRuntimeResolution({installAnchor:anchor,profile});
 const context=new Context();
 try{
  await context.plugin(boot.PluginPackages,{resolution});
  const {apply}=await import(pathToFileURL(require('node:path').resolve(__dirname,'../lib/index.js')).href);
  let route,provider;
  const ctx={inject(_deps,fn){fn(ctx);},subagents:{registerProvider(p){provider=p;}},subprocess:{spawn(){throw new Error('Metadata or inference should not run during route registration');}},webServer:{register(r){route=r;return ()=>{};},getOrigin(){return 'http://127.0.0.1:19387';}},effect(fn){fn();}};
  apply(ctx);assert.equal(provider.name,'decision');
  const {WebServer}=req('@deepseek-ai/dsh-host-webserver');
  const matched=WebServer.prototype.match.call({exact:new Map(),prefixes:new Map([[route.path,route]])},'/decision-agent/api/state');
  assert.equal(matched,route,'Actual Harness prefix matcher must dispatch the settings endpoint');
  let status,body;
  const response={writeHead(s){status=s;},end(v){body=JSON.parse(v);}};
  await route.handler({method:'GET',url:'/decision-agent/api/state',headers:{host:'127.0.0.1:19387','x-dsh-decision':'1'}},response);
  assert.equal(status,200);assert.equal(body.ok,true);assert.ok(body.settings.codex);assert.ok(body.settings.claude);assert.ok(body.settings.grok);
  console.log('PASS: desktop imports, provider registration, actual prefix routing and settings response');
 }finally{await context.fiber.dispose();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
