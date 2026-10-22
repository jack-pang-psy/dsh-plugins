const NS = 'zoro-channel-theme';
const NAMES = {santoryu:'三刀流',enma:'阎魔',native:'原生外观'};
const CSS = `
body.zoro-active [data-dsh-claude-part~=hero-mark]::before {content:"Ⅲ"!important;mask:none!important;-webkit-mask:none!important;background:none!important;color:var(--zoro-accent)!important;font:italic 26px/1 Georgia,serif!important;width:32px!important;height:32px!important}
body.zoro-active .dsh-claude-crab-anchor {display:none!important}
body.zoro-active [class*=sidebarCol] {background:var(--dsw-specific-sidebar-fill)!important}
body.zoro-active [data-conversation-scroll] {background-color:var(--dsw-alias-bg-base);background-image:repeating-linear-gradient(115deg,transparent 0 79px,color-mix(in srgb,var(--zoro-accent) 3%,transparent) 79px 80px)}
body.zoro-active [data-composer-card] {border-color:var(--dsw-alias-border-l2)!important;box-shadow:0 8px 32px #0000000a!important}
body.zoro-active [data-composer-card] button[class*=_primary]:not(:disabled) {background:var(--zoro-accent)!important;color:var(--zoro-send-ink)!important}
body.zoro-active [class*=sessionRow][aria-selected=true] {box-shadow:inset 3px 0 var(--zoro-gold)}
body.zoro-active [class*=logoRow] {position:relative;min-height:60px!important;overflow:visible!important}
body.zoro-active [class*=logoRow] > [class*=_brand] {visibility:hidden}
.zoro-brand {position:absolute;inset:0;display:flex;align-items:center;gap:10px;padding:0 16px;pointer-events:none;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)}
.zoro-companion {background-size:200% 200%;background-position:0% 0%;background-repeat:no-repeat;pointer-events:none;flex:none}
.zoro-companion[hidden] {display:none!important}
.zoro-brand-characters {position:relative;display:block;width:86px;height:48px;flex:none}
.zoro-brand-characters .zoro-companion {position:absolute;display:block;bottom:-2px;width:54px;height:54px}
.zoro-brand-sunny {left:-5px}.zoro-brand-zoro {right:-5px}
/* dsh-claude-style 的侧栏搜索框：在「独立」样式下它自己占一行，排在插画横幅与「新会话」之间。
   这里只把配色对齐索隆主题，避免 Claude 的中性色浮在阎魔紫底上。 */
body.zoro-active[data-dsh-claude-search-style=standalone] .dsh-claude-search-bar > .dsh-claude-search-trigger {background:var(--dsw-alias-bg-layer-2)!important;border-color:var(--dsw-alias-border-l2)!important}
body.zoro-active[data-dsh-claude-search-style=standalone] .dsh-claude-search-bar > .dsh-claude-search-trigger:hover {border-color:var(--zoro-accent)!important}
body.zoro-active[data-dsh-claude-search-style=standalone] .dsh-claude-search-bar > .dsh-claude-search-trigger .dsh-claude-search-trigger-icon {color:var(--zoro-gold)!important}
/* 侧栏折叠成窄栏时，独立搜索行收成一枚 36px 图标按钮，与窄栏里其它入口同一尺寸。 */
body.zoro-active [data-sidebar-collapsed] .dsh-claude-search-bar {display:flex;justify-content:center;margin:0 0 12px!important}
body.zoro-active [data-sidebar-collapsed] .dsh-claude-search-bar > .dsh-claude-search-trigger {flex:none;width:36px;height:36px;justify-content:center;gap:0;padding:0!important;border:0!important;background:transparent!important}
body.zoro-active [data-sidebar-collapsed] .dsh-claude-search-bar > .dsh-claude-search-trigger :is(.dsh-claude-search-trigger-label,.dsh-claude-search-keys) {display:none}
/* 「覆盖品牌」（overlay）样式下，搜索框和 host 品牌按钮共用 logo row 的同一格，而插画横幅整块盖住这一行：
   把它抬到插画之上，恢复 claude-style 本来「悬停时盖住品牌」的行为，同时去掉"看不见却能点中"的陷阱。
   独立样式不命中这条——那种样式不会给 logo row 打 data-dsh-claude-search-row。 */
body.zoro-active[data-dsh-claude-search-style=overlay] [data-dsh-claude-search-row] > .dsh-claude-search-trigger {position:relative;z-index:1}
body.zoro-active .zoro-companion-headline {position:relative!important;padding-top:104px!important}
#zoro-hero-companion {position:absolute;top:0;left:50%;transform:translateX(-50%);width:96px;height:96px;z-index:2}
body.zoro-active .zoro-companion-space {position:relative!important;padding-top:112px!important}
#zoro-chat-sunny,#zoro-chat-zoro {position:absolute;z-index:6!important;filter:drop-shadow(0 2px 3px #00000018)}
.zoro-mark {font:500 30px/1 Georgia,serif;color:var(--zoro-accent);letter-spacing:-10px;transform:skew(-18deg);padding-right:10px}
.zoro-brand strong {display:block;font:600 18px/1.15 'Songti SC','Noto Serif CJK SC',serif;letter-spacing:5px}
.zoro-brand small {display:block;margin-top:3px;font:7px/1.1 ui-monospace,monospace;letter-spacing:2px;color:var(--zoro-gold)}
#zoro-portrait {position:fixed;pointer-events:none;z-index:4;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 6px 14px #00000026)}
#zoro-caption {position:fixed;pointer-events:none;z-index:4;text-align:center;color:var(--dsw-alias-label-secondary);font:10px/1.7 ui-monospace,monospace;letter-spacing:2px}
#zoro-caption strong {display:block;font:600 23px/1.4 'Songti SC','Noto Serif CJK SC',serif;letter-spacing:7px;color:var(--zoro-accent)}
.zoro-settings {display:flex;flex-direction:column;gap:14px;padding:16px 0;color:var(--dsw-alias-label-primary)}
.zoro-settings p {margin:3px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.zoro-options {display:flex;flex-wrap:wrap;gap:10px}
.zoro-choice {min-width:110px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:13px 17px;background:var(--dsw-alias-bg-layer-1);color:inherit;cursor:pointer;text-align:left}
.zoro-settings .zoro-choice[aria-pressed=true] {border-color:var(--dsw-alias-brand-primary)!important;background:var(--dsw-alias-button-info-fill)!important;box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)!important}
.zoro-settings .zoro-toggle[aria-pressed=true] {border-color:var(--dsw-alias-brand-primary)!important;background:var(--dsw-alias-button-info-fill)!important}
.zoro-choice:hover {background:var(--dsw-alias-bg-layer-2)}
.zoro-choice:focus-visible,.zoro-toggle:focus-visible {outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.zoro-swatches {display:flex;gap:4px}.zoro-swatches i {height:13px;width:19px;border-radius:3px;border:1px solid #80808030}
.zoro-toggle {padding:7px 12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;cursor:pointer}
/* 首页内容列给立绘让位。--zoro-portrait-room 由 layout() 算出：右侧空白放得下最小立绘时为 0，放不下时只取差额。
   原生首页（列宽随窗口在 744–984px 间伸缩）在宽窗口里仍固定让出 260px；dsh-claude-style「工作台」首页已是居中 720px 列，
   再固定扣 260px 会把用量面板和输入框挤到约 430px，所以只按需让位。 */
body.zoro-active.zoro-with-portrait [class*=composerHero] {padding-inline-end:var(--zoro-portrait-room,0px)!important;box-sizing:border-box}
@media(min-width:1050px) {body.zoro-active.zoro-with-portrait:not([data-dsh-claude-home-layout=studio]) [class*=composerHero] {padding-inline-end:max(260px,var(--zoro-portrait-room,0px))!important}}
@media(prefers-reduced-motion:reduce) {#zoro-portrait {transition:none}}
`;

