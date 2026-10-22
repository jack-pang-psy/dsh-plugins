// Four poses per sheet: idle / success / running / error, in a 2 × 2 grid.
const COMPANION_CELLS = {idle:'0% 0%',success:'100% 0%',running:'0% 100%',error:'100% 100%'};
const COMPANION_FEET={zoro:{idle:.9952,success:.9968,running:.9617,error:.9649},sunny:{idle:.9713,success:.9713,running:.9713,error:.9729}};
const COMPANION_LABELS = {idle:'待机',success:'完成',running:'处理中',error:'出错'};
class CompanionActivity {
  constructor(){this.reset();}
  reset(){this.running=false;this.baseline=0;this.failed=false;this.until=0;this.result='idle';}
  read(running, errors, now) {
    if(running){
      if(!this.running){this.baseline=errors;this.failed=false;}
      this.running=true;this.failed ||= errors>this.baseline;return 'running';
    }
    if(this.running){
      this.running=false;this.result=(this.failed || errors>this.baseline)?'error':'success';this.until=now+5200;
    }
    return now<this.until?this.result:'idle';
  }
}
function createCompanions() {
  const nodes=[], tracker=new CompanionActivity();
  let spacedStack, heroHeadline, lastThread, lastCard;
  const make=(id,sheet,label)=>{
    const node=document.createElement('div');node.id=id;node.className='zoro-companion';
    node.setAttribute('role','img');node.setAttribute('aria-label',label);node.dataset.zoroOwned='true';
    node.style.backgroundImage=`url('${sheet}')`;node.hidden=true;document.body.append(node);nodes.push(node);return node;
  };
  const hero=make('zoro-hero-companion',CHIBI_ZORO,'索隆 Q 版 · 首页');
  const left=make('zoro-chat-sunny',CHIBI_SUNNY,'桑尼号 Q 版 · 待机');
  const right=make('zoro-chat-zoro',CHIBI_ZORO,'索隆 Q 版 · 待机');
  const logo=document.createElement('span');logo.className='zoro-brand-characters';logo.setAttribute('aria-hidden','true');
  for(const [sheet,name] of [[CHIBI_SUNNY,'sunny'],[CHIBI_ZORO,'zoro']]){
    const icon=document.createElement('span');icon.className=`zoro-companion zoro-brand-${name}`;
    icon.style.backgroundImage=`url('${sheet}')`;logo.append(icon);
  }
  function clearAnchors(){
    spacedStack?.classList.remove('zoro-companion-space');spacedStack=undefined;
    heroHeadline?.classList.remove('zoro-companion-headline');heroHeadline=undefined;
  }
  function update({enabled,stack,card,heroMode,now=performance.now()}) {
    if(!enabled || !stack || !card){
      clearAnchors();for(const node of nodes)node.hidden=true;tracker.reset();lastThread=undefined;return;
    }
    const headline=heroMode?stack.querySelector('[class*=headline]:has([class*=fishHitbox]), [data-dsh-claude-part~=hero-headline]'):null;
    if(heroHeadline!==headline){heroHeadline?.classList.remove('zoro-companion-headline');heroHeadline=headline;}
    const wantSpace=!heroMode && window.innerHeight>=440 && card.getBoundingClientRect().width>=340;
    const nextStack=wantSpace?stack:undefined;
    if(spacedStack!==nextStack){spacedStack?.classList.remove('zoro-companion-space');spacedStack=nextStack;}
    if(spacedStack && !spacedStack.classList.contains('zoro-companion-space'))spacedStack.classList.add('zoro-companion-space');
    if(heroMode){
      tracker.reset();lastThread=undefined;left.hidden=true;right.hidden=true;
      hero.hidden=!headline;
      if(headline){
        if(!headline.classList.contains('zoro-companion-headline'))headline.classList.add('zoro-companion-headline');
        if(hero.parentElement!==headline)headline.append(hero);
        hero.style.backgroundPosition=COMPANION_CELLS.idle;
        const title=headline.querySelector('[class*=titleGroup], [data-dsh-claude-part~=hero-title-group]') ?? headline.querySelector('span:not([class*=fishHitbox])');
        if(title){const textRect=title.getBoundingClientRect(),headRect=headline.getBoundingClientRect();hero.style.left=`${textRect.left+textRect.width/2-headRect.left}px`;}
      }
      return;
    }
    hero.hidden=true;
    const thread=document.querySelector('[data-conversation-scroll]');
    if(thread!==lastThread || card!==lastCard){tracker.reset();lastThread=thread;lastCard=card;}
    const running=stack.querySelector('button svg rect[width="10"][rx="3"]')!==null;
    const errors=(thread??document).querySelectorAll('[data-state="error"], [role="alert"]').length;
    const state=tracker.read(running,errors,now);
    const rect=card.getBoundingClientRect(), stackRect=stack.getBoundingClientRect();
    const size=Math.min(112,Math.max(72,rect.width*.14));
    // If attachments or controls occupy the area above the card, sit above those too.
    const seat=Math.min(rect.top,stackRect.top+112);
    const visible=wantSpace && rect.height>0 && seat-size>=0 && seat<window.innerHeight;
    for(const [node,x,label] of [[left,rect.left+20,'桑尼号'],[right,rect.right-20-size,'索隆']]){
      node.hidden=!visible;if(!visible)continue;
      if(node.parentElement!==stack)stack.append(node);
      node.style.width=`${size}px`;node.style.height=`${size}px`;node.style.left=`${Math.round(x-stackRect.left)}px`;
      node.style.top=`${Math.round(seat-size*COMPANION_FEET[node===left?'sunny':'zoro'][state]-stackRect.top)}px`;node.style.backgroundPosition=COMPANION_CELLS[state];
      const aria=`${label} Q 版 · ${COMPANION_LABELS[state]}`;
      if(node.getAttribute('aria-label')!==aria)node.setAttribute('aria-label',aria);
    }
  }
  return {logo,update,metrics:()=>({hero:!hero.hidden,left:!left.hidden,right:!right.hidden}),dispose(){clearAnchors();for(const node of nodes)node.remove();logo.remove();}};
}
