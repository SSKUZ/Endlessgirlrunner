"""Package existing V2 GLBs into small, independently verifiable binary chunks.

python tools/package_characters_v2.py
No regeneration, credentials, network access or giant Base64 strings are needed.
"""
from pathlib import Path
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1] / 'assets/characters'
CHUNK_BYTES = 128 * 1024


def package():
    out = ROOT / 'v2_parts'
    (out / 'parts').mkdir(parents=True, exist_ok=True)
    manifest = {'encoding': 'concatenated-gzip', 'chunk_bytes': CHUNK_BYTES, 'models': []}
    source_manifest = json.loads((ROOT / 'manifest_v2.json').read_text())
    for item in source_manifest['models']:
        data = (ROOT / item['file']).read_bytes()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('Model does not match manifest: ' + item['file'])
        compressed = gzip.compress(data, compresslevel=6, mtime=0)
        model = dict(item, compressed_bytes=len(compressed),
                     compressed_sha256=hashlib.sha256(compressed).hexdigest(), parts=[])
        for i, start in enumerate(range(0, len(compressed), CHUNK_BYTES), 1):
            part = compressed[start:start + CHUNK_BYTES]
            path = f'parts/{Path(item["file"]).stem}.part{i:03d}.bin'
            (out / path).write_bytes(part)
            git_blob = b'blob ' + str(len(part)).encode() + b'\0' + part
            model['parts'].append({'path': path, 'bytes': len(part),
                                   'sha256': hashlib.sha256(part).hexdigest(),
                                   'git_sha': hashlib.sha1(git_blob).hexdigest()})
        manifest['models'].append(model)
        print(item['file'], len(data), 'bytes;', len(model['parts']), 'parts')
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    package()