const PORTRAIT_MIN=120, CONTENT_MIN=320, RESERVE_VAR='--zoro-portrait-room';
// 立绘最窄 PORTRAIT_MIN。首页内容列右侧的空白不够时，列只让出差额（内容最窄留 CONTENT_MIN），窗口缩到最小也不收起立绘。
function portraitReserve(viewWidth,colLeft,colRight) {
  const room=viewWidth-colRight-24;
  return room>=PORTRAIT_MIN ? 0 : Math.max(0,Math.ceil(Math.min(PORTRAIT_MIN-room,colRight-colLeft-CONTENT_MIN)));
}
// 大立绘占内容右侧的空白并随窗口缩放：高度跟视口走，宽度取右侧空白能给的，不超过 2:3。
// 只有内容列连 CONTENT_MIN 都保不住时才收起（例如最小窗口里手动展开侧栏）。
function portraitBox(viewWidth,viewHeight,contentRight) {
  const room=viewWidth-contentRight-24, height=Math.max(viewHeight-180,PORTRAIT_MIN*1.5);
  if(room<PORTRAIT_MIN) return null;
  return {width:Math.floor(Math.min(room,height*2/3)),height:Math.floor(height)};
}

function apply(ctx) {
  const scope = ctx.configForms.get(NS);
  const runtime = new SuitRuntime(ctx.theme, scope);
  runtime.start();
  const style = document.createElement('style'); style.id='zoro-theme-css'; style.textContent=CSS; document.head.append(style);
  const portrait = document.createElement('img'); portrait.id='zoro-portrait'; portrait.src=PORTRAIT; portrait.alt='罗罗诺亚·索隆 全身立绘'; portrait.draggable=false;
  const caption = document.createElement('div'); caption.id='zoro-caption'; caption.setAttribute('aria-hidden','true');
  const brand = document.createElement('div'); brand.className='zoro-brand'; brand.setAttribute('aria-hidden','true');
  brand.innerHTML='<div><strong>索隆</strong><small>RORONOA ZORO</small></div>';
  const companions=createCompanions();brand.prepend(companions.logo);
  document.body.append(portrait,caption);
  let frame, disposed=false;
  const portraitKey='dsh-zoro-channel-theme.portrait';
  let localPortrait, pendingPortrait;
  try {const saved=JSON.parse(localStorage.getItem(portraitKey));if(typeof saved?.value==='boolean'){localPortrait=saved.value;if(saved.pending)pendingPortrait=saved.value;}} catch {}
  const showPortrait = () => pendingPortrait ?? scope.getSnapshot()?.user?.portrait ?? localPortrait ?? scope.getSnapshot()?.value?.portrait ?? true;
  const portraitListeners=new Set();
  const setPortrait = async(value) => {
    pendingPortrait=value;localPortrait=value;
    const save=pending=>{try{localStorage.setItem(portraitKey,JSON.stringify({value,pending}));}catch{}};
    save(true);schedule();for(const fn of portraitListeners)fn();
    try {
      const accepted=await scope.set('portrait',value);
      if(accepted && pendingPortrait===value){pendingPortrait=undefined;save(false);}
    } catch(error) {console.warn('[zoro-theme] 使用本机立绘偏好',error);}
    schedule();for(const fn of portraitListeners)fn();
  };
  function layout() {
    frame=undefined;
    if(disposed) return;
    const active=!runtime.isNative;
    document.body.classList.toggle('zoro-active',active);
    document.body.classList.toggle('zoro-with-portrait',active && showPortrait());
    const logo=document.querySelector('[class*=logoRow]');
    if(active && logo && brand.parentElement!==logo) logo.append(brand);
    if(!active) brand.remove();
    const composer=document.querySelector('[class*=composerStack]');
    const hero=composer && /composerHero/.test(composer.className);
    const card=document.querySelector('[data-composer-card]');
    // Settle the column's reserve first: the hero companion and the portrait are placed against it.
    // The column's outer box does not move with its padding, so one measurement serves both steps.
    const column=active && hero && card && showPortrait() ? composer.getBoundingClientRect() : null;
    const reserve=column?.width ? portraitReserve(window.innerWidth,column.left,column.right) : 0;
    if(document.body.style.getPropertyValue(RESERVE_VAR)!==`${reserve}px`)document.body.style.setProperty(RESERVE_VAR,`${reserve}px`);
    companions.update({enabled:active && showPortrait(),stack:composer,card,heroMode:hero});
    // Use the empty margin right of the column's content box, never the input or the message column.
    const contentRight=column?.width ? column.right-(parseFloat(getComputedStyle(composer).paddingInlineEnd)||0) : 0;
    const box=column?.width ? portraitBox(window.innerWidth,window.innerHeight,contentRight) : null;
    portrait.hidden=!box; caption.hidden=!box;
    if(!box) return;
    portrait.style.cssText=`right:12px;top:58px;width:${box.width}px;height:${box.height}px;`;
    caption.style.cssText=`right:12px;top:${box.height+66}px;width:${box.width}px;`;
    caption.innerHTML=`<strong>${NAMES[runtime.skin]}</strong>RORONOA ZORO`;
  }
  const schedule=()=>{if(!disposed && frame===undefined)frame=requestAnimationFrame(layout);};
  const observer=new MutationObserver(records=>{
    if(records.some(r=>!r.target.closest?.('#zoro-caption,.zoro-brand,[data-zoro-owned]')))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-sidebar-collapsed']});
  window.addEventListener('resize',schedule);
  window.addEventListener('scroll',schedule,true);
  const activityTimer=setInterval(schedule,500);
  const off=runtime.subscribe(schedule), offScope=scope.subscribe(schedule);
  const offTheme=ctx.on('theme/change',()=>{schedule();for(const fn of runtime.listeners)fn(runtime.skin);});
  layout();
  function SettingsRow() {
    const [,redraw]=React.useState(0);
    React.useEffect(()=>{
      const update=()=>redraw(n=>n+1);
      const a=runtime.subscribe(update), b=scope.subscribe(update);portraitListeners.add(update);
      return ()=>{a();b();portraitListeners.delete(update);};
    },[]);
    const h=React.createElement, pref=ctx.theme.getTheme().preference;
    const button=(key,label,onClick,selected)=>h('button',{key,type:'button',className:'zoro-toggle','aria-pressed':selected,onClick},label);
    return h('div',{className:'zoro-settings'},
      h('div',null,h('strong',null,'索隆 · 换装'),h('p',null,'三刀流的绿与金，或阎魔的深紫。明暗模式跟随你的选择。')),
      h('div',{className:'zoro-options'},SKINS.map(id=>h('button',{key:id,type:'button',className:'zoro-choice','aria-pressed':runtime.skin===id,onClick:()=>runtime.setSuit(id)},
        h('span',{className:'zoro-swatches'},(id==='native'?['#F6F7F9','#717986','#3F6FE3']:['ground','brand','gold'].map(k=>PALETTE[id].dark[k])).map(c=>h('i',{key:c,style:{background:c}}))),
        h('strong',null,NAMES[id])))),
      h('div',{className:'zoro-options'},['light','dark','system'].map((id,i)=>button(id,['浅色','深色','跟随系统'][i],()=>ctx.theme.setTheme(id),pref===id))),
      h('div',null,button('portrait',showPortrait()?'隐藏角色插画':'显示角色插画',()=>setPortrait(!showPortrait()),showPortrait()),
        h('p',null,'包含首页大立绘、标题 Q 版和对话框两侧伙伴；大立绘随窗口缩放，窗口再窄也保留最小尺寸。')),
    );
  }
  ctx.slots.inject('settings.general.item',()=>ctx.slots.register({name:'settings.general.item',id:'appearance',priority:-2,order:10},SettingsRow));
  const debug=()=>({skin:runtime.skin,portraitVisible:!portrait.hidden,companions:companions.metrics(),persistence:runtime.persistence});
  window.__zoro=debug;
  ctx.effect(()=>()=>{
    disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);
    observer.disconnect(); window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);clearInterval(activityTimer);companions.dispose();
    off();offScope();if(typeof offTheme==='function')offTheme();runtime.dispose();
    portrait.remove();caption.remove();brand.remove();style.remove();document.body.classList.remove('zoro-active','zoro-with-portrait');document.body.style.removeProperty(RESERVE_VAR);
    if(window.__zoro===debug)delete window.__zoro;
  });
}
