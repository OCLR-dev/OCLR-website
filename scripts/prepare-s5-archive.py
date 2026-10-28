#!/usr/bin/env python3
"""Build a private S5 archive from the competition-only source dossier.

No network, database writes, approvals, inferred identities or UTC timestamps.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/imports/s5-source-records.json'
OUTPUT = ROOT / 'docs/imports/s5-archive.json'

# Provenance for archived S5 edits whose official beatmap page is gone: the edit
# stays in beatmapId, originalId points at the surviving source map players can
# still open. Mirrors ORIGINAL_BEATMAP_IDS in the S6/S9/S10 builders (#420).
ORIGINAL_BEATMAP_IDS = {2567502: 2933979, 2720295: 2678913, 2756449: 2755377}
# The two edits without a surviving page have unpublished cells, so the editors'
# own values fill them (organizer-confirmed 2026-10-29): DT4 is the 1.5x version of
# 2678913 with AR 9 -> 8.5 and OD 8.5 -> 8 (hence stars 6.27 / bpm 210, and
# drainSeconds 167 / 1.5 ~= 111), and NM4's cs/ar/od match 2755377. These are the
# edits' values, not re-measured results.
SUPPLEMENTAL_MAP_ATTRIBUTES = {
    2720295: dict(mapper='Gaia', stars=6.27, bpm=210, drainSeconds=111,
                  cs=4, ar=8.5, od=8),
    2756449: dict(cs=4, ar=9.4, od=8),
}


def build():
    s = json.loads(SOURCE.read_text())
    a = dict(formatVersion=2, editionSlug='s5', sourceUrl=s['source']['spreadsheet'],
             capturedOn=s['source']['readOn'], draftMode='final-tiers',
             teams=[], players=[], unresolvedPlayers=[], picks=[], staff=[], standings=[],
             matches=[], pools=[], qualifiers=[], reviewTables=[], sourceFacts=[],
             notes=['S5 私人草稿；名單以 MainSheet 為準。',
                    '34 場原表比分尚未覆核；原始日期、時間及比分存於管理附錄。時區及 MP 紅藍隊未知，不補造 review sides 或 UTC 時間。',
                    '規則原文、最終名次、晉級連線及未知 UID 尚待核實。',
                    'DT2、DT4、NM4 的 originalId 指向仍可開啟的原始圖；DT4 是 2678913 的 1.5× 版本（AR 9→8.5、OD 8.5→8，故 stars 6.27、bpm 210），DT4、NM4 的 mapper、stars、bpm、drainSeconds、cs、ar、od 為該 edit 的上傳值，不是本次重新裁定或量測的比賽結果。'],
             links=[dict(label='來源整理與差異記錄', url='https://github.com/OCLR-dev/OCLR-website/blob/82032bce0a512ae99c9fa2e27d59b6470012d9e7/docs/s5-archive.md'),
                    dict(label='S5 規則來源（原文待取得）', url=s['rulesLink'])])
    def fact(category, label, value, source):
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        assert len(text) <= 6000
        a['sourceFacts'].append(dict(category=category,label=label,text=text,source=source))
    for t in s['teams']:
        tid = t['letter'].lower()
        a['teams'].append(dict(id=tid,name=t['name'],source=t['source']))
        for i,p in enumerate(t['members']):
            role = p['role']
            member = dict(username=p['name'],teamId=tid,source=p['source'],
                          role='captain' if role == 'Captain' else 'coach' if role == 'Coach' else 'player',
                          tier=0 if role == 'Captain' else int(role.split()[1]) if role.startswith('Tier ') else None)
            if role == 'VICE': member['sourceRole'] = 'VICE'
            if p['identity']:
                member['source'] += '; '+p['identity']['source']
                a['players'].append(dict(osuId=p['identity']['osuId'],**member))
            else:
                a['unresolvedPlayers'].append(dict(id=f'{tid}-slot-{i+1}',**member))
    for i,p in enumerate(s['pools']):
        maps=[]
        for m in p['maps']:
            meta=m['metadata']; first=i==0; full=i!=1
            rawlength=meta.get('E' if first else 'F','') if full else ''
            drain=re.search(r'(\d+):(\d+)\s*drain',rawlength)
            def number(key):
                v=meta.get(key)
                return float(v) if v and re.fullmatch(r'\d+(?:\.\d+)?',v) else None
            slot=m['slot'].replace('(EX)',''); slot='TB1' if slot=='TB' else slot
            bid=m['beatmapId']
            entry=dict(slot=slot,beatmapId=bid,
                       **({'originalId':ORIGINAL_BEATMAP_IDS[bid]} if bid in ORIGINAL_BEATMAP_IDS else {}),
                       title=m['title'],
                       mapper=meta.get('J' if first else 'L') if full else None,
                       stars=number('F' if first else 'G') if full else None,
                       bpm=number('G' if first else 'H') if full else None,
                       drainSeconds=int(drain[1])*60+int(drain[2]) if drain else None,
                       cs=None,ar=None,od=None,source=m['source'])
            entry.update(SUPPLEMENTAL_MAP_ATTRIBUTES.get(bid,{}))
            maps.append(entry)
        a['pools'].append(dict(id=f'pool-{i+1}',name=p['sheet'],source=p['sheet'],maps=maps))
        fact('provenance',p['sheet']+' 原始 EX 標記',[m['slot'] for m in p['maps'] if '(EX)' in m['slot']],p['sheet'])
    qmaps=[]
    for m in s['coachQualifier'][0]['scores']:
        slot,bid=m['map'].split(' - '); slot=slot+'1' if slot in ['HD','HR'] else slot
        qmaps.append(dict(slot=slot,beatmapId=int(bid),title=None,mapper=None,stars=None,bpm=None,
                          drainSeconds=None,cs=None,ar=None,od=None,source='教练赛积分!F2:R2'))
    a['pools'].append(dict(id='coach-qualifier',name='教练资格赛',source='教练赛积分!F2:R2',maps=qmaps))
    a['qualifiers'].append(dict(name='教练资格赛',poolId='coach-qualifier',source='教练赛积分',records=[
        dict(username=p['name'],source=p['source'],scores=[dict(slot=qmaps[i]['slot'],score=m['score']) for i,m in enumerate(p['scores'])])
        for p in s['coachQualifier']]))
    for p in s['staffCredits']:
        a['staff'].append(dict(osuId=p['identity']['osuId'] if p['identity'] else None,
                               username=p['name'],position=p['role'],source=p['source']))
    for i,m in enumerate(s['matches']):
        a['matches'].append(dict(id=m['id'].lower(),label=f"{m['id']} · {m['teamA']} vs {m['teamB']}",
            stage='前四輪（原表順序）' if i<24 else '後續對局（原表順序）',poolId=None,
            teamA=m['teamA'].lower(),teamB=m['teamB'].lower(),scheduledAt=None,score=None,
            mpUrls=[m['mpUrl']],vodUrl=m['videoUrl'],referee=m['referee'],streamer=m['streamer'],
            commentators=m['commentary'],bansA=None,bansB=None,source=m['source']))
        fact('review',f"{m['id']} · {m['teamA']}–{m['teamB']} 原表比分／時間（待覆核）",
             {k:m[k] for k in ['id','teamA','teamB','score','dateAsStored','dateSerial','timeAsStored','timeZone','mpUrl','videoLiteral','notes','status']},m['source'])
    a['reviewTables'].append(dict(name='前24場勝敗與局數加總',note='由原表比分加總；非正式排名或種子順序，比分尚未覆核。',
        rows=[dict(teamId=r['team'].lower(),**{k:r[k] for k in ['wins','losses','mapsWon','mapsLost']}) for r in s['first24MatchTotals']['rows']]))
    fact('provenance','來源與名單優先序',dict(source=s['source'],authority=s['rosterAuthority'],differences=s['rosterDifferences']),'主辦者確認；MainSheet／選秀截圖')
    for g in s['draftScreenshot']['groups']:
        fact('provenance',f"選秀截圖 Group{g['group']}（獨立歷史快照）",g,'s5-draft-source.png')
    for sheet in dict.fromkeys(r['sheet'] for r in s['mapStatistics']):
        rows=[r for r in s['mapStatistics'] if r['sheet']==sheet]
        if rows:
            for start in range(0,len(rows),10):
                fact('provenance',sheet+f' 圖池統計 {start+1}',rows[start:start+10],sheet)
    fact('review','資格賽排名重算（非正式名次）',[
        {k:p[k] for k in ['name','cachedRank','cachedRankSum','recomputedMapRanks','recomputedRankSum','recomputedRank','source']}
        for p in s['coachQualifier']],'教练赛积分')
    for start in range(0,len(s['matchLinkReconciliation']['entries']),15):
        fact('provenance',f'MP 來源分類 {start+1}',s['matchLinkReconciliation']['entries'][start:start+15],'#288 MP 清單／对阵表')
    fact('provenance','圖池欄位衝突與缺漏','無標題 C 欄不採作 BID。季後賽 HR3 採 J16／D16 一致的 2744118，tmp I16=2428725 另存來源。Final 的跨池重複圖保留。規則只存來源連結，未套用 S6 規則。','MainSheet')
    assert len(a['players'])==70 and len(a['unresolvedPlayers'])==15
    assert len(a['matches'])==34 and all(m['score'] is None for m in a['matches'])
    assert sum(len(p['maps']) for p in a['pools'])==77
    assert len(a['sourceFacts'])<=100
    return a


if __name__ == '__main__':
    archive=build()
    OUTPUT.write_text(json.dumps(archive,ensure_ascii=False,indent=2)+'\n')
    print(f'{OUTPUT}: {len(archive["teams"])} teams, 85 members, 34 unapproved matches, 77 slots')
