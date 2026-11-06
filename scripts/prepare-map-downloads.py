"""Verify organizer-supplied official OSZ files and build pinned download mirrors.

Files are data only. No archive extraction, network or database access.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'src/data/archive-map-downloads.json'
COMMIT = '8e8416c3003795665b148208f6ecd94137ed812a'
TARGETS = [
    ('s2', 'NM2', 1009329, 403096, "NiNo's Extra", 'c98304139ab47c9bde13a77ace1af547900e9fbaab32941b13e8a86d4417e1ad'),
    ('s6', 'NM3', 2314568, 1034526, "Dailycare's Extra", '77b67ed47821a8463f8820da2b57d6274d41203b4e721ace368cb89876e3f96f'),
]


def build():
    entries = []
    for season, slot, bid, sid, difficulty, sha in TARGETS:
        path = f'docs/imports/beatmaps/{sid}.osz'
        package = ROOT / path
        if hashlib.sha256(package.read_bytes()).hexdigest() != sha:
            raise ValueError(f'Official package checksum changed: {sid}')
        with zipfile.ZipFile(package) as z:
            if len(z.infolist()) > 100 or sum(f.file_size for f in z.infolist()) > 32 * 1024 * 1024 or z.testzip():
                raise ValueError(f'Invalid or oversized package: {sid}')
            hits = []
            for name in z.namelist():
                if not name.endswith('.osu'):
                    continue
                raw = z.read(name)
                section, values = '', {}
                for line in raw.decode('utf-8-sig').splitlines():
                    if line.startswith('[') and line.endswith(']'):
                        section = line[1:-1]
                    elif section in ['Metadata', 'General'] and ':' in line:
                        key, value = line.split(':', 1)
                        values[key] = value.strip()
                if values.get('BeatmapID') == str(bid):
                    if values.get('BeatmapSetID') != str(sid) or values.get('Version') != difficulty or values.get('Mode') != '0':
                        raise ValueError(f'Unexpected target identity: {bid}')
                    hits.append((name, hashlib.md5(raw).hexdigest()))
            if len(hits) != 1:
                raise ValueError(f'Target must occur exactly once: {bid}')
            name, md5 = hits[0]
        entries.append(dict(editionSlug=season, poolId='captain-qualifier', slot=slot,
                            beatmapId=bid, beatmapSetId=sid,
                            downloadMirror=f'https://github.com/OCLR-dev/OCLR-website/raw/{COMMIT}/{path}',
                            packagePath=path, packageSha256=sha, beatmapFile=name, beatmapMd5=md5))
    return entries


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    encoded = json.dumps(build(), ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if OUTPUT.read_text() != encoded:
            raise SystemExit('Official download manifest drift; regenerate from reviewed packages')
        print('Official OSZ files and pinned download mirrors match')
    else:
        OUTPUT.write_text(encoded)
        print('Updated official download mirrors')
