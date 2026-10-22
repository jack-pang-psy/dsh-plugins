import {readFileSync, writeFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root),'utf8');
const portrait = readFileSync(new URL('assets/zoro-standing.png',root)).toString('base64');
const chibi = name => readFileSync(new URL(`assets/${name}.png`,root)).toString('base64');
const code = [
  `const React = require('react');`,
  `const PORTRAIT = 'data:image/png;base64,${portrait}';`,
  `const CHIBI_ZORO = 'data:image/png;base64,${chibi('zoro-chibi-sheet')}';`,
  `const CHIBI_SUNNY = 'data:image/png;base64,${chibi('sunny-chibi-sheet')}';`,
  `const TOKEN_MAP = ${read('src/token-map.json')};`,
  read('src/palette.js'),
  read('src/preferences.js').replace(/export \{ SuitRuntime, SKINS \};/,''),
  read('src/companions.js'),
  read('src/client.js'),
].join('\n');
writeFileSync(new URL('lib/client.js',root),`// dsh-zoro-channel-theme; preference adapter © tpmoonchefryan (MIT).\nwindow.__ModuleLoader__.load({id:'dsh-zoro-channel-theme',factory:(require)=>{\n${code}\nreturn {apply,inject:['theme','slots','configForms']};\n}});\n`);
console.log('Built client.js (self-contained PNG; no external image requests)');
