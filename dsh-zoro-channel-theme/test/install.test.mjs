import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const installer=fileURLToPath(new URL('../scripts/install.py',import.meta.url));
test('installation repairs legacy overrides without changing user-selected plugin switches',()=>{
  const home=mkdtempSync(join(tmpdir(),'zoro-switch-regression-'));
  try {
    const profile=join(home,'profiles','desktop');mkdirSync(profile,{recursive:true});
    const manifest=join(profile,'package.json'),patch=join(profile,'cordis.patch.yml');
    const original='# unrelated settings stay intact\n- id: joi-channel-theme\n  disabled: false\n  config:\n    suit: library\n';
    writeFileSync(manifest,JSON.stringify({dependencies:{'dsh-joi-channel-theme':'0.1.14'},dsh:{profile:{bundles:['dsh-joi-channel-theme']}}}));
    writeFileSync(patch,original+'\n# BEGIN dsh-zoro-channel-theme\n- id: joi-channel-theme\n  disabled: true\n- insert:\n    - id: zoro-channel-theme\n      name: dsh-zoro-channel-theme\n# END dsh-zoro-channel-theme\n');
    const run=()=>execFileSync('python3',[installer],{env:{...process.env,DSH_HOME:home},encoding:'utf8'});
    run();
    let installed=JSON.parse(readFileSync(manifest,'utf8'));
    assert.deepEqual(installed.dsh.profile.bundles,['dsh-joi-channel-theme']);
    assert.equal(readFileSync(patch,'utf8'),original);
    assert.ok(installed.dependencies['dsh-zoro-channel-theme'].startsWith('link:'));
    // Updating after the user selects Zoro must preserve that selection too.
    installed.dsh.profile.bundles=['dsh-zoro-channel-theme'];writeFileSync(manifest,JSON.stringify(installed));
    run();
    assert.deepEqual(JSON.parse(readFileSync(manifest,'utf8')).dsh.profile.bundles,['dsh-zoro-channel-theme']);
    assert.equal(readFileSync(patch,'utf8'),original);
  } finally {rmSync(home,{recursive:true,force:true});}
});
