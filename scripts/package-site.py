"""Package only built static assets and the Sites manifest, never source files."""
from pathlib import Path
import json
import subprocess
import tarfile
import sys

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve()
manifest = root / '.openai' / 'hosting.json'
config = json.loads(manifest.read_text())
assert config.get('project_id'), 'Missing Sites project identifier'
assets = root / config['static']['directory']
assert (assets / 'index.html').is_file(), 'Run npm run build first'
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip(), 'Commit all changes before packaging'
with tarfile.open(output, 'w:gz') as archive:
    archive.add(manifest, arcname='.openai/hosting.json')
    archive.add(assets, arcname=config['static']['directory'])
with tarfile.open(output, 'r:gz') as archive:
    members = archive.getnames()
    assert '.openai/hosting.json' in members
    assert config['static']['directory'] + '/index.html' in members
    assert all(name == '.openai/hosting.json' or name == 'dist' or name.startswith('dist/') for name in members)
print(f'Validated static archive: {output} ({output.stat().st_size} bytes)')
