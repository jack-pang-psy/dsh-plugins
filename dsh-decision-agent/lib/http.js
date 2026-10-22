import { SettingsError, BACKENDS } from './settings.js';
export function trustedRequest(req, origin) {
  try {
    const server=new URL(origin),host=new URL('http://'+req.headers.host);
    if(host.host!==server.host)return false;
    if(req.headers['sec-fetch-site']==='cross-site')return false;
    const source=req.headers.origin;
    if(source&&source!==origin&&source!=='dsh-app://app')return false;
    return req.headers['x-dsh-decision']==='1';
  } catch {return false;}
}
async function readBody(req){
  let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>16384)throw new SettingsError('设置内容过大。',413);}
  try{return JSON.parse(s);}catch{throw new SettingsError('请求不是有效的 JSON。');}
}
function respond(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
export function route({origin,store,catalogs,lastRun}) {
  return {kind:'prefix',path:'/decision-agent/api',async handler(req,res){
    if(!trustedRequest(req,origin())){respond(res,403,{ok:false,error:'只允许 Harness 本机设置页访问。'});return;}
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/decision-agent/api/state'){
        respond(res,200,{ok:true,...store.read(),lastRun:lastRun()});return;
      }
      if(req.method==='GET'&&url.pathname==='/decision-agent/api/catalog'){
        const backend=url.searchParams.get('backend');
        if(!BACKENDS.includes(backend))throw new SettingsError('无效的子代理类型。');
        const catalog=await catalogs.get(backend,url.searchParams.get('refresh')==='1');respond(res,200,{ok:true,...catalog});return;
      }
      if(req.method==='POST'&&url.pathname==='/decision-agent/api/settings'){
        if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new SettingsError('需要 JSON 请求。',415);
        const body=await readBody(req);
        for(const backend of BACKENDS){
          const choice=body.settings?.[backend];
          const catalog=catalogs.peek(backend);
          const model=catalog?.models.find(m=>m.id===(choice?.model||catalog.defaults.model)) || (!choice?.model?catalog?.models.find(m=>m.id==='default'):undefined);
          if(model&&choice.effort&&!model.efforts.includes(choice.effort))throw new SettingsError(`${model.label} 不支持所选思考强度。`);
        }
        respond(res,200,{ok:true,...store.write(body.settings,body.revision),lastRun:lastRun()});return;
      }
      respond(res,404,{ok:false,error:'未知的设置接口。'});
    }catch(error){respond(res,error instanceof SettingsError?error.status:503,{ok:false,error:error instanceof SettingsError?error.message:'暂时无法读取后端信息，请确认 CLI 可用后重试。'});}
  }};
}
