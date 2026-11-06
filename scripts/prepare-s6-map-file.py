"""Recover the exact S6 NM3 metadata/background from the organizer's saved OSZ.

No network, database writes, star calculation or archive-wide extraction.
"""
import argparse
import csv
import hashlib
import json
import math
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'docs/imports/beatmaps/1034526.osz'
OUTPUT = ROOT / 'src/data/archive-file-supplements.json'
COVER = ROOT / 'public/archive/beatmaps/2314568/cover.jpg'
PACKAGE_SHA256 = '77b67ed47821a8463f8820da2b57d6274d41203b4e721ace368cb89876e3f96f'


def build(package=PACKAGE):
    if hashlib.sha256(package.read_bytes()).hexdigest() != PACKAGE_SHA256:
        raise ValueError('The reviewed original package checksum changed')
    with zipfile.ZipFile(package) as z:
        if len(z.infolist()) > 100 or sum(f.file_size for f in z.infolist()) > 32 * 1024 * 1024 or z.testzip():
            raise ValueError('Invalid or oversized original package')
        candidates = []
        for name in z.namelist():
            if not name.endswith('.osu'):
                continue
            raw = z.read(name)
            sections, section = {}, None
            for line in raw.decode('utf-8-sig').splitlines():
                if line.startswith('[') and line.endswith(']'):
                    section = line[1:-1]
                    sections[section] = []
                elif section and line.strip() and not line.startswith('//'):
                    sections[section].append(line)
            values = {s: dict(line.split(':', 1) for line in sections[s]) for s in ['Metadata', 'Difficulty', 'General']}
            if values['Metadata'].get('BeatmapID') == '2314568':
                candidates.append((name, raw, sections, values))
        if len(candidates) != 1:
            raise ValueError('The exact difficulty must occur once')
        name, raw, sections, values = candidates[0]
        m, d = values['Metadata'], values['Difficulty']
        if m['BeatmapSetID'] != '1034526' or m['Version'] != "Dailycare's Extra" or values['General']['Mode'].strip() != '0':
            raise ValueError('Unexpected difficulty identity or ruleset')
        attributes = {key: float(d[source]) for key, source in [('cs', 'CircleSize'), ('ar', 'ApproachRate'), ('od', 'OverallDifficulty')]}
        hp = float(d['HPDrainRate'])
        if not all(math.isfinite(v) and 0 <= v <= 11 for v in [*attributes.values(), hp]):
            raise ValueError('Invalid difficulty attributes')
        backgrounds = [row[2] for line in sections['Events'] if (row := next(csv.reader([line])))[:2] == ['0', '0']]
        if len(backgrounds) != 1 or PurePosixPath(backgrounds[0]).parts != (backgrounds[0],):
            raise ValueError('Expected one package-local background')
        background = z.read(backgrounds[0])
        entry = dict(poolId='captain-qualifier', slot='NM3', beatmapId=2314568,
                     beatmapSetId=1034526, coverPath='/archive/beatmaps/2314568/cover.jpg',
                     source='https://github.com/OCLR-dev/OCLR-website/blob/8e8416c3003795665b148208f6ecd94137ed812a/docs/imports/beatmaps/1034526.osz',
                     packageSha256=PACKAGE_SHA256, beatmapFile=name,
                     beatmapMd5=hashlib.md5(raw).hexdigest(), backgroundFile=backgrounds[0],
                     backgroundSha256=hashlib.sha256(background).hexdigest(),
                     fileMetadata=dict(artist=m['Artist'], title=m['Title'], difficulty=m['Version'], creator=m['Creator'], hp=hp),
                     attributes=dict(title=f"{m['Artist']} - {m['Title']} [{m['Version']}]", mapper=m['Creator'], **attributes))
        return {'s6': [entry]}, background


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, image = build()
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if OUTPUT.read_text() != encoded or COVER.read_bytes() != image:
            raise SystemExit('S6 file metadata/background drift; regenerate from the reviewed package')
        print('S6 NM3 package, metadata and background match')
    else:
        OUTPUT.write_text(encoded)
        COVER.parent.mkdir(parents=True, exist_ok=True)
        COVER.write_bytes(image)
        print('Recovered S6 NM3 metadata and background')
