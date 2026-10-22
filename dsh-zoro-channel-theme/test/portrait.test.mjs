import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('src/client.js',root),'utf8');
const built=readFileSync(new URL('lib/client.js',root),'utf8');
const {portraitBox,portraitReserve,PORTRAIT_MIN,CONTENT_MIN}=vm.runInNewContext(source+';({portraitBox,portraitReserve,PORTRAIT_MIN,CONTENT_MIN})');

// The hero column only gives up what the smallest portrait is missing; the native home keeps its
// fixed 260px in wide windows, while dsh-claude-style's studio home (a centred 720px column) never does.
const RULES=[
  'body.zoro-active.zoro-with-portrait [class*=composerHero] {padding-inline-end:var(--zoro-portrait-room,0px)!important;box-sizing:border-box}',
  '@media(min-width:1050px) {body.zoro-active.zoro-with-portrait:not([data-dsh-claude-home-layout=studio]) [class*=composerHero] {padding-inline-end:max(260px,var(--zoro-portrait-room,0px))!important}}',
];

test('hero column reserves room on demand and the studio home never loses a fixed 260px',()=>{
  for(const rule of RULES){
    assert.ok(source.includes(rule),`src/client.js is missing: ${rule.slice(0,80)}…`);
    assert.ok(built.includes(rule),'lib/client.js is stale, rebuild it');
  }
  assert.equal(source.match(/padding-inline-end:[^;}]*260px/g).length,1);
  // No viewport breakpoint may hide the portrait; narrow windows shrink it instead.
  assert.ok(!/#zoro-portrait[^{}]*\{[^}]*display:none/.test(source));
});

// Studio home inside DSH: sidebar auto-collapses under 1024px, the column is min(720px, main area).
function studioColumn(viewWidth){
  const left=viewWidth>=1024?256:0, main=viewWidth-left-13, width=Math.min(720,main);
  const colLeft=left+(main-width)/2;
  return [colLeft,colLeft+width];
}
function place(viewWidth,viewHeight){
  const [colLeft,colRight]=studioColumn(viewWidth);
  const reserve=portraitReserve(viewWidth,colLeft,colRight), contentRight=colRight-reserve;
  return {reserve,content:contentRight-colLeft,contentRight,box:portraitBox(viewWidth,viewHeight,contentRight)};
}

test('the smallest DSH window (520×600) keeps a minimum-size portrait',()=>{
  const {reserve,content,box}=place(520,600);
  assert.ok(box,'portrait must stay visible');
  assert.equal(box.width,PORTRAIT_MIN);
  assert.ok(reserve>0 && content>=CONTENT_MIN,JSON.stringify({reserve,content}));
});

test('wide windows reserve nothing and the portrait keeps growing',()=>{
  const big=place(2000,1106), bigger=place(2560,1440);
  assert.equal(big.reserve,0);assert.equal(bigger.reserve,0);
  assert.ok(big.box.width>340 && big.box.height>620,JSON.stringify(big.box));
  assert.ok(bigger.box.width>big.box.width && bigger.box.height>big.box.height);
});

test('from the smallest to the largest window the portrait never vanishes or overlaps the content',()=>{
  let last=0;
  for(let w=520;w<=2600;w+=20){
    const {box,contentRight,content}=place(w,Math.round(w*.6)+300);
    assert.ok(box,`hidden at ${w}px`);
    assert.ok(box.width>=PORTRAIT_MIN && box.width<=box.height*2/3,`${w}px ${JSON.stringify(box)}`);
    assert.ok(w-12-box.width>=contentRight+12-0.001,`overlap at ${w}px`);
    assert.ok(content>=CONTENT_MIN,`content too narrow at ${w}px`);
    // Crossing 1024px brings the sidebar back, which legitimately narrows the free margin once.
    if(!(w>=1024 && w-20<1024))assert.ok(box.width>=last-1,`shrank while widening at ${w}px`);
    last=box.width;
  }
});

test('only a column narrower than the content floor gives up the portrait',()=>{
  // e.g. the sidebar expanded by hand over a minimum-size window: 240px of center left.
  assert.equal(portraitReserve(520,280,507),0);
  assert.equal(portraitBox(520,600,507),null);
});
