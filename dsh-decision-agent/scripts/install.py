#!/usr/bin/env python3
"""Stage and validate the local plugin with the installed desktop loader, then install.
No dependencies are downloaded. Existing profile files are backed up before changes.
"""
from pathlib import Path
import datetime,json,os,re,shutil,subprocess,tempfile

source=Path(__file__).resolve().parents[1]
harness_home=Path(os.environ.get('DSH_HOME',str(Path.home()/'.dsh')))
profile=harness_home/'profiles/desktop'
manifest=profile/'package.json';patch=profile/'cordis.patch.yml'
old_manifest=manifest.read_text();old_patch=patch.read_text()
package=json.loads(old_manifest)
package.setdefault('dependencies',{})['dsh-decision-agent']='link:'+str(source)
bundles=package['dsh']['profile']['bundles']
if 'dsh-decision-agent' not in bundles:bundles.append('dsh-decision-agent')
updated=old_patch
start=updated.index('- id: preset-standard\n')
end=updated.find('\n- id: ',start+1)
if end<0:end=len(updated)
block=updated[start:end]
block=re.sub(r'(?m)^    name: .*$', '    name: 子Agent 决策模式',block,count=1)
block=re.sub(r'(?m)^    description: .*$', '    description: 主代理负责具体编码与测试；由设置页选择 Codex 或 Claude Code，负责重要方案与关键结果审查。',block,count=1)
ss=block.index('          suffix: |\n');se=block.index('          prefix:',ss)
suffix=block[ss:se]
if '实际后端由设置页' not in suffix:
 suffix=suffix.replace('subagent_codex','subagent_decision').replace('Codex','所选决策子代理')
suffix=suffix.replace('            本模式采用', '            通过 subagent_decision 调用决策子代理；实际后端由设置页选择 Codex 或 Claude Code。不要绕过统一入口直接调用某个产品后端。\n            本模式采用') if '实际后端由设置页' not in suffix else suffix
suffix=re.sub(r'(?m)^            5\..*$', '            5. 决策子代理在只读模式下提供方案、约束、必要接口示例和审查意见；不得要求它修改文件、执行写操作或完成整套实现。具体编码与测试由主代理或其执行子代理完成。',suffix)
block=block[:ss]+suffix+block[se:]
# Keep the known preset row ID but route its model-facing tool through the unified provider.
pattern=r"(          - id: tool-subagent-codex\n.*?)(?=          - id:|\Z)"
def unified(m):
 return m.group(1).replace('provider: codex','provider: decision').replace('toolName: subagent_codex','toolName: subagent_decision')
block=re.sub(pattern,unified,block,flags=re.S)
updated=updated[:start]+block+updated[end:]
# Prevent the global direct Codex tool from bypassing the user's selected backend.
if not re.search(r'(?m)^- id: tool-subagent-codex$',updated):
 updated+='\n# Unified decision-agent entry owns backend selection.\n- id: tool-subagent-codex\n  disabled: true\n'
new_manifest=json.dumps(package,ensure_ascii=False,indent=2)+'\n'
link=profile/'node_modules/dsh-decision-agent'
# Linked plugin sources need the profile's peer packages in Node's lookup chain.
peers=source/'node_modules'
if not peers.exists():peers.symlink_to(profile/'node_modules',target_is_directory=True)
created_link=False
if link.is_symlink():
 if link.resolve()!=source:raise RuntimeError('A different dsh-decision-agent installation already exists.')
elif link.exists():raise RuntimeError('A non-link installation already exists; refusing to overwrite it.')
else:link.symlink_to(source,target_is_directory=True);created_link=True
try:
 with tempfile.TemporaryDirectory(prefix='dsh-decision-install-') as tmp:
  root=Path(tmp);os.chmod(root,0o700);clone=root/'profiles/check';clone.mkdir(parents=True)
  (clone/'package.json').write_text(new_manifest);(clone/'cordis.patch.yml').write_text(updated);(clone/'cordis.yml').write_text('[]\n')
  (clone/'node_modules').symlink_to(profile/'node_modules',target_is_directory=True)
  if (harness_home/'cordis.patch.yml').exists():shutil.copy2(harness_home/'cordis.patch.yml',root/'cordis.patch.yml')
  script=root/'check.cjs';script.write_text('''const fs=require('node:fs');const {createRequire}=require('node:module');
const anchor='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/package.json';
const req=createRequire(anchor),boot=req('@deepseek-ai/dsh-app-boot');
const loaded=boot.loadProfile('dsh','check',anchor,undefined,{userLayer:true});
const layers=loaded.layers.map(x=>({label:x.packageName,patches:x.patches}));layers.push({label:loaded.patchPath,patches:loaded.patches});
const h=boot.loadOptionalPatches('dsh',process.env.DSH_HOME+'/cordis.patch.yml');if(h)layers.push({label:'home',patches:h});
const dump=boot.renderConfigDump('dsh',loaded.dir+'/cordis.yml',layers);fs.writeFileSync(process.argv[2],dump);
''')
  env=dict(os.environ,DSH_HOME=str(root),ELECTRON_RUN_AS_NODE='1')
  r=subprocess.run(['/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',str(script),str(root/'composed.yml')],env=env,capture_output=True,text=True,timeout=30)
  if r.returncode:raise RuntimeError('Desktop composition validation failed: '+r.stderr[-2000:])
  import yaml
  tree=yaml.load((root/'composed.yml').read_text(),Loader=yaml.BaseLoader)
  assert any(x.get('id')=='decision-agent' for x in tree)
  tool=next(x for x in tree if x.get('id')=='tool-subagent-decision');assert tool['config']['provider']=='decision'
  original=next(x for x in tree if x.get('id')=='tool-subagent-codex');assert original.get('disabled')=='true'
  standard=next(x for x in tree if x.get('id')=='preset-standard')['config'];assert standard['name']=='子Agent 决策模式'
  persona=next(x for x in standard['plugins'] if x.get('id')=='persona')['config']['suffix'];assert 'subagent_decision' in persona
  assert '调用 subagent_codex' not in persona
  localtool=next(x for x in standard['plugins'] if x.get('id')=='delegation')['config']
  assert next(x for x in localtool if x.get('id')=='tool-subagent-codex')['config']['provider']=='decision'
  assert manifest.read_text()==old_manifest and patch.read_text()==old_patch,'Profile changed during validation; retry.'
  stamp=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y%m%d-%H%M%S')
  backup=profile/('decision-agent-backup-'+stamp);backup.mkdir(mode=0o700)
  shutil.copy2(manifest,backup/'package.json');shutil.copy2(patch,backup/'cordis.patch.yml')
  for target,text in [(manifest,new_manifest),(patch,updated)]:
   staged=target.with_name(target.name+'.decision-agent.tmp');staged.write_text(text);os.chmod(staged,target.stat().st_mode & 0o777);os.replace(staged,target)
  print(json.dumps({'installed':str(source),'backup':str(backup),'composition':'passed'},ensure_ascii=False))
except:
 if created_link:link.unlink()
 raise
