"""Create an offline, allowlisted Edge package using only Python's standard library."""
from pathlib import Path
import hashlib, json, zipfile
ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'extension'
files = json.loads((ROOT / 'scripts/runtime-files.json').read_text(encoding='utf-8'))
actual = sorted(p.relative_to(EXT).as_posix() for p in EXT.rglob('*') if p.is_file())
assert actual == sorted(files), 'Runtime files differ from allowlist'
for name in files:
    path = (EXT / name).resolve()
    assert EXT.resolve() in path.parents and path.is_file(), name
manifest = json.loads((EXT / 'manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
assert all(c.isdigit() or c == '.' for c in version)
assert (ROOT / 'docs/privacy.html').read_bytes() == (EXT / 'privacy.html').read_bytes(), 'Policy copies differ'
out = ROOT / 'dist'
out.mkdir(exist_ok=True)
package = out / ('qidian-edge-' + version + '.zip')
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, date_time=(2026, 9, 30, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (EXT / name).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
sha = hashlib.sha256(package.read_bytes()).hexdigest()
(out / 'SHA256.txt').write_text(sha + '  ' + package.name + '\n', encoding='utf-8')
print(package.name + ': ' + sha)
