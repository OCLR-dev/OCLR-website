"""Read-only extraction of the organizer-supplied S9 XLSX. No network or DB writes.

Usage: python3 scripts/prepare-s9-archive.py source.xlsx output.json --captured-on YYYY-MM-DD
Only explicit public-competition columns are extracted. Never copy raw workbook cells.
"""
import argparse
import datetime as dt
import json
import math
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

# Reviewed edit-to-original provenance; retained across worksheet regeneration.
ORIGINAL_BEATMAP_IDS = {3523843: 2691208, 4400095: 3129616, 3493389: 1911962}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
parser.add_argument("--captured-on", required=True, type=dt.date.fromisoformat)
parser.add_argument("--pool-conflicts", choices=["unresolved", "stages", "all"], default="unresolved")
args = parser.parse_args()
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
rid = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
with zipfile.ZipFile(args.source) as z:
    strings = ["".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    rels = {x.get("Id"): x.get("Target") for x in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    allowed = {"Team", "Draft", "Schedule", "GroupScore", "Staff", "Stats", "Landing", "All Mappools", "GS Mappool", "SF Mappool", "F Mappool", "GF Mappool"}
    for sheet in ET.fromstring(z.read("xl/workbook.xml")).find("s:sheets", ns):
        if sheet.get("name") not in allowed:
            continue
        path = posixpath.normpath("xl/" + rels[sheet.get(rid)])
        root = ET.fromstring(z.read(path))
        cells = {}
        for c in root.findall(".//s:sheetData/s:row/s:c", ns):
            raw = c.find("s:v", ns)
            if raw is None:
                continue
            value = raw.text
            if c.get("t") == "s" and value is not None:
                value = strings[int(value)]
            cells[c.get("r")] = {"v": value}
        linkpath = posixpath.dirname(path) + "/_rels/" + posixpath.basename(path) + ".rels"
        links = {x.get("Id"): x.get("Target") for x in ET.fromstring(z.read(linkpath))} if linkpath in z.namelist() else {}
        for h in root.findall(".//s:hyperlink", ns):
            cells.setdefault(h.get("ref"), {})["link"] = links.get(h.get(rid), h.get("location"))
        sheets[sheet.get("name")] = cells

def value(sheet, cell):
    v = sheets[sheet].get(cell, {}).get("v")
    return v if v and not v.startswith(("#REF!", "#N/A", "#DIV/0!")) else None

def link(sheet, cell):
    return sheets[sheet].get(cell, {}).get("link")

def identity(sheet, cell):
    url = link(sheet, cell)
    match = re.fullmatch(r"https://osu.ppy.sh/users/([1-9]\d*)(?:/osu)?", url or "")
    assert match and value(sheet, cell), (sheet, cell, "Missing identity")
    return {"osuId": int(match[1]), "username": value(sheet, cell)}

teams, players, picks, standings, matches, pools, staff = [], [], [], [], [], [], []
for index, row in enumerate(range(9, 24, 2)):
    team_id = "team-" + chr(97 + index)
    teams.append({"id": team_id, "name": value("Team", f"G{row}"), "source": f"Team!G{row}:AZ{row}"})
    for tier, col in enumerate(["K", "P", "U", "Z", "AE", "AJ", "AO", "AT", "AY"]):
        players.append({**identity("Team", f"{col}{row}"), "teamId": team_id, "role": "captain" if tier == 0 else "coach" if tier == 8 else "player", "tier": None if tier == 8 else tier, "source": f"Team!{col}{row}"})
for row in range(2, 6):
    players.append({**identity("Draft", f"R{row}"), "teamId": None, "role": "free_agent", "tier": None, "source": f"Draft!R{row}"})
for round_, (tc, pc) in enumerate(zip(["B", "D", "F", "H", "J", "L", "N"], ["C", "E", "G", "I", "K", "M", "O"]), 1):
    for row in range(2, 10):
        team_id = value("Draft", f"{tc}{row}").lower().replace(" ", "-")
        ident = identity("Draft", f"{pc}{row}")
        player = next(p for p in players if p["osuId"] == ident["osuId"])
        assert player["teamId"] == team_id and player["tier"] == round_
        picks.append({"round": round_, "pick": row - 1, "teamId": team_id, "osuId": ident["osuId"], "source": f"Draft!{tc}{row}:{pc}{row}"})
team_ids = {t["name"]: t["id"] for t in teams}
for row in range(6, 14):
    standings.append({"group": "A" if row < 10 else "B", "teamId": team_ids[value("GroupScore", f"G{row}")], **{k: int(float(value("GroupScore", f"{col}{row}"))) for k,col in [("rank","E"),("wins","H"),("losses","I"),("mapsWon","J"),("mapsLost","K")]}, "source": f"GroupScore!D{row}:L{row}"})
stage = None
for row in range(7, 35):
    stage = value("Schedule", f"D{row}") or stage
    label = value("Schedule", f"E{row}")
    a, b = value("Schedule", f"L{row}"), value("Schedule", f"M{row}")
    assert (a is None) == (b is None)
    serial = float(value("Schedule", f"F{row}")) + float(value("Schedule", f"G{row}"))
    timestamp = dt.datetime(1899, 12, 30, tzinfo=dt.timezone(dt.timedelta(hours=8))) + dt.timedelta(seconds=round(serial * 86400))
    vod = value("Schedule", f"O{row}")
    assert not vod or re.fullmatch(r"BV[0-9A-Za-z]+", vod)
    mp = link("Schedule", f"N{row}")
    matches.append({"id": "match-" + label.lower(), "label": label, "stage": stage, "teamA": team_ids[value("Schedule", f"J{row}")], "teamB": team_ids[value("Schedule", f"K{row}")], "scheduledAt": timestamp.isoformat(), "score": [int(a),int(b)] if a is not None else None, "mpUrls": [mp] if mp else [], "vodUrl": f"https://www.bilibili.com/video/{vod}/" if vod else None, **{k:value("Schedule", f"{c}{row}") for k,c in [("referee","H"),("streamer","I"),("commentators","R"),("bansA","P"),("bansB","Q")]}, "source": f"Schedule!D{row}:R{row}"})
# Independently reconcile standings with the 12 scored group fixtures.
for s in standings:
    played = [m for m in matches if m["stage"] == "Group " + s["group"] and s["teamId"] in [m["teamA"],m["teamB"]] ]
    scores = [m["score"] if m["teamA"] == s["teamId"] else list(reversed(m["score"])) for m in played]
    assert [sum(a>b for a,b in scores),sum(a<b for a,b in scores),sum(a for a,b in scores),sum(b for a,b in scores)] == [s[k] for k in ["wins","losses","mapsWon","mapsLost"]]
conflicts = []
for i, (sheet, pool_id) in enumerate([("GS Mappool","gs"),("SF Mappool","sf"),("F Mappool","f"),("GF Mappool","gf")]):
    maps = []
    for row in range(8,27):
        m = {"slot": value(sheet, f"D{row}"), "source": f"{sheet}!D{row}:S{row}"}
        for key, col in [("beatmapId","J"),("title","G"),("mapper","H"),("stars","K"),("bpm","L"),("drainSeconds","M"),("cs","O"),("ar","P"),("od","Q")]:
            v, other = value(sheet, f"{col}{row}"), value("All Mappools", f"{col}{row+i*26}")
            numeric = key not in ["title","mapper"]
            same = (v == other) or (numeric and v is not None and other is not None and math.isclose(float(v),float(other),rel_tol=1e-8,abs_tol=1e-8))
            if not same:
                conflicts.append(f"{sheet}!{col}{row} / All Mappools!{col}{row+i*26}: {v} / {other}")
                if args.pool_conflicts == "unresolved": v = None
                elif args.pool_conflicts == "all": v = other
                m["source"] = f"{sheet}!D{row}:S{row}; All Mappools!D{row+i*26}:S{row+i*26}"
            m[key] = (int(float(v)) if key == "beatmapId" else round(float(v)*86400,6) if key == "drainSeconds" else float(v)) if numeric and v is not None else v
        if m["beatmapId"] in ORIGINAL_BEATMAP_IDS:
            m["originalId"] = ORIGINAL_BEATMAP_IDS[m["beatmapId"]]
        maps.append(m)
    pools.append({"id": pool_id, "name": value(sheet,"D4"), "source": f"{sheet}!D7:S26", "maps": maps})
for row in range(2,21):
    staff.append({**identity("Staff", f"B{row}"), "position": value("Staff",f"C{row}"), "source":f"Staff!B{row}:C{row}"})
links = [{"label": value("Landing", f"O{row}"),"url":link("Landing", f"O{row}")} for row in [8,10,14]]
links += [{"label": value("Stats", f"C{row}"),"url":link("Stats", f"C{row}")} for row in [3,5,7,9]]
data = {"formatVersion":1,"editionSlug":"s9","sourceUrl":"https://docs.google.com/spreadsheets/d/11PwNlEsUFb6f3VCY2-sdGlPysP0ukihN8_lE4DGuzfA/edit","capturedOn":args.captured_on.isoformat(),"notes":[
    "資料來源為主辦方提供的 S9 歷史試算表快照，賽程日期為 2023-11-04 至 2023-12-10，原表時間為 UTC+8。",
    "收錄 8 隊、64 名隊員（含 8 名 Captain）、8 名教練、4 名自由選手、56 筆選秀、19 名工作人員及 4 個圖池的 76 個位置。名稱保留各來源表的歷史寫法。",
    "22 場對局有原表比分及 MP 連結。20A、20B、20C、20D、22A、22B 只有排期，是否進行及結果未確認，不計入已完成賽果。",
    "Reg List 原始名單有 92 筆、篩選後顯示 68 筆；此歸檔只從 Team 與 Draft 的明確名單收錄身分，不將原始報名名單推定為已通過報名。",
    "個人聯絡方式、報名答案、評語、選秀預測、聊天工作表及失效圖片公式均未匯入。工作人員職位只作歷史展示，不授予網站權限。",
    "MRA、逐圖統計及賽事規則保留來源連結，尚未匯入逐圖成績或重算獎項。Weekly Awards 的結果存在失效引用，未據此推定獲獎者。",
    "圖池屬性保留當年來源值，可能已包含 Mod 效果；不作目前 API 屬性或即時星數。Drain 單位為秒。",
    ("獨立圖池與總表存在衝突，GS TB1 的 ID、製圖者及相異屬性，以及 SF NM6／GF NM1 的星數暫留空，等待主辦方核對。" if args.pool_conflicts == "unresolved" else "圖池衝突依主辦方指定採用" + ("各階段獨立表。" if args.pool_conflicts == "stages" else "All Mappools 總表。")),
],"links":links,"teams":teams,"players":players,"picks":picks,"staff":staff,"standings":standings,"matches":matches,"pools":pools}
assert len(teams)==8 and len(players)==76 and len(picks)==56 and sum(m["score"] is not None for m in matches)==22
assert len({p['osuId'] for p in players}) == len(players)
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
Path(args.output).write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n")
print(json.dumps({"teams":len(teams),"identities":len(players),"results":22,"unconfirmed":6,"poolSlots":76,"poolConflictPolicy":args.pool_conflicts,"conflicts":conflicts},ensure_ascii=False))
