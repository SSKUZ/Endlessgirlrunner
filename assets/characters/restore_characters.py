"""Restore both GLB files: python assets/characters/restore_characters.py"""
import base64, gzip, hashlib, json, struct
from pathlib import Path
root=Path(__file__).resolve().parent
for item in json.loads((root/'manifest.json').read_text())['models']:
    parts=sorted((root/(Path(item['file']).stem+'.parts')).glob('part*.b64'))
    assert len(parts)==item['parts'], 'Missing model parts'
    data=gzip.decompress(base64.b64decode(''.join(p.read_text() for p in parts),validate=True))
    assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256'], 'Checksum mismatch'
    magic,version,length=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data), 'Invalid GLB header'
    n,kind=struct.unpack_from('<II',data,12)
    doc=json.loads(data[20:20+n])
    assert kind==0x4e4f534a and doc['asset']['version']=='2.0'
    target=root/item['file'];target.write_bytes(data)
    print(item['file'],len(data),'bytes; SHA-256 OK; GLB 2.0 OK')
