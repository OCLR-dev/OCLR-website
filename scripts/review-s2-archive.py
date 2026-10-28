"""Read-only S2 review: compare saved archive, bounded Sheets reads and MP snapshots.

Inputs/outputs may contain management evidence: keep them outside the repository.
No network requests, production writes, automatic game selection or publication.
The knockout template is a review hypothesis, not an official progression claim.
"""
import argparse
import collections
import hashlib
import html
import json
import pathlib
import re
from datetime import datetime
from zoneinfo import ZoneInfo

WORKBOOK = "1lQrHwsbPb5nC-MDPbHSNkL2RFD1eEcS-LbGonEr10QY"
STAGES = ["敗者組第一輪", "敗者組第一輪", "勝者組半決賽", "勝者組半決賽",
          "敗者組第二輪", "敗者組第二輪", "勝者組決賽", "敗者組第三輪", "敗者組決賽", "總決賽"]
INPUTS = {
    5: [(4, "loser"), (1, "winner")], 6: [(3, "loser"), (2, "winner")],
    7: [(3, "winner"), (4, "winner")], 8: [(5, "winner"), (6, "winner")],
    9: [(7, "loser"), (8, "winner")], 10: [(7, "winner"), (9, "winner")],
}


def read(path):
    return json.loads(pathlib.Path(path).read_text())


