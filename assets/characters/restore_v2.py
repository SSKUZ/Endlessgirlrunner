"""Restore and verify saved V2 models using only Python's standard library.

python assets/characters/restore_v2.py [--recovery]
The default reads v2_parts/manifest.json; --recovery reads recovery_v2/manifest.json
and writes into recovery_v2/restored/ without replacing the refined models.
Each part and the concatenated compressed stream are verified before extraction.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import struct


def restore(recovery=False):
    root = Path(__file__).resolve().parent
    package = root / ('recovery_v2' if recovery else 'v2_parts')
    destination = package / 'restored' if recovery else root
    destination.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((package / 'manifest.json').read_text())
    for item in manifest['models']:
        chunks = []
        for part in item['parts']:
            data = (package / part['path']).read_bytes()
            if len(data) != part['bytes'] or hashlib.sha256(data).hexdigest() != part['sha256']:
                raise ValueError('Missing or damaged part: ' + part['path'])
            chunks.append(data)
        compressed = b''.join(chunks)
        if len(compressed) != item['compressed_bytes'] or hashlib.sha256(compressed).hexdigest() != item['compressed_sha256']:
            raise ValueError('Compressed stream mismatch: ' + item['file'])
        data = gzip.decompress(compressed)
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('GLB checksum mismatch: ' + item['file'])
        if struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
            raise ValueError('Invalid GLB header: ' + item['file'])
        target = destination / item['file']
        temp = target.with_suffix('.glb.tmp')
        temp.write_bytes(data)
        temp.replace(target)
        print(item['file'], len(data), 'bytes; all parts, SHA-256 and GLB header OK')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recovery', action='store_true')
    restore(parser.parse_args().recovery)
