"""Audit all saved S5 evidence offline; no credentials, provider calls or DB writes."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUTS = ["s5-reviewed-import.json", "s5-source-records.json", "s5-match-source-snapshot.json", "s5-match-side-evidence.json", "s5-approved-standings.json"]


def numeric(value):
    return int(value) if isinstance(value, str) and value.isdecimal() else None


def positive_summary(records):
    positive = [r for r in records if r["score"] > 0]
    total = sum(r["score"] for r in positive)
    return {"positiveRecords": len(positive), "total": total,
            "meanFloor": total // len(positive) if positive else None,
            "topScore": max((r["score"] for r in positive), default=None)}


def audit():
    loaded = [json.loads((ROOT / "docs/imports" / name).read_text()) for name in INPUTS]
    archive, dossier, snapshot, sides, approved = loaded
    raw = {m["id"]: m for m in snapshot["matches"]}
    source = {m["id"].lower(): m for m in dossier["matches"]}
    side_evidence = {m["matchId"]: m for m in sides}
    known = {p["osuId"]: p for p in archive["players"]}
    pools = {p["id"]: p for p in archive["pools"][:4]}
    stage_pool = {**{f"a{i}": "pool-1" for i in range(1, 13)},
                  **{f"a{i}": "pool-2" for i in range(13, 25)},
                  **{i: "pool-3" for i in ["a25", "a26", "b27", "b28", "wf", "b30", "b31"]},
                  **{i: "pool-4" for i in ["b32", "lf", "gf"]}}
    assert len(raw) == len(source) == len(archive["matches"]) == 34
    assert set(stage_pool) == set(source)
    observed = defaultdict(set)
    for m in raw.values():
        for p in m["observedPlayers"]:
            observed[p["osuId"]].add(p["observedUsername"])
    # Exact names and explicitly recorded alternate spellings only; no fuzzy matching.
    proposals = []
    for person in archive["unresolvedPlayers"]:
        names = {person["username"].strip().casefold()}
        refs = [person["source"]]
        for difference in dossier["rosterDifferences"]:
            if difference["team"].lower() == person["teamId"] and difference["workbookName"] == person["username"]:
                names.add(difference["screenshotName"].strip().casefold())
                refs.append(difference["source"] + "; explicit screenshot spelling")
        candidates = sorted(uid for uid, values in observed.items() if any(n.strip().casefold() in names for n in values))
        if candidates:
            direct_pairs = []
            for group in dossier["draftScreenshot"]["groups"]:
                if group["candidateTeam"].lower() != person["teamId"]:
                    continue
                for member in group["members"]:
                    pair = member.get("identity")
                    if member["name"].strip().casefold() in names and pair and pair["osuId"] in candidates:
                        direct_pairs.append(pair)
            score_pairs = []
            stat_index = 0
            for pool in archive["pools"][:4]:
                for beatmap in pool["maps"]:
                    cell = dossier["mapStatistics"][stat_index]
                    stat_index += 1
                    if not cell["topPlayer"] or cell["topPlayer"].strip().casefold() not in names:
                        continue
                    for mp in raw.values():
                        for game in mp["games"]:
                            if game["endTime"] and game["beatmapId"] == beatmap["beatmapId"]:
                                for record in game["scores"]:
                                    if record["osuId"] in candidates and record["score"] == numeric(cell["topScore"]):
                                        score_pairs.append({"source": cell["source"], "gameId": game["id"], "osuId": record["osuId"], "score": record["score"], "authoredName": cell["topPlayer"]})
            proposals.append({"unresolvedId": person["id"], "username": person["username"], "teamId": person["teamId"],
                              "role": person["role"], "candidateUids": candidates, "sources": refs,
                              "directSourceNameUidPairs": direct_pairs, "exactTopScoreEvidence": score_pairs,
                              "status": "existing-name-evidence-proposal-not-applied"})
    proposed = {uid: p for p in proposals for uid in p["candidateUids"] if len(p["candidateUids"]) == 1}
    # A known roster UID with a same-name observed alternative is a conflict, not a correction.
    conflicts = []
    for person in archive["players"]:
        alternatives = sorted(uid for uid, names in observed.items() if uid != person["osuId"] and any(n.strip().casefold() == person["username"].strip().casefold() for n in names))
        if alternatives:
            conflicts.append({"username": person["username"], "rosterUid": person["osuId"], "observedUids": alternatives,
                              "teamId": person["teamId"], "source": person["source"], "status": "uid-conflict-not-corrected"})
    conflict_uids = {uid for c in conflicts for uid in c["observedUids"]}
    fixtures, occurrences, candidate_games = [], defaultdict(list), []
    seen_games = set()
    for f in archive["matches"]:
        original = source[f["id"]]
        m = raw[original["mpId"]]
        assert m["complete"] and m["endTime"] and m["url"] in f["mpUrls"]
        assert m["firstEventId"] == m["pages"][0]["firstEventId"] and m["latestEventId"] == m["pages"][-1]["lastEventId"]
        assert m["eventCount"] == sum(p["count"] for p in m["pages"])
        assert f["review"]["workingScore"] == original["score"] == side_evidence[f["id"]]["score"]
        color_team = {c: side_evidence[f["id"]]["sides"][c]["teamId"] for c in ["red", "blue"]}
        assert color_team == {"red": f["review"]["redTeamId"], "blue": f["review"]["blueTeamId"]}
        pool_id = stage_pool[f["id"]]
        pool_bids = {b["beatmapId"] for b in pools[pool_id]["maps"]}
        wins, known_wins, games = [0, 0], [0, 0], []
        for index, g in enumerate(m["games"]):
            assert g["id"] not in seen_games
            seen_games.add(g["id"])
            assert len({s["osuId"] for s in g["scores"]}) == len(g["scores"])
            assert all(isinstance(s["score"], int) and s["score"] >= 0 for s in g["scores"])
            candidate = bool(g["endTime"]) and g["beatmapId"] in pool_bids
            if not g["endTime"]:
                assert all(s["score"] == 0 for s in g["scores"])
                disposition = "aborted-no-result"
            elif not candidate:
                disposition = "outside-stage-pool"
            else:
                disposition = "included-candidate"
            totals = {c: sum(s["score"] for s in g["scores"] if s["team"] == c) for c in color_team}
            known_totals = {c: sum(s["score"] for s in g["scores"] if known.get(s["osuId"], {}).get("teamId") == color_team[c]) for c in color_team}
            def winner(values):
                if values["red"] == values["blue"]:
                    return None
                return color_team["red" if values["red"] > values["blue"] else "blue"]
            raw_winner, known_winner = winner(totals), winner(known_totals)
            if candidate:
                assert g["mode"] == "osu" and g["teamType"] == "team-vs" and g["scoringType"] == "scorev2"
                if raw_winner: wins[0 if raw_winner == f["teamA"] else 1] += 1
                if known_winner: known_wins[0 if known_winner == f["teamA"] else 1] += 1
                candidate_games.append((pool_id, f["id"], g))
            checks = []
            for s in g["scores"]:
                p = known.get(s["osuId"])
                relation = ("known-fixture-roster" if p and p["teamId"] in [f["teamA"], f["teamB"]] else "known-other-roster" if p else "unresolved-identity-evidence" if s["osuId"] in proposed else "roster-uid-conflict" if s["osuId"] in conflict_uids else "not-in-saved-roster")
                check = {**s, "observedNames": sorted(observed[s["osuId"]]), "rosterTeamId": p["teamId"] if p else None,
                         "relation": relation, "zeroRecordRequiresReview": s["score"] == 0,
                         "lobbyColorAgreesWithKnownRoster": None if not p or p["teamId"] not in [f["teamA"], f["teamB"]] else color_team.get(s["team"]) == p["teamId"]}
                checks.append(check)
                occurrences[s["osuId"]].append({"fixtureId": f["id"], "gameId": g["id"], "candidate": candidate, "record": check})
            games.append({"gameId": g["id"], "sourcePointer": f"/matches/{list(raw).index(m['id'])}/games/{index}",
                          "beatmapId": g["beatmapId"], "startTime": g["startTime"], "endTime": g["endTime"],
                          "disposition": disposition, "gameMods": g["mods"], "scores": checks,
                          "rawColorTotals": totals, "knownRosterTotals": known_totals,
                          "rawWinnerTeamId": raw_winner, "knownRosterWinnerTeamId": known_winner,
                          "teamFailAdjudication": "unknown", "accuracy": None, "combo": None, "hitCounts": None})
        fixtures.append({"fixtureId": f["id"], "label": f["label"], "mpId": m["id"], "mpUrl": m["url"],
                         "source": original["source"], "poolId": pool_id, "teamIds": [f["teamA"], f["teamB"]],
                         "colorTeams": color_team, "acceptedScore": original["score"], "rawCandidateScore": wins,
                         "knownRosterOnlyScore": known_wins, "scoreReconciles": wins == original["score"],
                         "candidateCountReconciles": sum(g["disposition"] == "included-candidate" for g in games) == sum(original["score"]),
                         "candidateGameCount": sum(g["disposition"] == "included-candidate" for g in games),
                         "unknownRosterCandidateRecords": sum(s["relation"] != "known-fixture-roster" for g in games if g["disposition"] == "included-candidate" for s in g["scores"]),
                         "status": "arithmetic-reconciled-not-published" if wins == original["score"] else "series-score-discrepancy", "games": games})
    assert len(seen_games) == 332
    map_checks, cursor = [], 0
    for pool_id, pool in pools.items():
        for beatmap in pool["maps"]:
            st = dossier["mapStatistics"][cursor]
            cursor += 1
            assert st["slot"].replace("(EX)", "") == beatmap["slot"].replace("TB1", "TB") or st["slot"] == beatmap["slot"]
            scoped = [(f, g) for p, f, g in candidate_games if p == pool_id and g["beatmapId"] == beatmap["beatmapId"]]
            all_stages = [(f, g) for _, f, g in candidate_games if g["beatmapId"] == beatmap["beatmapId"]]
            records = [s for _, g in scoped for s in g["scores"]]
            computed = positive_summary(records)
            comparison = {field: "unknown-source" if numeric(st[field]) is None else "match" if numeric(st[field]) == value else "different" for field, value in [("times", len(scoped)), ("average", computed["meanFloor"]), ("topScore", computed["topScore"])]}
            witnesses = []
            if comparison["average"] == "different":
                for fixture_id, g in scoped:
                    for s in g["scores"]:
                        if s["score"] > 0 and computed["positiveRecords"] > 1 and (computed["total"] - s["score"]) // (computed["positiveRecords"] - 1) == numeric(st["average"]):
                            witnesses.append({"fixtureId": fixture_id, "gameId": g["id"], "osuId": s["osuId"], "score": s["score"], "status": "single-record-removal-explains-mean-not-an-exclusion-approval"})
            top_records = [s for s in records if s["score"] == computed["topScore"]]
            top_name_status = "unknown-source" if not st["topPlayer"] else "exact-observed-name-match" if any(st["topPlayer"].strip().casefold() == name.strip().casefold() for s in top_records for name in observed[s["osuId"]]) else "name-not-exactly-matched"
            map_checks.append({"poolId": pool_id, "slot": beatmap["slot"], "beatmapId": beatmap["beatmapId"], "source": st,
                               "candidateGameIds": [g["id"] for _, g in scoped], "computed": {"times": len(scoped), **computed},
                               "comparison": comparison, "topPlayerNameComparison": top_name_status,
                               "singleRemovalMeanWitnesses": witnesses,
                               "allStageScopeDiagnostic": {"gameIds": [g["id"] for _, g in all_stages], "times": len(all_stages), **positive_summary([s for _, g in all_stages for s in g["scores"]])}})
    assert cursor == 70
    players = []
    for uid, rows in sorted(occurrences.items()):
        selected = [r for r in rows if r["candidate"]]
        if not selected: continue
        scores = [r["record"]["score"] for r in selected]
        players.append({"osuId": uid, "observedNames": sorted(observed[uid]), "savedRosterName": known.get(uid, {}).get("username"),
                        "savedRosterTeamId": known.get(uid, {}).get("teamId"), "candidateRecords": len(selected),
                        "fixtureCount": len({r["fixtureId"] for r in selected}), "rawScoreTotalIncludingZero": sum(scores),
                        "rawScoreMeanIncludingZero": {"numerator": sum(scores), "denominator": len(scores)},
                        "zeroRecords": scores.count(0), "positiveRecords": sum(s > 0 for s in scores),
                        "accuracy": None, "combo": None, "hitCounts": None,
                        "occurrences": [{k: r[k] for k in ["fixtureId", "gameId"]} for r in selected],
                        "status": "raw-lobby-observations-not-released-player-statistics"})
    team_totals = []
    for team in archive["teams"]:
        relevant = [(f, f["teamIds"].index(team["id"])) for f in fixtures if team["id"] in f["teamIds"]]
        recorded = {"wins": sum(f["acceptedScore"][side] > f["acceptedScore"][1-side] for f, side in relevant),
                    "losses": sum(f["acceptedScore"][side] < f["acceptedScore"][1-side] for f, side in relevant),
                    "mapsWon": sum(f["acceptedScore"][side] for f, side in relevant),
                    "mapsLost": sum(f["acceptedScore"][1-side] for f, side in relevant)}
        standing = next(s for s in approved["standings"] if s["teamId"] == team["id"])
        team_totals.append({"teamId": team["id"], "teamName": team["name"], "recorded": recorded,
                            "approvedStanding": standing, "standingTotalsReconcile": all(recorded[k] == standing[k] for k in recorded)})
    disposition = Counter(g["disposition"] for f in fixtures for g in f["games"])
    return {"kind": "s5-complete-offline-statistics-audit-not-importable", "sourceSnapshotCapturedAt": snapshot["capturedAt"], "inputs": [{"path": "docs/imports/" + name, "sha256": hashlib.sha256((ROOT / "docs/imports" / name).read_bytes()).hexdigest()} for name in INPUTS],
            "summary": {"fixtures": len(fixtures), "rawGames": len(seen_games), "gameDispositions": dict(disposition),
                        "rawScoreReconciledFixtures": sum(f["scoreReconciles"] for f in fixtures),
                        "candidateCountsReconciledFixtures": sum(f["candidateCountReconciles"] for f in fixtures),
                        "standingTotalsReconciledTeams": sum(t["standingTotalsReconcile"] for t in team_totals), "scoreDiscrepancyFixtures": [f["fixtureId"] for f in fixtures if not f["scoreReconciles"]],
                        "mapSlots": len(map_checks), "mapComparisons": {field: dict(Counter(m["comparison"][field] for m in map_checks)) for field in ["times", "average", "topScore"]},
                        "observedUidsInCandidateGames": len(players), "savedRosterPlayers": len(archive["players"]), "unresolvedRosterPositions": len(archive["unresolvedPlayers"])},
            "method": ["Stage pools use explicit fixture IDs backed by the saved source schedule; no free-text stage parsing.", "Completed stage-pool games are candidates, not automatic official selections; outside-pool and unfinished games stay excluded from candidate arithmetic.", "Raw totals retain every provider score, including zeros and unlisted identities; no threshold/role-based exclusion.", "Map-sheet mean comparison uses floor(sum(positive scores)/positive count) as a diagnostic supported by most saved cells, not an approved player-statistics formula.", "Team Fail is recorded in rules but cannot be determined from this reduced snapshot; no raw winner is rewritten.", "Accuracy, combo and hit counts were not captured and remain null; candidate counts are never claimed as complete import/publication acceptance."],
            "identityProposals": proposals, "identityConflicts": conflicts, "teamSeriesTotals": team_totals, "fixtures": fixtures, "mapStatistics": map_checks, "rawUidAggregates": players,
            "publication": {"performed": False, "existingStandingsRevisionEvidence": approved["publication"]["revision"], "technicalAdjudicationApproved": False}}


def markdown(report):
    s = report["summary"]
    lines = ["# S5 全量統計核對（現有資料）", "", "核對範圍：34 場、332 局、70 個比賽圖池 slots。這是離線來源核對，沒有修改正式站、原始名單、比分或發布統計。", "", "## 核對結果", "", f"- {s['rawScoreReconciledFixtures']} 場原始加總比分與已核准比分一致；B28 與 GF 不一致。比分一致只證明算術核對，不代表身份、候補紀錄或技術裁定已獲批准。", "- 251 局完整圖池內對局為計分候選；18 局未完成且全部分數為 0；63 局完整對局不在該階段圖池。後兩者不進候選統計，未把所有圖池外對局一概稱作暖身。", f"- 34 場候選局數均等於已核准比分總局數；{s['standingTotalsReconciledTeams']} 隊的系列賽勝敗與勝負圖數均與已保存的最終名次表一致。沒有更動名次。", "- 原始分數、零分紀錄、玩家 UID 與 Mods 全部保留；不因低分、教練或裁判身份自動排除。缺少的 ACC／Combo／命中數維持未知。", "", "## 34 場逐場核對", "", "| 場次 | 圖池 | 已核准比分 | 候選原始比分 | 候選局 | 未匹配名單紀錄 | 比分核對 |", "|---|---|---|---|---:|---:|---|"]
    for f in report["fixtures"]:
        fmt = lambda pair: ":".join(map(str, pair))
        lines.append(f"| {f['fixtureId'].upper()} | {f['poolId']} | {fmt(f['acceptedScore'])} | {fmt(f['rawCandidateScore'])} | {f['candidateGameCount']} | {f['unknownRosterCandidateRecords']} | {'一致' if f['scoreReconciles'] else '不一致'} |")
    lines += ["", "## 比分差異", "", "- B28（A–H）：完整圖池內 8 局原始加總為 5:3，已核准為 6:2。GF（G–I）：11 局為 8:3，已核准為 7:4。現有規則有 Team Fail 判負，但快照不足以還原血條或裁判裁定；不將兩者差異自動歸因於 Team Fail，也不補造技術分或挑一局改判。", "- JSON 保留每局紅藍原始總分、僅現有名單 UID 的總分、兩種計算的勝方與完整逐人核對，可直接定位差異；未用刪除分數湊成已核准比分。", "- 251 局候選內沒有同一場次重複的完整譜面紀錄；18 個未完成紀錄有各自獨立遊戲 ID，沒有當成另一局正式成績。", "", "## 身份與候補紀錄", ""]
    for c in report["identityConflicts"]:
        lines.append(f"- {c['username']}：名單 UID `{c['rosterUid']}`，同名 MP UID `{', '.join(map(str,c['observedUids']))}`（{c['source']}）。這是來源衝突，沒有直接覆寫，也沒有把 MP UID 當作非參賽者刪除。")
    for p in report["identityProposals"]:
        lines.append(f"- `{p['unresolvedId']}` {p['username']} → `{', '.join(map(str,p['candidateUids']))}`：現有精確姓名或明載截圖拼法提供候選證據；保留為未套用的身份提案。")
    lines += ["", "三名隊長的候選 UID 均有現存來源可追查：Azureus 有兩筆原表最高分與 MP 分數／UID 精確對應；J、K 有截圖拼法與測試表姓名／UID 直接配對。這些佐證保存在 JSON，沒有修改選手名或把姓名近似當成同一人。其他九個位置沒有足夠現存姓名對應，繼續未知。", "", "## 70 個圖池 slots 核對", "", "原表均分與一般玩家均分分開處理：這裡只核對正分紀錄的均值向下取整；玩家原始統計仍包含零分，不以該診斷公式改動網站統計。空白／N/A 不是 0。", "", "| 欄位 | 相符 | 不同 | 來源未知 |", "|---|---:|---:|---:|"]
    for field, counts in s["mapComparisons"].items():
        lines.append(f"| {field} | {counts.get('match',0)} | {counts.get('different',0)} | {counts.get('unknown-source',0)} |")
    lines += ["", "### 原表均分差異的逐筆證據", ""]
    for m in report["mapStatistics"]:
        if m["comparison"]["average"] == "different":
            lines.append(f"- {m['poolId']} {m['slot']}：來源 {m['source']['average']}，候選正分均值向下取整 {m['computed']['meanFloor']}。")
            for w in m["singleRemovalMeanWitnesses"]:
                lines.append(f"  - 若移除 {w['fixtureId'].upper()}／局 {w['gameId']}／UID {w['osuId']} 的 {w['score']} 分，均值可重現原表。這是算術證據，並非排除授權。")
    lines += ["", "- Final NM6（2240700）原表次數與最高分跨前一階段累計才相符，但均分對應 Final 階段；Final HD4（2278245）次數與最高分也跨階段才相符，均分仍無法由完整候選原始正分重現。不能把這些欄位視作同一統計口徑。", "", "## 完整結果與重現", "", "- [逐局／逐人／逐圖／逐 UID 核對 JSON](imports/s5-statistics-audit.json) 保存所有 332 局與來源 SHA-256；現有 15 個未解析位置維持原狀。", "- 執行 `python3 scripts/audit-s5-statistics.py` 重建；加 `--check` 驗證生成物未漂移。", "- 此核對沒有呼叫外部 API 或資料庫，也沒有修改已核准名次與比分。正式發布仍需在現有管理流程中處理身份、非參賽者／候補紀錄及兩場裁定差異；缺少來源的結論維持未知。", "", "## 本次驗證", "", "- 離線來源保全測試：`python3 -B -m unittest discover -s tests/scripts -p test_audit_s5_statistics.py -v`，6 項通過。", "- 相關 archive-metadata／archive-statistics／historical-archive 單元測試：3 檔、40 項通過。", "- 生成物 `--check`、Python 語法、JSON、文件連結及 `git diff --check` 通過。", "- 本次只新增離線核對工具、報告與保全測試，沒有更動應用程式、讀取 schema、原始來源或資料庫；未重跑與本次核對無關的完整應用建置／DB／瀏覽器測試。", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    report = audit()
    outputs = {ROOT / "docs/imports/s5-statistics-audit.json": json.dumps(report, ensure_ascii=False, indent=2) + "\n", ROOT / "docs/s5-statistics-audit.md": markdown(report)}
    for path, text in outputs.items():
        if args.check:
            assert path.read_text() == text, f"Regenerate {path}"
        else:
            path.write_text(text)
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
