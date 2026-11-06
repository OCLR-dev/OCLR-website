"""Apply/check reviewed background-only supplements in authored import packages.

No network or database operations. The early-season inventory remains evidence.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROWS = json.loads((ROOT / 'src/data/archive-background-supplements.json').read_text())
PACKAGES = ['s4-archive', 's5-archive', 's5-reviewed-import', 's6-archive', 's6-confirmed-archive', 's9-archive']


def validate_evidence(rows=ROWS, review=None):
    review = review or json.loads((ROOT / 'docs/imports/archive-background-review.json').read_text())
    if review['sort'] != 'relevance_desc' or review['modes'] != 'any' or review['statuses'] != 'any':
        raise ValueError('Unexpected reviewed search policy')
    def identity(row):
        return tuple(row[k] for k in ['editionSlug', 'poolId', 'slot', 'beatmapId'])
    def artist(value):
        value = re.sub(r'\b(?:ft|feat)\.?', 'feat', value.casefold())
        return re.sub(r'\W', '', value)
    if len({identity(r) for r in rows}) != len(rows):
        raise ValueError('Duplicate background target')
    for row in rows:
        evidence = next(e for e in review['entries'] if identity(e) == identity(row))
        selected = evidence['selected']
        if (evidence['originalCover']['status'] != 404 or selected['status'] != 200
                or selected['setId'] == row['originalSetId']
                or selected['setId'] != row['backgroundSetId']
                or selected['title'].casefold() != row['title'].casefold()
                or selected['coverSha256'] != row['coverSha256']
                or row['backgroundBeatmapId'] not in [b['beatmapId'] for b in selected['beatmaps']]
                or evidence['selectedRank'] != row['searchRank']):
            raise ValueError('Background manifest disagrees with reviewed evidence')
        expected_artist = artist(row['artist'])
        if expected_artist not in artist(selected['artist']):
            raise ValueError('Background artist mismatch')
        failed = {r['setId'] for r in evidence['checkedUnavailableCandidates'] if r['status'] == 404}
        for candidate in evidence['search']['results']:
            sid = int(candidate['links'][0]['href'].rsplit('/', 1)[1])
            if candidate['rank'] == row['searchRank']:
                if sid != row['backgroundSetId']:
                    raise ValueError('Search rank does not identify the selected set')
                break
            if (candidate['links'][0]['text'].casefold() == row['title'].casefold()
                    and expected_artist in artist(candidate['links'][1]['text'].removeprefix('by '))
                    and sid != row['originalSetId'] and sid not in failed):
                raise ValueError('Earlier matching candidate has not been excluded as unavailable')


def apply(archive):
    for row in ROWS:
        if row['editionSlug'] != archive['editionSlug']:
            continue
        matches = [m for p in archive['pools'] if p['id'] == row['poolId']
                   for m in p['maps'] if m['slot'] == row['slot'] and m['beatmapId'] == row['beatmapId']]
        if len(matches) != 1:
            raise ValueError('Background target must occur exactly once')
        saved = matches[0]
        if saved.get('backgroundSetId') not in [None, row['backgroundSetId']]:
            raise ValueError('Conflicting background set')
        saved['backgroundSetId'] = row['backgroundSetId']
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    validate_evidence()
    for name in PACKAGES:
        path = ROOT / ('docs/imports/' + name + '.json')
        before = json.loads(path.read_text())
        corrected = apply(json.loads(path.read_text()))
        if args.check:
            if before != corrected:
                raise SystemExit('Background supplement drift: ' + name)
        else:
            path.write_text(json.dumps(corrected, ensure_ascii=False, indent=2) + '\n')
    print('Reviewed background sources match all six import packages')
