import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('src/client.js',root),'utf8');
const built=readFileSync(new URL('lib/client.js',root),'utf8');

// The sidebar search box belongs to dsh-claude-style; the theme only aligns it with the suit
// colours and keeps the illustration banner from swallowing it. These assertions pin the
// contract: a rebuilt lib/client.js must carry the same rules as src/client.js.
const RULES=[
  'body.zoro-active[data-dsh-claude-search-style=standalone] .dsh-claude-search-bar > .dsh-claude-search-trigger {background:var(--dsw-alias-bg-layer-2)!important;border-color:var(--dsw-alias-border-l2)!important}',
  'body.zoro-active[data-dsh-claude-search-style=standalone] .dsh-claude-search-bar > .dsh-claude-search-trigger:hover {border-color:var(--zoro-accent)!important}',
  'body.zoro-active[data-dsh-claude-search-style=standalone] .dsh-claude-search-bar > .dsh-claude-search-trigger .dsh-claude-search-trigger-icon {color:var(--zoro-gold)!important}',
  'body.zoro-active [data-sidebar-collapsed] .dsh-claude-search-bar {display:flex;justify-content:center;margin:0 0 12px!important}',
  'body.zoro-active [data-sidebar-collapsed] .dsh-claude-search-bar > .dsh-claude-search-trigger {flex:none;width:36px;height:36px;justify-content:center;gap:0;padding:0!important;border:0!important;background:transparent!important}',
  'body.zoro-active [data-sidebar-collapsed] .dsh-claude-search-bar > .dsh-claude-search-trigger :is(.dsh-claude-search-trigger-label,.dsh-claude-search-keys) {display:none}',
  'body.zoro-active[data-dsh-claude-search-style=overlay] [data-dsh-claude-search-row] > .dsh-claude-search-trigger {position:relative;z-index:1}',
];

test('sidebar search rules exist in the source and in the built client',()=>{
  for(const rule of RULES){
    assert.ok(source.includes(rule),`src/client.js is missing: ${rule.slice(0,70)}…`);
    assert.ok(built.includes(rule),`lib/client.js is stale, rebuild it: ${rule.slice(0,70)}…`);
  }
});

test('overlay mode lifts the search box above the banner instead of hiding it',()=>{
  // Hiding it would leave the sidebar with no search entry at all: dsh-claude-style clips the
  // host search slot for every style except `icon`. The fallback must keep it reachable.
  assert.ok(!/\[data-dsh-claude-search-row\][^}]*display:none/.test(source));
  assert.ok(source.includes('[data-dsh-claude-search-row] > .dsh-claude-search-trigger {position:relative;z-index:1}'));
});

test('the illustration banner keeps its own row instead of covering neighbours',()=>{
  // The banner is an absolute overlay inside the logo row; the search row lives next to the
  // row, so neither can cover the other. `overflow:visible` must stay so the chibi sprites
  // are not clipped.
  assert.ok(source.includes('[class*=logoRow] {position:relative;min-height:60px!important;overflow:visible!important}'));
  assert.ok(source.includes('.zoro-brand {position:absolute;inset:0;'));
  assert.ok(source.includes('pointer-events:none;background:var(--dsw-specific-sidebar-fill)'));
});
