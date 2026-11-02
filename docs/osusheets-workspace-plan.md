# Player sheet redesign — #720

Reference: https://osusheets.team/bTocPKH3_6NGq_ANRFhUz (reviewed 2026-11-02).

Visual thesis: use calm MainSheet surfaces, compact aligned tables and one accent
for the active player's work; give names, maps and time the strongest hierarchy.

Content plan: pool/Mod or week/timezone controls; a shared comparison table;
inline personal inputs; one nearby save/undo area and short status legend.

Interaction thesis: fixed identity columns preserve context while scrolling;
continuous drag previews show the painted time range; immediate local updates
and restrained focus/hover feedback make edits clear. Respect reduced motion.

The timetable uses existing authorized reads: captains see the current eligible
roster, other players see themselves. Each actor still writes only their own data.
The practice comparison uses the existing current-team practice read model.

Add optional states to the existing private season interval JSON. Omitted state
means available, preserving legacy values. Uncertain/unavailable remain explicit;
unfilled is absence, and fixture scheduling retains its separate contract. No DB
DDL or production operation is needed. UTC instants remain authoritative;
local/UTC changes regenerate dated half-hour columns, including repeated DST hours.

Verification includes interval replacement, mixed/partial existing intervals,
non-overlap, DST days, midnight/week changes, authorized ownership and idempotent
persistence, followed by check/test/build/i18n and focused synthetic UI coverage.
