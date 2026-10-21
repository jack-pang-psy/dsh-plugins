window.__ModuleLoader__.load({id:'dsh-decision-agent',factory:(require)=>{
  const React=require('react');
  const {createElement:h,useState,useEffect}=React;
  const NS='dsh-decision-agent';
  const NAMES={codex:'Codex',claude:'Claude Code'};
  const EFFORT_NAMES={'':'继承原生设置',none:'不启用',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最大',ultra:'极高'};
  const ALL={codex:['none','minimal','low','medium','high','xhigh','max','ultra'],claude:['low','medium','high','xhigh','max']};
  async function api(path,body){
    const response=await fetch('/decision-agent/api/'+path,{method:body?'POST':'GET',headers:{'x-dsh-decision':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let value;try{value=JSON.parse(text);}catch{throw new Error('设置接口尚未就绪（HTTP '+response.status+'），请重新加载。');}if(!response.ok||!value.ok)throw new Error(value.error||'操作失败，请重试。');return value;
  }
  const css=`
  .decision-panel{max-width:700px;margin:0 auto;padding:4px 4px 20px;color:var(--dsw-alias-label-primary);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.45}
  .decision-panel *{box-sizing:border-box}.decision-panel h2{font-family:inherit;font-size:18px;line-height:1.35;margin:0 0 6px;letter-spacing:-.025em}.decision-panel h3{font-family:inherit;font-size:14px;line-height:1.4;margin:0}
  .decision-panel h2,.decision-panel h3{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
  .decision-panel p{margin:4px 0 12px}.decision-muted{color:var(--dsw-alias-label-secondary)}
  .decision-switch{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0 14px}
  .decision-choice{padding:12px 14px;text-align:left;cursor:pointer;background:var(--dsw-alias-bg-layer-1);color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;font:inherit;min-height:72px;position:relative}
  .decision-choice[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary,#5379cd);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#5379cd)}
  .decision-choice b{display:block;font-size:14px;margin-bottom:3px}.decision-choice span{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
  .decision-badge{display:inline-block;font-size:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:0 5px;margin-left:7px;font-weight:400;vertical-align:middle}
  .decision-card{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:16px;background:var(--dsw-alias-bg-layer-1)}
  .decision-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
  .decision-fields{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:14px}
  .decision-panel label{display:block;font-size:11px;font-weight:600;margin-bottom:5px}
  .decision-panel select,.decision-panel input{width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;padding:5px 8px;height:32px}
  .decision-panel button:focus-visible,.decision-panel select:focus-visible,.decision-panel input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5379cd);outline-offset:3px}
  .decision-panel input{margin-top:7px;font-family:ui-monospace,monospace;font-size:12px}
  .decision-button{font:inherit;font-size:12px;line-height:1.5;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 10px;cursor:pointer}
  .decision-button.primary{background:var(--dsw-alias-brand-primary,#5379cd);color:var(--dsw-alias-brand-text,#fff);border-color:transparent}
  .decision-panel button:disabled{opacity:.45;cursor:default}.decision-details{font-size:11px;color:var(--dsw-alias-label-secondary);margin:10px 0 0;overflow-wrap:anywhere}
  .decision-current{margin-top:16px;padding:10px 12px;border-left:2px solid var(--dsw-alias-brand-primary,#5379cd);background:var(--dsw-alias-bg-layer-2);border-radius:0 6px 6px 0;font-size:12px}
  .decision-current strong{display:block;margin-bottom:2px}.decision-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px;font-size:12px}.decision-actions-right{display:flex;gap:8px}
  .decision-notice{font-size:12px;margin-top:10px;white-space:pre-wrap}.decision-notice.error{color:var(--dsw-alias-state-error-primary,#d44f55)}
  @media(max-width:540px){.decision-fields{grid-template-columns:1fr}.decision-card{padding:12px}.decision-choice{padding:10px}.decision-actions{align-items:flex-start;flex-direction:column}.decision-actions-right{align-self:flex-end}}
  `;
  function Panel(){
    const [saved,setSaved]=useState(null),[draft,setDraft]=useState(null),[revision,setRevision]=useState(null),[catalogs,setCatalogs]=useState({}),[loading,setLoading]=useState({}),[errors,setErrors]=useState({}),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[lastRun,setLastRun]=useState(null),[custom,setCustom]=useState({});
    async function load(){try{const data=await api('state');setSaved(data.settings);setDraft(data.settings);setRevision(data.revision);setLastRun(data.lastRun);setError('');}catch(e){setError(e.message);}}
    async function catalog(backend,refresh=false){
      setLoading(s=>({...s,[backend]:true}));setErrors(s=>({...s,[backend]:''}));
      try{const c=await api('catalog?backend='+backend+(refresh?'&refresh=1':''));setCatalogs(s=>({...s,[backend]:c}));}
      catch(e){setErrors(s=>({...s,[backend]:e.message}));}
      finally{setLoading(s=>({...s,[backend]:false}));}
    }
    useEffect(()=>{void load();void catalog('codex');void catalog('claude');},[]);
    if(!draft)return h('div',{className:'decision-panel'},h('style',null,css),h('h2',null,'决策子代理'),h('p',null,error||'正在读取设置…'),error&&h('button',{className:'decision-button',onClick:load},'重新加载'));
    const backend=draft.backend,choice=draft[backend],cat=catalogs[backend],models=cat?.models||[];
    const known=models.some(m=>m.id===choice.model),isCustom=custom[backend]||Boolean(choice.model&&!known);
    const model=models.find(m=>m.id===(choice.model||cat?.defaults.model))||(!choice.model?models.find(m=>m.id==='default'):null);
    const efforts=model?model.efforts:ALL[backend];
    const invalidEffort=Boolean(choice.effort&&model&&!efforts.includes(choice.effort));
    const dirty=JSON.stringify(saved)!==JSON.stringify(draft);
    const setChoice=(values)=>{setDraft(s=>({...s,[backend]:{...s[backend],...values}}));setNotice('');};
    const summarize=(config,b)=>{const c=catalogs[b];const v=config[b];const label=c?.models.find(m=>m.id===v.model)?.label;return (v.model?(label||v.model):(c?.defaults.model||'原生默认'))+' · '+(v.effort?(EFFORT_NAMES[v.effort]||v.effort):(c?.defaults.effort?EFFORT_NAMES[c.defaults.effort]||c.defaults.effort:'原生思考设置'));};
    async function save(){setBusy(true);setError('');setNotice('');try{const data=await api('settings',{revision,settings:draft});setSaved(data.settings);setDraft(data.settings);setRevision(data.revision);setNotice('已保存，将用于下一次子代理委派。');}catch(e){setError(e.message);}finally{setBusy(false);}}
    return h('section',{className:'decision-panel','aria-label':'决策子代理设置'},h('style',null,css),
      h('h2',null,'决策子代理'),h('p',{className:'decision-muted'},'选择负责重要方案与代码审查的助手。主代理继续负责具体编码和测试。'),
      h('div',{className:'decision-switch','aria-label':'选择子代理'},...['codex','claude'].map(b=>h('button',{key:b,className:'decision-choice',type:'button','aria-pressed':backend===b,onClick:()=>{setDraft(s=>({...s,backend:b}));setNotice('');}},h('b',null,NAMES[b],saved.backend===b&&h('small',{className:'decision-badge'},'当前启用')),h('span',null,summarize(draft,b))))),
      h('div',{className:'decision-card'},
        h('div',{className:'decision-title'},h('h3',null,NAMES[backend]+' 设置'),h('button',{className:'decision-button',disabled:loading[backend],onClick:()=>catalog(backend,true)},loading[backend]?'正在读取…':'刷新模型列表')),
        h('div',{className:'decision-fields'},
          h('div',null,h('label',{htmlFor:'decision-model'},'模型'),h('select',{id:'decision-model',value:isCustom?'__custom__':choice.model,onChange:e=>{const v=e.target.value;setCustom(s=>({...s,[backend]:v==='__custom__'}));if(v!=='__custom__'){const m=models.find(x=>x.id===v);setChoice({model:v,...(choice.effort&&m&&!m.efforts.includes(choice.effort)?{effort:''}:{})});}}},h('option',{value:''},'继承原生设置'),...models.map(m=>h('option',{key:m.id,value:m.id},m.label)),h('option',{value:'__custom__'},'自定义模型 ID…')),isCustom&&h('input',{'aria-label':'自定义模型 ID',placeholder:backend==='codex'?'例如 gpt-6-astra':'输入完整模型 ID 或别名',value:choice.model,onChange:e=>setChoice({model:e.target.value})})),
          h('div',null,h('label',{htmlFor:'decision-effort'},'思考强度'),h('select',{id:'decision-effort',value:choice.effort,onChange:e=>setChoice({effort:e.target.value})},h('option',{value:''},'继承原生设置'),...efforts.map(e=>h('option',{key:e,value:e},(EFFORT_NAMES[e]||e)+' · '+e)),invalidEffort&&h('option',{value:choice.effort,disabled:true},'当前模型不支持 '+choice.effort)))),
        h('div',{className:'decision-details'},model?.description||(isCustom?'自定义模型是否可用，以后端实际响应为准。':'可继承原生默认值，或为 Harness 单独选择模型。')),
        cat&&h('div',{className:'decision-details'},'列表来源：'+cat.source+' · '+models.length+' 个模型'+(model?.resolvedModel?' · 实际模型：'+model.resolvedModel:'')),
        cat?.connection==='relay'&&h('div',{className:'decision-details'},'已继承 Claude Code 的中转配置，无需官方账号登录。模型别名与思考强度的实际效果，以中转服务支持为准。'),
        cat?.authenticated===false&&h('div',{className:'decision-notice error',role:'alert'},backend==='claude'?'Claude Code 尚无可用认证。可通过 cc-switch 配置中转凭据，或运行 claude auth login 登录官方账号，然后刷新模型列表。':'Codex 尚未登录。请运行 codex login，完成后刷新模型列表。'),
        errors[backend]&&h('div',{className:'decision-notice error',role:'alert'},errors[backend]+' 已保存的模型仍会保留。'),
        invalidEffort&&h('div',{className:'decision-notice error',role:'alert'},'请为当前模型选择支持的思考强度。')),
      h('div',{className:'decision-current'},h('strong',null,'已保存：'+NAMES[saved.backend]),summarize(saved,saved.backend),h('div',{className:'decision-muted'},'仅用于 Harness 的决策子代理；正在执行的任务保持原设置。')),
      lastRun&&h('div',{className:'decision-details'},'最近委派：'+NAMES[lastRun.backend]+' · '+lastRun.model+' · '+lastRun.effort+' · '+({running:'执行中',completed:'已完成',error:'失败',aborted:'已取消'}[lastRun.status]||lastRun.status)),
      h('div',{className:'decision-actions'},h('span',{className:'decision-muted'},'审查模式 · 只读访问工作区'),h('div',{className:'decision-actions-right'},h('button',{className:'decision-button',disabled:busy,onClick:()=>{setChoice({model:'',effort:''});setCustom(s=>({...s,[backend]:false}));}},'恢复原生设置'),h('button',{className:'decision-button primary',disabled:busy||!dirty||invalidEffort,onClick:save},busy?'保存中…':'保存设置'))),
      notice&&h('div',{className:'decision-notice',role:'status'},notice),error&&h('div',{className:'decision-notice error',role:'alert'},error,h('button',{className:'decision-button',onClick:load},'重新加载设置')));
  }
  return {name:NS,inject:['slots'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'decision-agent',order:32,label:()=> '决策子代理'},()=>h(Panel)));}};
}});
