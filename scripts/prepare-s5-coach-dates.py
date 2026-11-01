"""Reconcile public S5 evidence and prepare a local archive; never contact a DB."""

import argparse
import copy
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
IMPORTS = ROOT / "docs/imports"
ZONE = ZoneInfo("Asia/Shanghai")


def load(path):
    return json.loads(path.read_text())


def reconcile(source, evidence):
    coaches = []
    qualification = [m for m in evidence["matches"] if "games" in m]
    roster = {p["id"]: p for p in load(IMPORTS / "s5-reviewed-import.json")["unresolvedPlayers"]}
    qualifiers = {p["name"].casefold(): p for p in source["coachQualifier"]}
    for profile in evidence["profiles"]:
        person = roster[profile["unresolvedId"]]
        assert person["role"] == "coach"
        assert profile["matchedName"].casefold() == person["username"].casefold()
        assert profile["teamId"] == person["teamId"]
        assert profile["rosterSource"] == person["source"]
        assert profile["joinedAt"][:10] < "2020-11-14", "Account postdates S5"
        assert profile["resolvedUrl"] == f'https://osu.ppy.sh/users/{profile["osuId"]}'
        proof = []
        for recorded in qualifiers[person["username"].casefold()]["scores"]:
            bid = int(recorded["map"].split(" - ")[1])
            hits = [
                {"mpId": m["mpId"], "gameId": g["id"], "beatmapId": bid,
                 "score": p["score"], "source": recorded["source"]}
                for m in qualification for g in m["games"]
                if g["beatmapId"] == bid
                for p in g["scores"]
                if p["osuId"] == profile["osuId"] and p["score"] == recorded["score"]
            ]
            proof.extend(hits)
        # A recycled current username must also have complete historical score proof.
        if profile.get("rejectedLookup"):
            assert profile["rejectedLookup"]["joinedAt"][:10] > "2021-01-17"
            assert len({p["beatmapId"] for p in proof}) == 7
        coaches.append({
            "unresolvedId": person["id"], "username": person["username"],
            "teamId": person["teamId"], "role": "coach", "tier": person["tier"],
            "osuId": profile["osuId"], "source": person["source"],
            "profileUrl": profile["resolvedUrl"], "matchType": profile["matchType"],
            "currentUsername": profile["currentUsername"], "qualifierProof": proof,
        })
    assert len(coaches) == 12 and len({p["osuId"] for p in coaches}) == 12
    raw = {m["mpId"]: m for m in evidence["matches"]}
    matches = []
    for original in source["matches"]:
        mp = raw[original["mpId"]]
        assert mp["complete"] and mp["url"] == original["mpUrl"]
        local = datetime.fromisoformat(mp["match"]["start_time"].replace("Z", "+00:00")).astimezone(ZONE)
        day = local.date().isoformat()
        changed = day != original["dateAsStored"]
        if changed:
            assert (original["id"], original["dateAsStored"], day) == ("B32", "2020-01-01", "2021-01-01"), "Unexpected MP/schedule date conflict"
        scheduled = datetime.fromisoformat(f'{day}T{original["timeAsStored"]}:00').replace(tzinfo=ZONE)
        matches.append({
            "id": original["id"].lower(), "source": original["source"],
            "mpUrl": mp["url"], "dateAsStored": original["dateAsStored"],
            "timeAsStored": original["timeAsStored"], "yearCorrected": changed,
            "roomOpenedAt": mp["match"]["start_time"], "roomOpenedAtLocal": local.isoformat(),
            "scheduledAt": scheduled.isoformat(), "timeZone": "Asia/Shanghai",
        })
    assert len(matches) == 34 and len({m["id"] for m in matches}) == 34
    return {"kind": "s5-coach-date-review", "importable": False,
            "timeZoneAuthorization": "Organizer chat, 2026-11-01: UTC+8; match dates from MP links",
            "datePolicy": "MP local calendar date + MainSheet scheduled wall time; room creation stays separate",
            "coaches": coaches, "matches": matches}


