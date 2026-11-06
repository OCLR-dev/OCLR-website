"""Recover S2 NM2 from the exact organizer-provided official OSZ, offline.

Historical stars/drain are organizer-supplied; no difficulty recalculation.
"""
import argparse
import csv
import hashlib
import json
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'docs/imports/beatmaps/403096.osz'
OUTPUT = ROOT / 'src/data/archive-file-supplements.json'
COVER = ROOT / 'public/archive/beatmaps/1009329/cover.jpg'
PACKAGE_SHA256 = 'c98304139ab47c9bde13a77ace1af547900e9fbaab32941b13e8a86d4417e1ad'


def build(package=PACKAGE):
    if hashlib.sha256(package.read_bytes()).hexdigest() != PACKAGE_SHA256:
        raise ValueError('The reviewed official package checksum changed')
    with zipfile.ZipFile(package) as z:
        if len(z.infolist()) > 100 or sum(f.file_size for f in z.infolist()) > 32 * 1024 * 1024 or z.testzip():
            raise ValueError('Invalid or oversized official package')
        matches = []
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
            metadata = dict(line.split(':', 1) for line in sections['Metadata'])
            if metadata.get('BeatmapID') == '1009329':
                matches.append((name, raw, sections, metadata))
        if len(matches) != 1:
            raise ValueError('The exact difficulty must occur once')
        name, raw, sections, metadata = matches[0]
        difficulty = dict(line.split(':', 1) for line in sections['Difficulty'])
        general = dict(line.split(':', 1) for line in sections['General'])
        if metadata['BeatmapSetID'] != '403096' or metadata['Version'] != "NiNo's Extra" or general['Mode'].strip() != '0':
            raise ValueError('Unexpected difficulty identity or ruleset')
        attributes = {key: float(difficulty[value]) for key, value in [('cs', 'CircleSize'), ('ar', 'ApproachRate'), ('od', 'OverallDifficulty'), ('hp', 'HPDrainRate')]}
        if attributes != dict(cs=4, ar=9.3, od=8.3, hp=5.5):
            raise ValueError('Reviewed difficulty attributes changed')
        timings = [line.split(',') for line in sections['TimingPoints']]
        red = [float(row[1]) for row in timings if row[6] == '1']
        if not red or any(value != 250 for value in red):
            raise ValueError('Reviewed 240 BPM timing changed')
        backgrounds = [row[2] for line in sections['Events'] if (row := next(csv.reader([line])))[:2] == ['0', '0']]
        if len(backgrounds) != 1 or PurePosixPath(backgrounds[0]).parts != (backgrounds[0],):
            raise ValueError('Expected one package-local background')
        image = z.read(backgrounds[0])
        entry = dict(poolId='captain-qualifier', slot='NM2', beatmapId=1009329,
                     beatmapSetId=403096, coverPath='/archive/beatmaps/1009329/cover.jpg',
                     source='https://github.com/OCLR-dev/OCLR-website/blob/8e8416c3003795665b148208f6ecd94137ed812a/docs/imports/beatmaps/403096.osz',
                     packageSha256=PACKAGE_SHA256, beatmapFile=name,
                     beatmapMd5=hashlib.md5(raw).hexdigest(), backgroundFile=backgrounds[0],
                     backgroundSha256=hashlib.sha256(image).hexdigest(),
                     fileMetadata=dict(artist=metadata['Artist'], title=metadata['Title'], difficulty=metadata['Version'], creator=metadata['Creator'], hp=attributes['hp']),
                     historicalSource='Organizer-supplied #852 metadata: 5.67 stars, 240 BPM, 3:52 drain (3:55 total); 2026-11-06',
                     attributes=dict(title=f"{metadata['Artist']} - {metadata['Title']} [{metadata['Version']}]", mapper=metadata['Creator'], stars=5.67, bpm=240, drainSeconds=232, **attributes))
        data = json.loads(OUTPUT.read_text())
        data['s2'] = [entry]
        return data, image


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, image = build()
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if OUTPUT.read_text() != encoded or COVER.read_bytes() != image:
            raise SystemExit('S2 metadata/background drift; regenerate from the reviewed OSZ')
        print('S2 NM2 package, metadata and background match')
    else:
        OUTPUT.write_text(encoded)
        COVER.parent.mkdir(parents=True, exist_ok=True)
        COVER.write_bytes(image)
        print('Recovered S2 NM2 metadata and background')
