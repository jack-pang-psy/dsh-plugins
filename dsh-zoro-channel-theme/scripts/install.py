#!/usr/bin/env python3
"""Install the local theme into the desktop profile, preserving a rollback snapshot."""
import json, os, shutil
from pathlib import Path
from datetime import datetime
source=Path(__file__).resolve().parents[1]
profile=Path(os.environ.get('DSH_HOME',str(Path.home()/'.dsh')))/'profiles'/'desktop'
manifest=profile/'package.json'
patch=profile/'cordis.patch.yml'
if not manifest.is_file() or not patch.is_file():raise SystemExit(f'DSH desktop profile missing: {profile}')
name='dsh-zoro-channel-theme'
link=profile/'node_modules'/name
if link.exists() and link.resolve()!=source:raise SystemExit(f'Refusing to replace another installation: {link}')
backup=profile/('zoro-theme-backup-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
backup.mkdir()
for path in (manifest,patch):shutil.copy2(path,backup/path.name)
link.parent.mkdir(parents=True,exist_ok=True)
if not link.exists():link.symlink_to(source,target_is_directory=True)
m=json.loads(manifest.read_text())
m.setdefault('dependencies',{})[name]='link:'+str(source)
# Installation must preserve the user's enabled bundle list.
# A new installation stays disabled until enabled through the plugin manager.
manifest.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
s=patch.read_text()
start='# BEGIN dsh-zoro-channel-theme'
end='# END dsh-zoro-channel-theme'
if start in s:
 a=s.index(start);b=s.index(end,a)+len(end);s=s[:a]+s[b:]
s=s.rstrip()+'\n'
patch.write_text(s)
print(f'Installed: {link}\nBackup: {backup}')
print('Existing plugin switches are preserved. To use Zoro, disable Joi and enable Zoro in the DSH plugin page.')
