"""Read-only, allowlisted extraction of the organizer-supplied S10 XLSX.

No network/database calls. Reg and Reg List are deliberately excluded.
Uses cached export values; never recalculates external Google formulas.
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
ORIGINAL_BEATMAP_IDS = {5015295: 4000824, 5036455: 4934310, 4052151: 3678140, 5033877: 1571394, 3668376: 3668377, 3500303: 1509453}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source")
parser.add_argument("output")
parser.add_argument("--captured-on", required=True, type=dt.date.fromisoformat)
parser.add_argument("--pool-conflicts", choices=["stages"], required=True, help="Organizer-approved independent stage worksheet priority")
args = parser.parse_args()
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
rid = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
with zipfile.ZipFile(args.source) as z:
    strings = ["".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    rels = {x.get("Id"): x.get("Target") for x in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    allowed = {"Team", "Draft", "Schedule", "GroupScore", "Staff", "Stats", "Landing", "Mappools", "Group stage mappool"}
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


def number(sheet, cell):
    v = value(sheet, cell)
    return float(v) if v is not None else None

def normalized_name(name):
    # Cached Sheets numeric usernames serialize as 9898.0; Team is literal.
    name = re.sub(r"^(\d+)\.0$", r"\1", name).casefold()
    # Source rename: all eight tier positions and captain corroborate Team D.
    return "koutya_" if name == "koutya" else name

def optional(sheet, cell):
    v = value(sheet, cell)
    return None if v is None or not v.strip(" \\") else v

teams, players, picks, standings, matches, pools, staff = [], [], [], [], [], [], []
# Team rows are not in Draft letter order. Match the captain first, then assert
# every final roster tier against the independent Draft summary and actual pick.
for row in range(9, 28, 2):
    captain = identity("Team", f"K{row}")
    draft_rows = [r for r in range(14, 24) if normalized_name(value("Draft", f"C{r}")) == normalized_name(captain["username"])]
    assert len(draft_rows) == 1, (row, "Ambiguous captain")
    draft_row = draft_rows[0]
    team_id = value("Draft", f"B{draft_row}").lower().replace(" ", "-")
    teams.append({"id": team_id, "name": value("Team", f"G{row}"), "source": f"Team!G{row}:AU{row}; Draft!B{draft_row}:J{draft_row}"})
    for tier, col in enumerate(["K", "P", "U", "Z", "AE", "AJ", "AO", "AT"]):
        ident = identity("Team", f"{col}{row}")
        assert normalized_name(ident["username"]) == normalized_name(value("Draft", f"{chr(67+tier)}{draft_row}")), (row, tier, "Roster mismatch")
        players.append({**ident, "teamId": team_id, "role": "captain" if tier == 0 else "player", "tier": tier, "source": f"Team!{col}{row}"})
for round_, (tc, pc) in enumerate(zip(["B", "D", "F", "H", "J", "L", "N"], ["C", "E", "G", "I", "K", "M", "O"]), 1):
    for row in range(2, 12):
        team_id = value("Draft", f"{tc}{row}").lower().replace(" ", "-")
        player = next(p for p in players if p["teamId"] == team_id and p["tier"] == round_)
        assert normalized_name(player["username"]) == normalized_name(value("Draft", f"{pc}{row}")), (round_, row, "Pick mismatch")
        picks.append({"round": round_, "pick": row-1, "teamId": team_id, "osuId": player["osuId"], "source": f"Draft!{tc}{row}:{pc}{row}; {player['source']}"})
team_ids = {t["name"]: t["id"] for t in teams}
for row in range(6, 16):
    standings.append({"group": "A" if row < 11 else "B", "teamId": team_ids[value("GroupScore", f"F{row}")], **{k: int(number("GroupScore", f"{c}{row}")) for k,c in [("rank","E"),("wins","G"),("losses","H"),("mapsWon","I"),("mapsLost","J")]}, "source": f"GroupScore!D{row}:J{row}"})
stage = None
for row in range(7, 43):
    stage = value("Schedule", f"D{row}") or stage
    label = value("Schedule", f"E{row}")
    a, b = number("Schedule", f"L{row}"), number("Schedule", f"M{row}")
    assert (a is None) == (b is None)
    serial = number("Schedule", f"F{row}") + number("Schedule", f"G{row}")
    timestamp = dt.datetime(1899,12,30,tzinfo=dt.timezone(dt.timedelta(hours=8))) + dt.timedelta(seconds=round(serial*86400))
    vod = optional("Schedule", f"O{row}")
    assert not vod or re.fullmatch(r"BV[0-9A-Za-z]+", vod) or re.fullmatch(r"https://b23.tv/[0-9A-Za-z]+", vod)
    mp = link("Schedule", f"N{row}")
    assert (mp is not None) == (a is not None)
    matches.append({"id": "match-"+label.lower(), "label": label, "stage": stage, "teamA": team_ids[value("Schedule", f"J{row}")], "teamB": team_ids[value("Schedule", f"K{row}")], "scheduledAt": timestamp.isoformat(), "score": [int(a),int(b)] if a is not None else None, "mpUrls": [mp] if mp else [], "vodUrl": f"https://www.bilibili.com/video/{vod}/" if vod and vod.startswith("BV") else vod, **{k:optional("Schedule",f"{c}{row}") for k,c in [("referee","H"),("streamer","I"),("commentators","R"),("bansA","P"),("bansB","Q")]}, "source": f"Schedule!D{row}:R{row}"})
for s in standings:
    scored = [m for m in matches if m["stage"] == "Group "+s["group"] and s["teamId"] in [m["teamA"],m["teamB"]] ]
    assert len(scored) == 4 and all(m["score"] is not None for m in scored)
    scores = [m["score"] if m["teamA"] == s["teamId"] else list(reversed(m["score"])) for m in scored]
    assert [sum(a>b for a,b in scores),sum(a<b for a,b in scores),sum(a for a,b in scores),sum(b for a,b in scores)] == [s[k] for k in ["wins","losses","mapsWon","mapsLost"]], s
conflicts = []
for pool_id, heading, first, last in [("gs1",113,117,135),("gs2",87,91,109),("sf",60,64,82),("f",32,36,55),("gf",4,8,27)]:
    maps = []
    for row in range(first,last+1):
        m = {"slot":value("Mappools", f"D{row}"), "source":f"Mappools!D{row}:Q{row}"}
        for key,col in [("beatmapId","J"),("title","G"),("mapper","H"),("stars","K"),("bpm","L"),("drainSeconds","M"),("cs","O"),("ar","P"),("od","Q")]:
            v = value("Mappools",f"{col}{row}")
            m[key] = (int(float(v)) if key == "beatmapId" else round(float(v)*86400,6) if key == "drainSeconds" else float(v)) if key not in ["title","mapper"] and v is not None else v
        if pool_id == "gs1":
            ir = row-first+4
            sheet = "Group stage mappool"
            assert m["slot"] == value(sheet,f"B{ir}") and m["beatmapId"] == int(number(sheet,f"L{ir}"))
            # Independent stage sheet wins, consistent with organizer's S9 policy.
            m["title"] = value(sheet,f"D{ir}")
            assert m["title"].endswith(f"({m['mapper']})"), (row, "Mapper mismatch")
            m["source"] = f"{sheet}!B{ir}:N{ir}; Mappools!D{row}:Q{row}"
            for key,col in [("stars","E"),("bpm","F"),("drainSeconds","G"),("cs","I"),("ar","J"),("od","K")]:
                v = number(sheet,f"{col}{ir}")
                if key == "drainSeconds" and v is not None: v = round(v*86400,6)
                if v is not None and m[key] is not None and not math.isclose(v,m[key],abs_tol=1e-6,rel_tol=1e-8):
                    conflicts.append({"slot":m["slot"],"field":key,"stage":v,"combined":m[key]})
                m[key] = v
        if m["beatmapId"] in ORIGINAL_BEATMAP_IDS:
            m["originalId"] = ORIGINAL_BEATMAP_IDS[m["beatmapId"]]
        maps.append(m)
    # Organizer-approved #261: the pool name excludes the Bo/Ban heading suffix.
    name = value("Mappools",f"D{heading}").split("//", 1)[0].strip()
    assert name, (pool_id, "Missing pool name before //")
    pools.append({"id":pool_id,"name":name,"source":f"Mappools!D{heading}:Q{last}","maps":maps})
for row in range(2,17):
    staff.append({**identity("Staff",f"B{row}"),"position":value("Staff",f"C{row}"),"source":f"Staff!B{row}:C{row}"})
links = [{"label":value("Landing",f"O{row}"),"url":link("Landing",f"O{row}")} for row in [6,10,14]]
links += [{"label":value("Stats",f"C{row}"),"url":link("Stats",f"C{row}")} for row in [3,5,7,9,11]]
data = {"formatVersion":1,"editionSlug":"s10","sourceUrl":"https://docs.google.com/spreadsheets/d/12BGS8WRnl10OdeUKyvmOypFzpTYCpHgx9QY1mw-0hlw/edit","capturedOn":args.captured_on.isoformat(),"notes":[
    "主辦方提供的 S10 歷史試算表：10 隊、80 名隊員（含 10 名 Captain）、70 筆選秀、15 名工作人員、5 組圖池共 97 個位置。沒有教練或自由選手名單。",
    "實際賽程為 2025-03-14 至 2025-05-10，時間採原表 UTC+8。30 場有比分與 MP 連結；28a–28d、30a–30b 為無比分的備用排期，公開頁隱藏。零分保留為有效比分。",
    "隊伍表順序不同於選秀隊伍字母，以 Captain 對照後逐一核對七輪隊員。koutya／koutya_、大小寫與數字名稱的 .0 差異以 Team 的 osu! ID 及原名為準。",
    "沿用主辦方指定的獨立圖池表優先原則：Group Stage 1 使用 Group stage mappool，其他四階段使用 Mappools。第一階段星數和部分 CS／AR／OD 與總表不同，不混用總表屬性。圖池保留歷史值，不查詢即時 API 覆蓋。",
    "Reg／Reg List、報名答案、聯絡方式及個人評語不匯入；工作人員僅作歷史署名，不建立帳號或授權。逐圖統計保留連結，不推定獎項。",
    "S10 規則書保留原文與插圖；舊 S8 群名、重複編號、選秀次序及熱手敘述不自行修訂。選秀結果按實際 Draft 記錄，不按規則文字重建。",
],"links":links,"teams":teams,"players":players,"picks":picks,"staff":staff,"standings":standings,"matches":matches,"pools":pools}
assert len(teams)==10 and len(players)==80 and len(picks)==70 and len(staff)==15
assert len({p['osuId'] for p in players})==80 and len({t['id'] for t in teams})==10
assert sum(m['score'] is not None for m in matches)==30 and len(matches)==36
assert sum(len(p['maps']) for p in pools)==97
Path(args.output).parent.mkdir(parents=True,exist_ok=True)
Path(args.output).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
print(json.dumps({"teams":10,"identities":80,"picks":70,"staff":15,"results":30,"unplayedAlternatives":6,"poolSlots":97,"stageOverrides":conflicts},ensure_ascii=False))
