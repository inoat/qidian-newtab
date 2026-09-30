"""Check the packaged runtime, resource provenance and portable functional tests."""
from pathlib import Path
import hashlib, json, re, subprocess, zipfile
ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'extension'
files = json.loads((ROOT / 'scripts/runtime-files.json').read_text(encoding='utf-8'))
actual = sorted(p.relative_to(EXT).as_posix() for p in EXT.rglob('*') if p.is_file())
assert actual == sorted(files), 'Runtime allowlist mismatch'
manifest = json.loads((EXT / 'manifest.json').read_text(encoding='utf-8'))
assert manifest['manifest_version'] == 3
assert manifest['content_security_policy']['extension_pages'] == "script-src 'self'; object-src 'self'"
assert not manifest.get('content_scripts')
assert (ROOT / 'docs/privacy.html').read_bytes() == (EXT / 'privacy.html').read_bytes()
for item in json.loads((ROOT / 'assets/icon-sources.json').read_text(encoding='utf-8')):
    assert hashlib.sha256((EXT / item['file']).read_bytes()).hexdigest() == item['sha256'], item['id']
for file in sorted(EXT.glob('*.js')):
    subprocess.run(['node', '--experimental-default-type=module', '--check', str(file)], check=True, cwd=ROOT)
for file in sorted((ROOT / 'tests').glob('*.mjs')):
    subprocess.run(['node', '--experimental-default-type=module', str(file)], check=True, cwd=ROOT)
package = ROOT / 'dist' / ('qidian-edge-' + manifest['version'] + '.zip')
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(files)
    for name in files:
        assert archive.read(name) == (EXT / name).read_bytes(), name
expected = (ROOT / 'dist/SHA256.txt').read_text().split()[0].lower()
assert hashlib.sha256(package.read_bytes()).hexdigest() == expected
for file in EXT.glob('*.js'):
    text = file.read_text(encoding='utf-8')
    assert not re.search(r'\beval\s*\(|new\s+Function\s*\(', text), file.name
print('PASS: 47 runtime files, policies, icon hashes, syntax, functional tests and exact ZIP contents')
