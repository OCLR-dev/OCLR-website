#!/usr/bin/env python3
"""Capture public official base metadata for S4–S6. No credentials or DB writes.

Only whitelisted metadata is retained, never the full page/user content. Existing
historical source packages remain unchanged. Failures remain explicit in output.
"""
import argparse
import datetime
import json
import re
import time
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'src/data/archive-beatmaps.json'


def extract(html, bid):
    match = re.search(r'<script id="json-beatmapset"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise ValueError('Official beatmapset payload missing')
    data = json.loads(match[1])
    beatmap = next(b for b in data['beatmaps'] if b['id'] == bid)
    if beatmap['beatmapset_id'] != data['id'] or beatmap['mode'] != 'osu':
        raise ValueError('Unexpected beatmap identity or ruleset')
    return dict(beatmapId=bid, setId=data['id'],
                title=f"{data['artist']} - {data['title']} [{beatmap['version']}]",
                mapper=', '.join(o['username'] for o in beatmap.get('owners', []) if o.get('username')) or data['creator'],
                stars=beatmap['difficulty_rating'], bpm=beatmap['bpm'],
                drainSeconds=beatmap['hit_length'], cs=beatmap['cs'],
                ar=beatmap['ar'], od=beatmap['accuracy'],
                source=f'https://osu.ppy.sh/beatmaps/{bid}',
                fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                beatmapUpdatedAt=beatmap['last_updated'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    ids = sorted({m['beatmapId'] for name in ['s4', 's5', 's6-confirmed']
                  for p in json.loads((ROOT / f'docs/imports/{name}-archive.json').read_text())['pools']
                  for m in p['maps'] if m['beatmapId']})
    result = json.loads(OUTPUT.read_text()) if args.resume and OUTPUT.exists() else dict(maps={}, unavailable=[])
    result['unavailable'] = []
    result['pending'] = [bid for bid in ids if str(bid) not in result['maps']]
    for bid in ids:
        if str(bid) in result['maps']:
            continue
        try:
            response = subprocess.check_output(['curl', '--location', '--silent', '--show-error', '--max-time', '30', '--write-out', '\n%{http_code}', f'https://osu.ppy.sh/beatmaps/{bid}'], text=True)
            html, status = response.rsplit('\n', 1)
            if status == '429':
                OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
                raise SystemExit('Rate limited; capture stopped. Wait before resuming.')
            if status == '404':
                result['unavailable'].append(bid)
            elif status != '200':
                raise ValueError(f'HTTP {status}')
            else:
                result['maps'][str(bid)] = extract(html, bid)
            result['pending'].remove(bid)
        except Exception as error:
            print(f'{bid}: {type(error).__name__}; left pending', flush=True)
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        time.sleep(3)
    print(f"Captured {len(result['maps'])}/{len(ids)}; unavailable: {result['unavailable']}")


if __name__ == '__main__':
    main()