def review(archive, ranges, mp_dir):
    if archive["editionSlug"] != "s2" or not re.fullmatch(
        rf"https://docs.google.com/spreadsheets/d/{WORKBOOK}(?:/edit)?", archive["sourceUrl"]
    ):
        raise ValueError("Use the recorded S2 source and edition only.")
    teams = {t["id"]: t["name"] for t in archive["teams"]}
    roster = {p["osuId"]: p["teamId"] for p in archive["players"]}
    # Organizer confirmation is recorded separately; it does not imply a play.
    roster[5084172] = "f"
    matches = {m["id"]: m for m in archive["matches"]}
    if len(matches) != 30:
        raise ValueError("Expected 30 distinct saved S2 matches.")
    raw = {}
    for sheet, prefix in [("GS Schedule", "gs"), ("ES Schedule", "es")]:
        table = ranges[sheet]
        first = int(re.search(r"[A-Z]+(\d+):", table["range"])[1])
        for row, values in enumerate(table["values"], first):
            v = list(values) + [None] * 14
            if not v[0]:
                continue
            mid = prefix + "-" + v[0].lower()
            if mid not in matches:
                raise ValueError("Unexpected source fixture: " + mid)
            if mid in raw:
                raise ValueError("Duplicate source fixture: " + mid)
            raw[mid] = dict(teamA=v[3][0].lower(), teamB=v[6][0].lower(),
                            score=[int(v[4]), int(v[5])], date=v[1], time=v[2],
                            mpText=v[11] or "", source=f"{sheet}!B{row}:M{row}")
    if set(raw) != set(matches):
        raise ValueError("Source inventory does not match the saved archive.")
    rows = []
    for mid, m in matches.items():
        r = raw[mid]
        urls = ["https://osu.ppy.sh/community/matches/" + n for n in
                re.findall(r"(?:https://osu\.ppy\.sh/(?:community/matches/|mp/)|(?<!\d)/)(\d{6,})", r["mpText"])]
        differences = [k for k in ["teamA", "teamB", "source"] if m[k] != r[k]]
        if "forfeitWinner" in m:
            if r["mpText"].strip() != "win by default" or m["forfeitWinner"] != r["score"].index(max(r["score"])):
                differences.append("forfeitWinner")
        elif m["score"] != r["score"]:
            differences.append("score")
        if m["mpUrls"] != urls:
            differences.append("mpUrls")
        room_reviews = []
        pool = next((p for p in archive["pools"] if p["id"] == m.get("poolId")), None)
        known_maps = {x["beatmapId"] for x in pool["maps"]} if pool else set()
        for i, url in enumerate(m["mpUrls"]):
            path = mp_dir / (mid + (f"-{i+1}" if i else "") + "-mp.json")
            if not path.exists():
                room_reviews.append(dict(url=url, status="無可讀快照；待重試", games=[]))
                continue
            data = read(path)
            if data["match"]["id"] != int(url.rsplit("/", 1)[1]):
                raise ValueError("MP identity mismatch: " + str(path))
            events = data["events"]
            complete = (bool(events) and min(e["id"] for e in events) == data["first_event_id"]
                        and max(e["id"] for e in events) == data["latest_event_id"]
                        and data["match"].get("end_time") is not None
                        and data.get("current_game_id") is None)
            games, counts = [], collections.Counter()
            seen = set()
            for event in events:
                g = event.get("game")
                if not g or g["id"] in seen:
                    continue
                seen.add(g["id"])
                scores = g["scores"]
                total = lambda s: s.get("legacy_total_score", s.get("score", s.get("total_score")))
                positive = [s for s in scores if isinstance(total(s), (int, float)) and total(s) > 0]
                flags = []
                if g["beatmap_id"] not in known_maps:
                    flags.append("圖池外／缺失圖池證據")
                if not positive:
                    flags.append("無正分結算／中止待核對")
                if any(roster.get(s["user_id"]) not in [m["teamA"], m["teamB"]] for s in scores):
                    flags.append("名單外身分／佔位待審閱")
                if any(total(s) == 0 for s in scores):
                    flags.append("零分記錄；不得自動排除")
                colors = collections.defaultdict(set)
                totals = collections.Counter()
                for s in positive:
                    color = s.get("match", {}).get("team")
                    colors[color].add(roster.get(s["user_id"]))
                    totals[roster.get(s["user_id"]) or "unknown"] += total(s)
                if (len(colors) != 2 or any(len(v) != 1 for v in colors.values())
                        or set().union(*colors.values()) != {m["teamA"], m["teamB"]}):
                    flags.append("正分紅藍與名單無法唯一對應")
                fail = []
                for team in [m["teamA"], m["teamB"]]:
                    records = [s for s in positive if roster.get(s["user_id"]) == team]
                    if records and all(s.get("passed") is False for s in records):
                        fail.append(team)
                if fail:
                    flags.append("全員 fail 候選；須依 S2 teamfail 規則審閱")
                winner = None
                if not flags or all(f.startswith("零分") for f in flags):
                    a, b = totals[m["teamA"]], totals[m["teamB"]]
                    if a != b:
                        winner = m["teamA"] if a > b else m["teamB"]
                        counts[winner] += 1
                games.append(dict(gameId=g["id"], beatmapId=g["beatmap_id"],
                                  candidateWinner=winner, flags=flags,
                                  positiveRecords=len(positive)))
            repeats = [bid for bid, count in collections.Counter(g["beatmapId"] for g in games).items() if count > 1]
            room_reviews.append(dict(url=url, complete=complete, status="快照完整" if complete else "快照不完整",
                                     tentativeScore=[counts[m["teamA"]], counts[m["teamB"]]],
                                     repeatedBeatmaps=repeats, games=games,
                                     sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        rows.append(dict(id=mid, teams=[teams[m["teamA"]], teams[m["teamB"]]],
                         source=r["source"], savedStage=m["stage"], sourceScore=r["score"],
                         savedScore=m["score"], forfeitWinner=m.get("forfeitWinner"),
                         differences=differences, sourceDate=r["date"], sourceTime=r["time"],
                         savedScheduledAt=m["scheduledAt"], mp=room_reviews,
                         status="來源一致" if not differences else "衝突"))
    groups = []
    for group in ["a", "b"]:
        table = collections.defaultdict(lambda: dict(points=0, wins=0, draws=0, losses=0))
        for mid, m in raw.items():
            if not mid.startswith("gs-" + group):
                continue
            score = m["score"]
            outcome = m["score"].index(max(m["score"])) if m["mpText"].strip() == "win by default" else None
            if outcome is None:
                outcome = None if score[0] == score[1] else int(score[1] > score[0])
            for side, team in enumerate([m["teamA"], m["teamB"]]):
                k = "draws" if outcome is None else "wins" if side == outcome else "losses"
                table[team][k] += 1
                table[team]["points"] += 1 if outcome is None else 2 if side == outcome else 0
        ordered = sorted(table, key=lambda t: -table[t]["points"])
        if len(ordered) != 5 or len({table[t]["points"] for t in ordered}) != 5:
            raise ValueError("Missing matches or tied group points: require separate tie-break evidence.")
        groups.append(dict(group=group.upper(), rows=[dict(teamId=t, team=teams[t], rank=i+1, **table[t]) for i, t in enumerate(ordered)]))
    edges, knockout = [], []
    for i in range(1, 11):
        m = matches[f"es-a{i}"]
        for origin, kind in INPUTS.get(i, []):
            before = matches[f"es-a{origin}"]
            w = int(before["score"][1] > before["score"][0])
            t = [before["teamA"], before["teamB"]][w if kind == "winner" else 1-w]
            edges.append(dict(origin=before["id"], outcome=kind, target=m["id"], team=teams[t],
                              matchesRecordedTeams=t in [m["teamA"], m["teamB"]], accepted=False))
        knockout.append(dict(id=m["id"], proposedStage=STAGES[i-1], teams=[teams[m["teamA"]], teams[m["teamB"]]],
                             score=m["score"], accepted=False))
    seed_ranks = {r["teamId"]: r["rank"] for g in groups for r in g["rows"]}
    seeds = [dict(id=f"es-a{i}", expectedEntry="敗者組" if i <= 2 else "勝者組",
                  ranks=[seed_ranks[matches[f"es-a{i}"][t]] for t in ["teamA", "teamB"]]) for i in range(1, 5)]
    return dict(status="待主辦方審閱；未修改正式資料", generatedAt=datetime.now(ZoneInfo("Asia/Taipei")).isoformat(), matches=rows, groups=groups,
                knockout=knockout, candidateEdges=edges, seeds=seeds,
                summary=dict(matches=len(rows), sourceMatches=sum(not r["differences"] for r in rows),
                             mpLinks=sum(len(r["mp"]) for r in rows),
                             readableMp=sum("complete" in mp for r in rows for mp in r["mp"]),
                             completeMp=sum(mp.get("complete", False) for r in rows for mp in r["mp"]),
                             candidateEdges=len(edges), matchingCandidateEdges=sum(e['matchesRecordedTeams'] for e in edges),
                             draws=sum(m["score"] is not None and m["score"][0] == m["score"][1] for m in matches.values()),
                             missingMp=[r["id"] for r in rows if not r["mp"] and r["forfeitWinner"] is None]))


def bracket_svg(report):
    esc = lambda v: html.escape(str(v))
    positions = {1:(20,340),2:(20,500),3:(20,20),4:(20,180),5:(340,340),6:(340,500),7:(340,20),8:(660,420),9:(980,220),10:(1300,20)}
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="660" viewBox="0 0 1600 660"><rect width="1600" height="660" fill="#fcfcff"/><g font-family="system-ui,sans-serif" font-size="13">'
    for e in report['candidateEdges']:
        a=int(e['origin'].split('a')[-1]);b=int(e['target'].split('a')[-1])
        x,y=positions[a];tx,ty=positions[b];x+=270;y+=55;ty+=55
        color='#6850a1' if e['outcome']=='winner' else '#8c5b26'
        svg += f'<path d="M{x},{y} C{x+24},{y} {tx-24},{ty} {tx},{ty}" fill="none" stroke="{color}" stroke-width="2" stroke-dasharray="5 4"><title>{esc(e["origin"]+" "+e["outcome"]+" → "+e["target"]+" · "+e["team"])}</title></path>'
    for m in report['knockout']:
        n=int(m['id'].split('a')[-1]);x,y=positions[n]
        svg+=f'<g transform="translate({x},{y})"><rect width="270" height="110" rx="6" fill="#f0edf8" stroke="#aea4c6"/>'
        for dy,text in [(22,m['id']+' · '+m['proposedStage']),(48,m['teams'][0]+'  '+str(m['score'][0])),(72,m['teams'][1]+'  '+str(m['score'][1])),(96,'日期缺失；保留未知' if n==10 else '候選輪次／去向；待主辦方審閱')]:
            svg+=f'<text x="12" y="{dy}" fill="#25202e">{esc(text)}</text>'
        svg+='</g>'
    return svg+'<text x="980" y="625">全部連線為待審閱候選：紫色＝勝者，棕色＝敗者。</text></g></svg>'


def render(report):
    esc = lambda v: html.escape(str(v))
    def table(headers, rows):
        return '<div class="scroll"><table><thead><tr>' + ''.join('<th>'+esc(h)+'</th>' for h in headers) + '</tr></thead><tbody>' + ''.join('<tr>'+''.join('<td>'+esc(v)+'</td>' for v in row)+'</tr>' for row in rows) + '</tbody></table></div>'
    s = report["summary"]
    content = '<h1>OCLR S2 核對審閱稿</h1><p>'+esc(report['generatedAt'])+' · #365 · '+esc(report["status"])+'</p>'
    content += '<p>核對管理頁保存值與 MainSheet 範圍快照：'+str(s['sourceMatches'])+'/30 場一致。六場平局保留；棄權判給分不算實打圖數。MP 使用 #285 的 2026-10-26 留存快照，並非本輪重新下載；不把隊名、原始正分加總或同圖最後一次結算當作正式判決。</p>'
    content += '<p>規則依據：主辦方提供 S2 PDF「总体规则」第 1–4 條（3v3、teamfail、兩組 BO8、勝2／平1／負0、分組晉級、雙敗 BO11、總決賽無 reset）。原檔 public/archive/s2/rules.pdf，SHA-256：35319dd1aa0bbf030ff9b5e318045c55d12ef16feaa1c5066db34ad83dc6753e。候選配對模板須另經主辦方接受。</p>'
    content += '<h2>請審閱</h2><ol><li>是否接受下列小組排名及候選淘汰賽輪次／12 條去向？它們符合現存隊伍與賽果，但原表沒有完整正式晉級槽位證據。</li><li>是否採用原表行序展示缺日期的 A10？其日期仍保持空缺，不補成 7/20。</li><li>重賽、中止、NF 佔位與 teamfail 判決逐盤審閱後，才選擇統計盤並明確批准發布。</li></ol>'
    for g in report["groups"]:
        content += '<h2>小組 '+g['group']+'（勝2／平1／負0）</h2>' + table(['名次','隊伍','勝','平','負','積分','候選入口'], [[r['rank'],r['team'],r['wins'],r['draws'],r['losses'],r['points'],'勝者組' if r['rank']<=2 else '敗者組' if r['rank']<=4 else '淘汰'] for r in g['rows']])
    content += '<h2>淘汰賽候選圖（尚未接受）</h2><p>所有連線為候選，非正式發布。12 條去向中 '+str(s['matchingCandidateEdges'])+' 條與現存雙方一致。</p><div class="scroll">'+bracket_svg(report)+'</div>' + table(['場次','候選輪次','雙方','原表比分','候選來源'], [[m['id'],m['proposedStage'],' / '.join(m['teams']),':'.join(map(str,m['score'])),'；'.join(e['origin']+(' 勝者' if e['outcome']=='winner' else '敗者') for e in report['candidateEdges'] if e['target']==m['id']) or '小組排名入口'] for m in report['knockout']])
    content += '<h2>30 場逐場核對</h2>' + table(['場次','隊伍','原表比分','保存結果','來源定位','核對','MP 快照','缺漏'], [[r['id'],' / '.join(r['teams']),':'.join(map(str,r['sourceScore'])),('棄權勝' if r['forfeitWinner'] is not None else ':'.join(map(str,r['savedScore']))),r['source'],r['status']+(' '+','.join(r['differences']) if r['differences'] else ''),'；'.join(mp['url'].rsplit('/',1)[1]+' '+mp['status'] for mp in r['mp']) or '無 MP',('原表日期空缺；' if not r['sourceDate'] else '')+('原表時間空缺' if not str(r['sourceTime'] or '').strip() else '')] for r in report['matches']])
    content += '<h2>MP 統計審閱項</h2><p>'+str(s['readableMp'])+'/'+str(s['mpLinks'])+' 個房間有快照；完整事件邊界 '+str(s['completeMp'])+'。七場無 MP 的淘汰賽仍屬未覆蓋。完整快照不代表可自動發布。</p>'
    for r in report['matches']:
        for mp in r['mp']:
            if 'complete' not in mp:
                continue
            content += '<details><summary>'+esc(r['id']+' · '+mp['url'])+'</summary><p>同圖重複：'+esc(mp['repeatedBeatmaps'])+'。逐盤僅為審閱線索，不自動選盤或排除人員。</p>'+table(['Game ID','Beatmap ID','正分筆數','保守正分勝隊候選','待審閱'],[[g['gameId'],g['beatmapId'],g['positiveRecords'],g['candidateWinner'] or '未知','；'.join(g['flags']) or '仍須核對暖場／重賽與正式選盤'] for g in mp['games']])+'</details>'
    content += '<h2>身分與正式操作</h2><p>主辦方已確認 S2 未關聯教練 PurePeace → UID 5084172（TEAM!G26）。本稿沒有修改正式名單或授予任何權限。新管理操作只移動這一筆未知身分並保留來源與審計；需要相容版本部署後由既有管理頁保存。</p><p>原表、規則、正式賽果、統計發布各自保留驗收狀態；此管理審閱稿不應上傳到公開 issue 或提交為測試資料。</p>'
    return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OCLR S2 核對審閱稿</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#20212b;background:#fcfcff}h1{font-size:32px}h2{margin-top:40px;font-size:22px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid #d9dbe5}th{background:#eeedf7}.scroll{overflow:auto}details{padding:12px 0;border-bottom:1px solid #d9dbe5}summary{cursor:pointer;font-weight:650}li{margin:10px 0}</style><main>'+content+'</main></html>'


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--ranges", required=True)
    parser.add_argument("--mp-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    result = review(read(args.archive), read(args.ranges), args.mp_dir)
    result['inputSha256'] = {pathlib.Path(p).name: hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in [args.archive, args.ranges]}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/'s2-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    (args.output/'s2-review.html').write_text(render(result))
    (args.output/'s2-bracket.svg').write_text(bracket_svg(result))
    print(json.dumps(result['summary'], ensure_ascii=False))
