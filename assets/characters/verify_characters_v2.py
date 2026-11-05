"""Verify downloaded v2 GLBs without third-party packages.
Run from any folder: python assets/characters/verify_characters_v2.py
"""
from pathlib import Path
import hashlib,json,struct
root=Path(__file__).resolve().parent
manifest=json.loads((root/'manifest_v2.json').read_text())
for item in manifest['models']:
    p=root/item['file'];data=p.read_bytes()
    assert len(data)==item['bytes'],f'{p.name}: wrong size'
    assert hashlib.sha256(data).hexdigest()==item['sha256'],f'{p.name}: SHA-256 mismatch'
    assert struct.unpack_from('<4sII',data)==(b'glTF',2,len(data)),f'{p.name}: bad GLB header'
    n,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a
    document=json.loads(data[20:20+n])
    assert document['asset']['version']=='2.0'
    triangles=sum(document['accessors'][p['indices']]['count']//3
                  for m in document['meshes'] for p in m['primitives'])
    assert triangles==item['triangles'],f'{p.name}: wrong triangle count'
    print(p.name,'GLB 2.0 OK; SHA-256 OK;',triangles,'triangles')
