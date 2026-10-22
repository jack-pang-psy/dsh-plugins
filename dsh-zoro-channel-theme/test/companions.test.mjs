import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/companions.js',import.meta.url),'utf8');
const Tracker=vm.runInNewContext(source+';CompanionActivity');
test('companions reflect the current turn and ignore errors from old messages',()=>{
 const t=new Tracker();
 assert.equal(t.read(false,2,0),'idle');
 assert.equal(t.read(true,2,100),'running');
 assert.equal(t.read(false,2,200),'success');
 assert.equal(t.read(false,2,5400),'idle');
 assert.equal(t.read(true,2,5500),'running');
 assert.equal(t.read(true,3,5600),'running');
 assert.equal(t.read(false,3,5700),'error');
 assert.equal(t.read(false,3,10900),'idle');
 // Historical errors do not turn the next successful run into an error.
 assert.equal(t.read(true,3,11000),'running');
 assert.equal(t.read(false,3,11100),'success');
 t.reset();assert.equal(t.read(false,3,11200),'idle');
});
