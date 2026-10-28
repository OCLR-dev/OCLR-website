#!/usr/bin/env python3
"""Build a private-review import package from the public competition allowlist.

No network, workbook-wide reads, database operations, or historical approvals.
The separate source-review artifacts remain immutable evidence, not import files.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORTS = ROOT / "docs/imports"

# Provenance for archived edits whose original beatmap is known. The edit stays
# in beatmapId; originalId points at the map players can open separately.
ORIGINAL_BEATMAP_IDS = {1933040: 1863199}


def archived_map(m):
    entry = {}
    for key in ["slot", "beatmapId", "title", "mapper", "stars", "bpm", "drainSeconds", "cs", "ar", "od", "source"]:
        entry[key] = m[key]
        if key == "beatmapId" and m[key] in ORIGINAL_BEATMAP_IDS:
            entry["originalId"] = ORIGINAL_BEATMAP_IDS[m[key]]
    return entry


def load(name):
    return json.loads((IMPORTS / name).read_text())


def build():
    s = load("s6-source-records.json")
    r = load("s6-match-reconstruction.json")
    a = dict(
        formatVersion=2, editionSlug="s6", sourceUrl=s["sourceUrl"],
        capturedOn=s["capturedOn"], draftMode="final-tiers",
        teams=[], players=[], unresolvedPlayers=[], rosterReplacements=[],
        picks=[], staff=[], standings=[], matches=[], pools=[], qualifiers=[],
        reviewTables=[], sourceFacts=[],
        notes=[
            "S6 私人覆核草稿：所有重建比分尚未批准，正式排名留空。",
            "D–I 暫按 3:5，最後 TB 暫列賽後娛樂；原始整房 3:6 保留，待確認。",
            "C–F 實打 2:5；HD2 可能缺失 F 勝點、實際可能為 2:6，待確認，不補造勝點。",
            "未知 UID、VICE、無日期替換歷史及未知譜面標題保留原始狀態。",
            "資格賽只保存原始單圖分數；空白不是零，快取 RANK/SUM 不是正式排名。隱藏表來源尚未授權公開。",
            "四輪瑞士輪而非兩組循環；G–J 勝者決賽只有結構推導，不建立虛構對局。",
            "比賽時間以 UTC+8 顯示。scheduledAt 僅使用工作簿排程；MP 開房時間另存 review.startedAt。",
        ],
        links=[
            {"label": "S6 圖池來源（S6GS／S6ES／S6FS）", "url": s["supplementalPoolSource"]["sourceUrl"]},
            {"label": "S6 規則", "url": r["ruleSource"]["sourceUrl"]},
            {"label": "逐場證據與對陣推理（6bf9c48，未批准）", "url": "https://github.com/OCLR-dev/OCLR-website/blob/6bf9c48eb9ba676fbaac6fa728fcbe44b92738f5/docs/s6-match-reconstruction.md"},
            {"label": "完整 348 局原始 MP 快照", "url": "https://github.com/OCLR-dev/OCLR-website/blob/6bf9c48eb9ba676fbaac6fa728fcbe44b92738f5/docs/imports/s6-match-source-snapshot.json"},
        ],
    )
    names = {t["id"]: t for t in r["teams"]}
    for t in s["teams"]:
        observed = names[t["id"]]["evidencedNames"]
        a["teams"].append(dict(id=t["id"], name=observed[0]["name"] if observed else t["sourceLabel"],
                               source=t["source"] + ("; " + observed[0]["sources"][0] if observed else "; 隊名未知，僅保留來源字母")))
        for index, p in enumerate(t["members"]):
            if "replacementHistory" in p:
                a["rosterReplacements"].append(dict(
                    id=t["id"] + "-tier-4-history", teamId=t["id"], tier=p["tier"],
                    replacedAt=None, source=p["source"],
                    note="主辦者確認這是替換前後名單；日期與先後順序未知，不表示兩人同時在隊或任何一人為現役名單。",
                    people=[dict(osuId=h["osuId"], username=h["name"], source=h["identitySource"]) for h in p["replacementHistory"]],
                ))
                continue
            member = dict(username=p["name"], teamId=t["id"],
                          role="player" if p["role"] == "vice" else p["role"],
                          tier=p["tier"], source=p["source"])
            if p["role"] == "vice":
                member["sourceRole"] = "VICE"
            if p["osuId"] is None:
                a["unresolvedPlayers"].append(dict(id=f'{t["id"]}-slot-{index + 1}', **member))
            else:
                a["players"].append(dict(osuId=p["osuId"], **member))
    for p in s["pools"]:
        a["pools"].append(dict(id=p["id"], name=p["name"], source=p["maps"][0]["source"],
                               maps=[archived_map(m) for m in p["maps"]]))
    for q in s["qualifiers"]:
        a["qualifiers"].append(dict(
            name=q["name"], poolId="coach-qualifier" if q["name"] == "教练资格赛" else "captain-qualifier",
            source=q["name"] + "（隱藏來源，僅私人覆核，未確認排名）",
            records=[dict(username=p["name"], scores=[dict(slot=k, score=v) for k, v in p["scores"].items()], source=p["source"]) for p in q["records"]],
        ))
    a["staff"] = [dict(osuId=p["osuId"], username=p["name"], position=p["position"], source=p["source"]) for p in s["staff"]]
    batches = {mid: i + 1 for i, b in enumerate(r["preliminaryBatches"]) for mid in b["matchIds"]}
    scheduled = {frozenset((m["teamA"], m["teamB"])): m for m in s["schedule"]}
    stages = {"lower-round-1": "敗者組第一輪", "upper-semifinal": "勝者組準決賽", "lower-round-2": "敗者組第二輪", "lower-round-3": "敗者組第三輪", "lower-final": "敗者組決賽", "grand-final": "總決賽（終局性待確認）"}
    for m in r["matches"]:
        batch = batches.get(m["id"])
        plan = scheduled.get(frozenset((m["teamA"], m["teamB"]))) if batch == 1 else None
        notes = ["重建待覆核，並非已批准賽果。", *m["scoreNotes"]]
        if m["id"] == 84398168:
            notes.insert(0, a["notes"][1] + "ES 圖池使用原因仍不明。TB 遊戲 432260817 不計工作比分。")
        if m["id"] == 85503945:
            notes.insert(0, a["notes"][2] + "HD2 遊戲 437459269／BID 2844989 無結束時間及分數。")
        if m["crossRosterEvidence"]:
            notes.append("MP 出現跨來源隊伍名單的身分；逐場記錄不改寫原始隊籍：" + json.dumps(m["crossRosterEvidence"], ensure_ascii=False, separators=(",", ":")))
        a["matches"].append(dict(
            id=f'mp-{m["id"]}', label=m["name"],
            stage=f"瑞士輪第 {batch} 輪（重建待確認）" if batch else stages[m["stageClassification"]["role"]],
            poolId={"S6GS": "gs", "S6ES": "es", "S6FS": "fs"}[m["pool"]],
            teamA=m["teamA"], teamB=m["teamB"], scheduledAt=plan["scheduledAt"] if plan else None,
            score=None, mpUrls=[m["url"]], vodUrl=None, referee=None, streamer=None,
            commentators=None, bansA=None, bansB=None, source=m["url"],
            review=dict(status="pending", workingScore=m["reconstructedScore"], rawScore=m["rawCompletedScore"],
                        possibleScore=[2, 6] if m["id"] == 85503945 else None,
                        note="\n".join(notes), startedAt=m["startedAt"],
                        redTeamId=m["sideTeams"]["red"], blueTeamId=m["sideTeams"]["blue"], games=m["gameReview"]),
        ))
    for name, field in [("嚴格 GS 圖池候選統計", "standingsStrictGsPool"), ("四輪候選統計（D–I 暫按 3:5）", "standingsFourBatchHypothesis")]:
        a["reviewTables"].append(dict(name=name, note="待確認的推導統計，沒有正式名次或精確種子。重打裁定與 D–I 假設尚未批准。", rows=[{k: p[k] for k in ["teamId", "wins", "losses", "mapsWon", "mapsLost"]} for p in r[field]]))
    def fact(category, label, text, source):
        a["sourceFacts"].append(dict(category=category, label=label, text=text, source=source))
    fact("provenance", "來源與私人資料界線", "原工作簿只讀競賽欄位白名單；未匯入申請答案、聯絡方式、簡介或評語。原檔 SHA-256：" + s["sourceSha256"], "#289／來源整理")
    fact("provenance", "主辦者確認", "UTC+8；Inverse Lu Yang＝lnverse Lu Yang（3753204）；Re_CYCLE＝re_cyclc（9043058）；K Tier 4 為替換歷史。", "主辦者 2026-10-25 chat")
    fact("provenance", "圖池未知欄位", "S6GS 與原表相符；S6ES／S6FS 各 19 張的槽位及 BID 已確認，自動抓取失敗的歷史標題及屬性維持 null。", "S6GS／S6ES／S6FS")
    fact("schedule", "原表里程碑", "；".join(p["label"] + "：" + p["date"] for p in s["milestones"]), "Cover!B21:E22")
    rule_source = r["ruleSource"]["sourceUrl"]
    for label, text in [
        ("賽制", "四輪瑞士輪，12 進 8，BO9。前四直接勝者組、後四直接敗者組；各組第一種子可選對手。淘汰 BO11，敗者決賽及總決賽 BO13。已劃除的兩組循環提案不採用。"),
        ("計分與 Mod", "Score v1；個人 Fail 分數計入，Team Fail 判負，NF 可選。NM 可單掛 HR／HD／EZ，無額外分數調整；TB 任意 Mod。Extra 不改分數倍率。"),
        ("Extra", "各 Mod 第一張 NM1／HD1／HR1／DT1；每隊兩次，僅己方選圖使用，最多禁一張 Extra。Captain／VICE／Tier 1 同時至多一人，4v4 有 Tier 1 例外；先選圖方第一選不可使用 Extra。"),
        ("重打", "每隊每場一次常規重打額度，斷線分差與 SS 的比較須由裁判判斷；開場 30 秒內中止不耗額度。裁判錯誤或不在場時的免費中止須對手同意。規則本身不能證明哪次實打被裁判採納。"),
        ("排序與決賽缺漏", "依勝場、對賽、原文「净胜场」排序；最後一項精確含義未定，不補造種子。規則未描述總決賽重置或勝者讓分，不能據此證明沒有未提供的後續賽事。"),
        ("原定日期", "瑞士輪 2021-05-08 至 05-30；淘汰 06-05 至 06-13；決賽 06-19 至 06-20。原定日期不覆寫實際 MP 時間。"),
    ]:
        fact("rules", label, text, rule_source)
    fact("bracket", "淘汰分支（待確認）", "勝者組 B/C/G/J；敗者組 A/E/F/H。缺少 G–J 勝者決賽來源，G 勝僅由後續路徑推導，不新增比賽、日期、MP 或比分。", "33 場 MP／S6 規則推導")
    fact("bracket", "條件式名次（未批准）", "僅在接受四場重打判定、C–F 缺漏及總決賽終局性後，候選為 B/G/J/F 前四、C/E 5–6、A/H 7–8。正式名次保持空白。", "重建覆核文件")
    fact("review", "來源完整性", "33 場 MP、348 局；65 局圖池外開場、20 局中止、4 局較早完整重打候選、D–I 末 TB 暫列娛樂；工作統計選用 258 局。逐局審查保留在每場 review.games。原始選手分數快照另見來源連結。", "s6-match-reconstruction.json／s6-match-source-snapshot.json")
    return a


if __name__ == "__main__":
    target = IMPORTS / "s6-archive.json"
    target.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n")
    print(f"{target.name}: {target.stat().st_size} bytes; private review only")