def prepare_archive(archive, review):
    result = copy.deepcopy(archive)
    for coach in review["coaches"]:
        unresolved = next((p for p in result.get("unresolvedPlayers", []) if p["id"] == coach["unresolvedId"]), None)
        if unresolved is None:
            saved = next((p for p in result["players"] if p["osuId"] == coach["osuId"]), None)
            assert saved is not None and all(saved[k] == coach[k] for k in ["username", "teamId", "role", "tier", "source"]), "Identity changed since evidence capture"
            continue
        assert all(unresolved[k] == coach[k] for k in ["username", "teamId", "role", "tier", "source"])
        assert not any(p["osuId"] == coach["osuId"] for p in result["players"]), "UID collision"
        assert not any(p["osuId"] == coach["osuId"] for r in result.get("rosterReplacements", []) for p in r["people"]), "Replacement UID collision"
        result["players"].append({k: v for k, v in unresolved.items() if k != "id"} | {"osuId": coach["osuId"]})
        result["unresolvedPlayers"].remove(unresolved)
        result.setdefault("sourceFacts", []).append({
            "category": "review", "label": "Archive identity confirmation",
            "text": f'{coach["unresolvedId"]}: {coach["username"]} → osu! UID {coach["osuId"]}. Original roster source: {coach["source"]}',
            "source": f'2026-11-01 osu! official name evidence; {coach["profileUrl"]}',
        })
    saved_matches = {m["id"]: m for m in result["matches"]}
    assert set(saved_matches) == {m["id"] for m in review["matches"]}
    for evidence in review["matches"]:
        match = saved_matches[evidence["id"]]
        assert match["mpUrls"] == [evidence["mpUrl"]] and match["source"] == evidence["source"]
        assert match["roomOpenedAt"] == evidence["roomOpenedAt"]
        assert match["scheduledAt"] in [None, evidence["scheduledAt"]], "Existing schedule differs"
        match.update(scheduledAt=evidence["scheduledAt"], timeZone=evidence["timeZone"])
    fact = {
        "category": "review", "label": "S5 UTC+8 schedule confirmation",
        "text": "2026-11-01 organizer confirmed UTC+8. Dates checked against all 34 MP room timestamps in Asia/Shanghai; scheduled wall times retained from MainSheet. B32 date corrected from 2020-01-01 to 2021-01-01. Room creation timestamps remain separate. This does not establish official season or phase boundaries.",
        "source": "https://github.com/OCLR-dev/OCLR-website/issues/610",
    }
    if fact not in result.setdefault("sourceFacts", []):
        result["sourceFacts"].append(fact)
    old_note = "34 場比分依 MainSheet 待管理介面核准；紅藍隊已由原始 MP 已知 UID 核對。原表時間的時區仍未知，scheduledAt 留空；MP 開房 UTC 時間另存。"
    result["notes"] = [
        "34 場已核准比分與逐局統計保留；賽程採主辦者確認的 UTC+8，以 MP 核對日期並保留原表排定時間。B32 年份更正為 2021；MP 開房 UTC 時間另存。" if n == old_note else n
        for n in result.get("notes", [])
    ]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--archive", type=Path, help="Current saved archive or admin edition response; kept local")
    parser.add_argument("--output", type=Path, help="Local prepared archive, never automatically uploaded")
    args = parser.parse_args()
    review = reconcile(load(IMPORTS / "s5-source-records.json"), load(IMPORTS / "s5-coach-date-sources.json"))
    review["inputSha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [IMPORTS / "s5-source-records.json", IMPORTS / "s5-reviewed-import.json", IMPORTS / "s5-coach-date-sources.json"]}
    path = IMPORTS / "s5-coach-date-review.json"
    text = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert path.read_text() == text, "Review report drift"
    else:
        path.write_text(text)
    if args.archive:
        assert args.output and args.output.resolve().is_relative_to(Path("/private/tmp")), "Keep saved admin archive outside the repository"
        saved = load(args.archive)
        archive = saved["edition"]["archive"] if "edition" in saved else saved
        args.output.write_text(json.dumps(prepare_archive(archive, review), ensure_ascii=False, indent=2) + "\n")
    print("12 coach identities, 34 UTC+8 schedules, one year correction verified")


if __name__ == "__main__":
    main()
