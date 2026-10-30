# Competition workflows

How captains, teams, the live draft, fixtures, multiplayer imports, referee approval and published results fit together. For running an event and recovering from failures, also see the [deployment runbook](deployment.md#draft-operator-runbook-and-rehearsal).

## Captains and eligible pool

The captain workspace shows eligible players and appointed captains as avatar/country cards. Drag an eligible player into the captain area or use its Appoint button. Reorder captains with the grip (mouse/touch) or labeled move buttons, then Save captain order. Publication, replacement, revocation, availability and locking remain under advanced controls. Country details use existing cached official profiles; only visible missing identities are lazily requested through the existing protected profile endpoint, serially, with unavailable data labeled honestly. Team setup links guide organizers from accepted applications to captains and team configuration instead of leaving an empty page.

Staff use `/admin/tournaments/[edition]/captains` to appoint/revoke/replace accepted, available individual players, save a complete captain order, mark a noncaptain unavailable with a reason, and lock reviewed setup. There are no assumed captain counts, roster sizes, clocks or snake rounds. Commands validate the current setup revision; routine saves do not require a written reason or extra dialog, while publication and consequential changes require confirmation; edition locks and database uniqueness protect concurrent actions. Captains cannot withdraw themselves or gain staff powers. Captain/pool identities remain private until an explicit staff publication approval. Locked setup rejects normal changes; supervised recovery must be handled through the draft controls rather than silent edits.

## Teams

Staff configure exactly one approved team identity per captain at `/admin/tournaments/[edition]/teams` **before locking setup**. Optional capacity is a maximum including the captain, not an invented required roster size. Captain membership is created transactionally. A partial unique PostgreSQL index enforces one active membership per player per edition; composite foreign keys prevent cross-edition assignments. Revoking an unstarted captain archives their team and ends membership without erasing history. Assigned draft rosters require supervised correction.

Captains view only their own team at `/tournaments/[edition]/team`; no self-service team creation, invitations, roster edits or unapproved branding edits exist. Public `/teams` routes project approved identities only. Rosters require finalization by the draft engine and separate staff publication. Private memberships, capacity, internal operations and unpublished identities are excluded. The bracket consumes these finalized, published team IDs directly.

General tournament settings include **Enable coaches for this tournament** (#544). New editions default to disabled; S11 also defaults to disabled when the saved setting is absent, as requested by the organizer. Other existing editions without this setting retain their previous enabled behavior. Disabling hides and locks coach configuration, retaining assignments and their existing publication state; re-enabling restores management. The server checks this setting again under the edition lock. No migration or automatic publication change is required.

Administrators can add or remove coaches by verified osu! UID in the same team workspace. Coach assignments use `team_coaches` (migration `0028`), separate from playing memberships, captain appointments and staff permissions. They do not create registrations, consume player capacity, enter the draft or assign an award Tier. The same person may retain an independently earned player/captain role; coaching never changes that role. Team-scoped assignments, setup version checks and transactional audit events protect updates. Unknown/unavailable provider identities cannot be added.

Coach cards and edition-bound profiles become public only when the edition, captain, team identity and finalized roster are published. Changes to an already published roster's coaches take effect immediately; hiding the roster, captain, team or edition hides those assignments. The public participant count still counts accepted player registrations only. Archived teams retain assignment history but do not expose coaches publicly. Coach administration remains available after draft finalization because it does not alter the playing roster or draft snapshots.

## Group assignments

Configure stage-scoped groups at **Team management → Group assignments** before arranging fixtures (#545). The fixture configuration links to this workspace. Saving and publishing still use the existing versioned `stage_groups` command; group identifiers, membership, standings and publication rules are unchanged. Choose the group count and generate the cards (#551), then assign teams using each card’s picker, drag a team card, or select a team and activate its destination. Moving a team between cards removes its previous membership, so each team belongs to at most one group per stage. The unassigned pool also accepts returned teams. Increasing the count preserves existing group keys and members; shrinking it asks for confirmation when removed groups contain teams and returns those teams to the pool. These edits remain local until Save and its confirmation; each saved group still requires at least two teams. Publication is a separate explicit choice, and unpublished teams retain their staff-only marker and existing publication checks.

## Authoritative draft engine

Both the active captain and authorized staff use **the same** `pickPlayer` command and `/api/tournaments/[edition]/draft/picks` endpoint. A request contains only session ID, expected revision, turn index, candidate ID and idempotency key. Actor, action mode and receiving captain/team are derived on the server. One transaction locks edition/session, validates the frozen pool and current turn/capacity, inserts the uniquely constrained pick and membership, advances the turn/revision and records the actual actor/mode in the private audit. Captain status never grants staff control.

Staff configure the **full team-ID turn sequence** after reviewed captain/team setup is locked. Choose Snake (alternating captain order), Repeat forward, or Custom, set the pick-round count, and inspect the numbered preview before saving. No mode, roster size or clock is assumed; ambiguous saved sequences display as Custom. Save validates the draft and reviewed setup revisions, eligible player count and configured capacities (including captains). `ready` confirms and freezes the saved order and accepted available player pool, revalidating current constraints. States: setup → ready → live ↔ paused → completed → finalized; staff can abort only from setup/ready/paused/completed, then confirm recovery to unlocked setup. Every control checks the expected revision; routine saves/pause/resume are direct, while freeze, publication and consequential actions require confirmation.

Staff explicitly start/release an approved public draft. Confirmed picks and normal transitions then update public/captain snapshots atomically with the mutation; public snapshots exclude actor IDs, action modes, private answers, audit reasons and idempotency keys. Remaining pool identities require separate approval. Captain snapshots contain only the published board plus approved eligible identities needed for selection. Picks require a released board, but no separate per-turn publication. Public reads never advance a draft. Duplicate retries by the same actor/key return the existing receipt; different payloads with the same key fail.

All appointed captains use `/tournaments/[edition]/draft/captain` to browse the last published eligible pool and their own roster. The active captain can drag a player into My Team or choose a card by click, keyboard or touch, then confirm the pending pick once. Dragging never writes a pick or moves a roster member. Waiting captains have a searchable read-only board. Staff use the same picker for the active captain. The UI clears unconfirmed selections when disconnected or when the published revision changes; sent requests retain their idempotency key for safe receipt retries after uncertain network failures. Rosters update only from authoritative snapshots, with no optimistic captain roster publication.

Supervised corrections are deliberately limited: pause (or complete), confirm voiding the last pick, preserve its history, end its membership, automatically update the corrected snapshot, then resume. Earlier corrections require undoing subsequent picks in reverse order, or explicit abort/recovery; finalized drafts are immutable. Abort voids draft picks/memberships and preserves audit/history. Finalization requires all configured turns committed, roster invariants satisfied and last picks published, then marks teams finalized. Team roster publication remains a separate explicit staff approval. Unconfirmed substitutions/post-finalization corrections are not invented.

## Read-only brackets and results

Once an edition has database fixtures, its database competition pipeline is the sole score authority. `/tournaments/[edition]/bracket` adapts published knockout fixtures and approved published result revisions into the existing responsive bracket renderer, with a keyboard-accessible full match list and source-detail links. Progression uses only explicitly configured winner/loser fixture relationships. No elimination format, bye, forfeit or winner is invented.

Legacy `src/content/brackets.json` or `OCLR_BRACKETS_FILE` remains a read-only compatibility source **only for editions with no database fixtures**. Once any database fixture exists, legacy scores are ignored for the entire edition, including when all database fixtures are unpublished. Never add independent file-based scores to an edition managed through referee review. Existing synthetic legacy fixtures continue to test the renderer.

A hidden or unresolved parent result yields a TBA slot, never the future fixture's stored team assignment. Publishing a corrected parent winner immediately withholds a downstream score/MP source when its approved teams no longer agree with progression. Staff must review affected fixtures, withdraw an invalid result, explicitly amend the unpublished fixture if needed, and follow fresh import/review/approval/publication. Historical revisions are retained. The same database projection drives schedule, result pages, standings and bracket so corrections cannot leave contradictory public scores.

## Broadcast overlay

The read-only `/tournaments/[edition]/draft/overlay` browser source is designed for 1920×1080; `?background=transparent` enables compositing. It shows only published picks, the selecting captain/team, current turn and roster progress. Both pick methods use the same feed. Reconnect/reload does not mutate or replay the draft. See [OBS setup and rehearsal](deployment.md#obs-browser-source) for source settings and verification limits.

## Competition fixtures and result foundation

Admin manages `/admin/tournaments/[edition]/matches`; Referee assignments expose only that operator's fixtures. Private fixture setup can select active unpublished teams for internal testing (#546), clearly marked Unpublished. This does not publish their identities or roster. Published fixtures and result reporting still require finalized, published identities/rosters. Fixtures reference existing edition/round/team IDs and an optional pool from the same round. Enter confirmed match times in the displayed IANA zone, or leave time TBA. Match options contains optional pool, order, status and progression settings; new fixture positions follow the selected round’s existing matches. Routine changes require the current version and are audited automatically; safe label/time edits retain publication, while active proposals and approved structural history protect teams, rounds, pools and progression. Winner/loser links are optional, explicitly configured knockout relationships; cycles and cross-edition/stage references are rejected. No automatic forfeits or advancement rules are assumed.

Round scoring remains `null` until explicitly configured: rules version, game mode, supported team/scoring mode, score aggregation, players per game, first-to/fixed-map series and substitution policy. Ranking remains pending without separately approved points and ordered tiebreak criteria; missing draw points cannot be guessed. Approved historical scoring rules cannot be silently rewritten. Round configuration uses the existing edition audit stream; fixture, import and result operations use a private fixture audit stream.

`fixtureForReview(actor, editionSlug, fixtureId)` is the importer contract: freshly authorized assigned Referee/Admin, fixture/version, stage/round/rules, the two stable team IDs and finalized roster osu! IDs, optional associated map IDs/FM policy, result state and private history. Role/assignment removal applies to subsequent calls. The database separates scheduled fixture status (`scheduled`, `in_progress`, `cancelled`) from result review state (`draft`, `submitted`, `approved`) and explicit approved-revision publication. Source fingerprints, per-import game uniqueness, result revisions and per-edition game claims support the single pipeline: Fixture → MP import → referee review → Admin approval → explicit publication. A source import alone cannot create or publish an official score. The referee workflow below uses these records; the public result adapter below consumes only approved published revisions.

## Multiplayer source parsing

The single server API client uses the official [Get Match endpoint](https://osu.ppy.sh/docs/#get-match), `public` client-credentials scope and response version `20220705`. The independent history fetcher requests ascending `after` pages (100 events), deduplicates events/games, checks reported boundaries and detects history/game changes during retrieval. Imports are bounded to 100 pages, 10,000 events, 3,000 games and 8 MiB of aggregate provider responses; reaching an incomplete range cannot produce a final result. It retains validated scoring/event provenance and omits unrelated provider user profiles. A SHA-256 fingerprint excludes retrieval time so identical source facts remain idempotent; refresh comparisons identify added, removed and changed games.

The side-effect-free scorer attributes players using the fixture's official team IDs and rosters, never lobby-title names. Every source game requires an explicit include/exclude decision; exclusions require reasons. Included games require mod/rule confirmation and explanation of warnings/overrides. Non-roster players require a permitted, explicitly justified substitution attribution and eventual Admin approval; official rosters are unchanged. Incomplete, conflicting, mixed-team or unsupported scores cannot silently produce winners. Scoring needs explicitly approved sum/average aggregation, first-to/fixed-map completion, player count, failed-score policy, tied-map policy and understrength/substitution policies. Unknown Force Mod restrictions block compliance. Missing rules, incomplete history, unreviewed games, extra games and unresolved ties prevent a final result. No automatic forfeits or lobby-title team parsing exist.

An unauthenticated request to the organizer's `117427458` example returned HTTP **403** in this environment. No real osu! client credentials were present. Its actual teams, games and final score have **not** been verified or fabricated. Automated responses are clearly synthetic fixtures. These parser/scorer checks do not establish that a hosted referee workflow or live provider integration is operational; the isolated PostgreSQL and browser rehearsals below validate protected persistence/review/publication, while live provider and hosted verification remain external gates.

## Referee review and result approval

An assigned Referee or Admin opens `/admin/tournaments/[edition]/matches/[fixtureId]`, imports a canonical osu! MP link using the server-side client-credentials configuration, and reviews every game. Include/exclude decisions, exclusion/override reasons, explicitly permitted substitutions and mod compliance are validated again on the server. The UI displays the current scoring policy and derived series; no client-supplied winner or score is accepted. Internal reasons and individual provider scores stay staff-only. The separate public result note is intended for publication.

Every import is fingerprinted and immutable. Identical imports reuse stored games; retries use actor-scoped request keys. Changed source histories show added, removed and changed games and require new review. Competing submissions with the same expected version produce one committed result and a 409 conflict. Reload and server restart read authoritative database state. Provider failures preserve prior sources and results.

Submitting creates a numbered immutable revision containing source, roster, pool and scoring-rule evidence, plus per-game attribution confidence and player/team evidence. Only Admin can approve, reject, withdraw or publish. The normal final action is **Approve & publish result**, after reviewing dependencies; older approved-only revisions can still be explicitly published. Approval reserves the included game IDs within the edition and permanently freezes the associated mappool. Publication requires both explicit Admin approval and a published fixture; imports or referee submissions never publish automatically. A correction follows the same review/approval/publication sequence. The old published revision remains authoritative until its replacement is explicitly published. Unpublishing withholds the public result; withdrawal also releases game claims, preserving all source/revision/audit history and inventing no forfeit. Active reports must be withdrawn before changing fixture identity; fixtures with approved history require a replacement for structural changes, preserving historical snapshots; scoring corrections receive a new policy release automatically and never rewrite saved approved snapshots. Unchanged scoring, standings and group-assignment saves retain their existing policy identifiers. Ordinary views show workflow states; technical identifiers remain in protected audit/provenance details. Published tournament Rules identifiers remain explicit because players acknowledge those releases.

Automated validation uses synthetic official-shaped API responses, real PostgreSQL transactions and isolated desktop/mobile browser sessions. Browser tests seed stored synthetic snapshots directly into the test database; there is no production mock provider or authentication bypass. The organizer's real match and a hosted deployment still require live credentials and supervised verification.

### Saving and starting a private draft (#101)

Save draft configuration, then choose Start draft. No separate Lock, Ready, Freeze or public release is required. Starting snapshots the currently accepted, available unassigned candidates and internally locks captain/team structure. Unset capacity and candidate shortages are warnings; each actual pick still checks eligibility, current team, capacity if configured, concurrency and uniqueness. With two turns and one player, that player can be picked once; the remaining turn waits for candidates. Pause for review, undo the last pick, or explicitly abort/reopen setup; abort voids draft picks and removes their roster assignments, preserving audit history. No automatic completion or invented picks occur.

Captain access uses an authenticated private snapshot. Public draft release remains an explicit separate action requiring released captain/team identities. Starting or selecting privately never grants anonymous access. Once released, committed picks and transitions refresh the public snapshot atomically as before.

Captain publication controls are visible and load their saved values independently. Publishing the eligible draft pool does not control accepted-player directory visibility. Optional setup locking remains available for organizers who want it, but the Start action handles necessary structural protection internally.

The organizer approved the corrected Chinese abort warning on 2026-10-22: abort voids the current draft's picks and removes corresponding active roster assignments while preserving historical picks/audit records. This documents the existing abort behavior; it does not introduce silent roster deletion or change the separate pause action.

### Editing after Start and rehearsal recovery (#104)

Tournament General, Registration, Rules & eligibility and Milestones remain Admin-editable while drafting or after finalization. Each Save uses the current configuration revision, preserves historical rules/question/eligibility acknowledgments and writes an automatic audit event. An old rules release cannot be silently rewritten.

Draft setup and enrollment now have separate persisted protection. Lock/Start pauses enrollment, but Unlock, Pause and edit, Reset and legacy recovery never clear that pause, enable registration, change its dates or publish private picks. In Tournament Settings → Registration, **Resume registration** deliberately removes the operational pause; explicit enablement, publication, privacy, completion and opening/closing times still apply. A disabled or future registration window does not open merely because its operational pause was removed. Assigned players/captains still cannot withdraw through self-service.

In Live draft, **Pause and edit** stops picks atomically and opens correction controls. With no committed picks, Unlock returns to Setup and retains the saved sequence, so captains, team capacities and order can be edited without abort/recreate. With picks, the session remains Paused: team branding/capacity (never below its current membership), unassigned-player availability and future turns can change. Confirmed turns cannot change team or disappear; captain reassignment and assigned-player availability require an explicit supervised correction/reset. Team identity corrections refresh the existing approved draft projection in the same transaction, while private drafts stay private. Save the future order before Resume; Start/Resume still use the existing versioned, role-checked, unique/idempotent pick command and per-pick capacity checks.

**Reset draft** is a separate confirmed operation after pausing. It voids the current session's picks and closes their active draft memberships, retains saved order/captains/teams, historical pick/audit records and registration state, clears the current public/private draft snapshots, and returns to Setup. Start again and explicitly Release the board when approved. It does not delete applications, teams, fixtures or results. Finalized rosters or existing match evidence block structural unlock/reset; use the organizer-reviewed competition correction/recovery process. A team referenced by fixtures cannot be archived through captain replacement. Do not edit database locks manually.

## Weekly player awards

Admins configure explicit, non-overlapping weeks and edition-specific player Tiers
at **Competition → Weekly awards**. No calendar or Tier is inferred. The entire
fixture belongs to the week containing its scheduled instant, displayed in the
edition time zone. Week ranges include the start and exclude the end.

Organizer-approved policy `relative-game-mean-v1`: each included, approved scored
game contributes one appearance per attributed player. For that game, divide the
player's effective score by the highest eligible player effective score. Apply the
approved result's failed-score policy. Round ratios half up to nine decimal places,
then round their weekly mean half up to nine decimal places. Higher is better;
percentage output has seven decimals. Missing/unverified scores and all-zero games
require review rather than fabricated values. Excluded games do not count.

MVP requires at least six appearances; MIP requires five in **both adjacent weeks**
and positive absolute improvement, from Week 2; Best Rookie requires five and an
explicit Tier of T4, T5 or below. Awards are independent. Equal metrics remain tied;
no hidden tiebreak is applied. Unknown Tier is not Rookie eligibility.

Only approved, published result revisions feed the calculation. A newer unapproved
import or correction does not replace the published revision. Admin reviews and
publishes an immutable calculation snapshot with source IDs/revisions. Source,
fixture-time, Tier or participant-publication changes mark affected releases stale;
the public page withholds winners pending deliberate review and republication.
Previous releases remain in the database. No scheduler or second score store is used.

### Historical drawn results

Historical archive reviews accept played tied scores (for example, 5:5). Admin
approval records the exact score and retains source evidence; publication remains
a separate edition operation. A recorded draw counts as a completed result but
has no winner in schedules or bracket cards. A 0:0 placeholder remains invalid;
unknown scores stay null and forfeits retain their explicit winner without a
fabricated map score. This does not change live competition scoring policies or
infer standings points/tiebreaks for historical seasons.

For S4's five temporarily withheld draws, restore the organizer-confirmed 5:5 to
`review.workingScore` through the existing private archive workflow, then use
Admin approval after deploying this compatibility fix. Do not automatically
promote `possibleScore`: it may represent unconfirmed alternatives in other
seasons. No database migration or automatic production-data change is required.

S4's public archive reads its saved versioned rule sections when the source is
the organizer's S4 workbook (`1QqF8leIqov2l3loi92hFHu82HEuplb9Iau2zPNUcySk`).
The four original sections remain `赛程规则`, `比赛规则`, `赛程安排`, and `STAFF`;
PDF layout whitespace was normalized during transcription, without rewriting
the source wording. The original PDF is available at `/archive/s4/rules.pdf`.
The same workbook identity supplies `/archive/s4/key-visual.avif` at its original
1728×1080 size for public overview/directory fallbacks; explicit branding still
takes priority. Admins can also select this asset in the existing branding fields.
Neither source supplement changes results, publication, or source-appendix privacy.

## Referee workspace (#312–#317)

The private **Referee panel** opens from a fixture card in **Fixtures & results**
(Admin) or **My assigned matches** (Referee), and from the existing match review
page. Its route is `/admin/tournaments/[edition]/matches/[fixtureId]/referee`.
An edition Admin can supervise fixtures in that edition; a Referee needs both an
active edition role and the fixture assignment. Explicit Developer access adds
saved reads only, including through the remote frontend. Other roles do not
implicitly gain access. Every read/write rechecks current grants and assignments.

The workspace prepares commands and maintains a private officiating record.
OCLR-ref-tools (oclr-irc) owns the local IRC socket and credentials; the website
projects its bound room and queues commands for that local client. Preparing or
copying a command never sends it or advances BP. Socket delivery alone is not
confirmation. A matching post-send BanchoBot map confirmation can finalize the
queued BP intent through the server’s versioned referee service.
The official result pipeline remains MP import → Referee review → Admin approval
and publication.

### Before play

In **Round management → Edit round → Configure round referee policy**, an Admin
explicitly configures the round's finite Ban/Pick/TB steps, permitted
categories/entries, repeated-category restrictions, and TB score conditions.
This works before a fixture exists. The referee panel reads the same saved policy
and links back to the selected round instead of hosting the policy editor.
The first Ban and first Pick are independent; the same team may hold both.
The preview is unsaved until **Apply order** succeeds.
Conflicting recorded steps must be withdrawn in reverse order before changing
an already-used order. Missing teams, rules, pool, policy, or stale dependencies
are shown as missing configuration, never replaced with assumed tournament rules.

S11 rounds with configured BO11/BO13 scoring offer an editable draft from the
[published S11 v1.9 rules](https://oclr.org/tournaments/s11#rules): NF,
60-second Ban, 90-second Pick and 120-second preparation, with the corresponding
HD/HR/DT/FM/TB command Mods. The organizer confirmed the draft order on 2026-10-30:
one Ban per team → one Pick per team → a second Ban per team → alternating Picks
→ TB (5:5 for BO11, 6:6 for BO13). Admins may edit this draft before saving.
Room size and start countdown remain unset; the per-team disconnect replay
allowance is not converted into a per-map replay cap. Disconnect adjudication,
pauses and EX conditions still require referee review
under the published rules; the template does not automate these judgments.
Other seasons and existing saved policies are never replaced by S11 defaults.

The step editor uses compact rows with one action/order selector, up/down controls
and optional step limits. Category restrictions use buttons; selecting specific
maps is an optional searchable checklist. All non-TB maps are eligible for Ban
by default. TB cannot be banned, even when a policy has no explicit TB step.

**Repeated Mod Bans** controls whether the same team may Ban the same pool
category again across the round's Ban phases. Admins may allow exception
categories. New S11 drafts prohibit repeats except NM/FM. Existing policies
without `banCategoryRules` retain allowed-repeat behavior; no backfill is applied.
Opposing teams may Ban the same category. Only active Ban selections count;
withdrawn selections and Picks do not. The server and the shared desktop model
enforce the same rules. A repeated category never permits reusing a previously
banned/picked map, and no setting permits banning TB.

Saving uses the edition-scoped `manage_fixtures` capability, same-origin POST,
expected policy revision and transactional audit. It checks all sessions in the
round, rejecting changes while any active Ban/Pick remains or approved/pool-locked
history exists. An identical save is a no-op. Other sessions retain their saved
basis and require the existing dependency reconfirmation flow. Deleting an otherwise
empty round removes only its unused policy and retains its policy/deletion audit.

The command assistant supports `!mp make`, `!mp set`, `!mp addref`, `!mp invite`,
`!mp timer`, `!mp map`, `!mp mods`, `!mp start`, and `!mp abort`.
Room capacity and players-per-team are distinct. The map mode comes from the
round's scoring rules; Mods/NF/Freemod and timer defaults require explicit policy.
`make` creates a new room through BanchoBot; `name` renames an existing room.
`addref` requires the osu! room creator and grants room control, not a website role.
Player invites include every member of both saved playing rosters, including
captains and substitutes, resolving roster membership through saved UID relationships and
using saved usernames (spaces converted to underscores) in invitation text. Each command
can be prepared in the IRC console; pool actions also attempt a clipboard copy. Names cannot contain
control characters or injected extra command lines.

### During play

Selecting a map prepares an IRC command without recording a selection. The browser
queues it with the intended pool entry, expected revision and dependency fingerprint.
The server validates intent before queueing and again when applying a matching IRC
confirmation. Queued, sending, sent, failed and unknown statuses never advance BP;
record_failed means IRC confirmation arrived but the authoritative ledger rejected
the stale or conflicting intent. Review the current state before further action. The ledger
separates picking team from winner. Each pick has its own numbered attempts;
replays preserve prior attempts and consume no new pick. An optional round
`maxReplaysPerMap` caps additional attempts (two replays allow three attempts in
total); the server rejects further replays without advancing the revision or
appending an event. Older policies without this field retain their existing
behavior. Only the latest valid
attempt contributes to provisional scoring. Ties follow the configured round
policy; aborted/unresolved/withdrawn attempts never fabricate a winning point.
Persistent corrections retain append-only history; later steps must be withdrawn before an
earlier pick can be corrected. Refresh or a legitimate referee handoff resumes persisted
state and reloads the current room projection. The normal development and production
page both use the real relay contract; development mode no longer silently enables a mock.

### After play

**Post-match reconciliation** reads already saved MP imports; it does not refresh
provider data on GET. Each attempt is explicitly linked to an exact import/game
identity and fingerprint. Equal beatmap IDs are not an automatic match: warmups
and multiple replays can use the same map. One game cannot be linked to multiple
active attempts. Source refresh or ledger/dependency changes mark old confirmations
stale. Link changes retain their history and the exact referee revision reviewed.
Incomplete sources, unresolved winners and disagreements remain visible.

Use **Open MP review** to perform the existing include/exclude, substitution,
compliance and official submission workflow. A manual ledger winner never creates
MP player scores, Rating credit, a result revision or an approval. Published and
approved revisions remain immutable; changing a referee record does not change
public standings, bracket advancement, or OBS output.

### Persistence and recovery

Migrations `0058_referee_workspace` and `0059_referee_reconciliation` add private
round policy, fixture session, append-only event and reconciliation receipt tables.
Each session stores its dependency snapshot, revision, independent first teams and
command settings. Service DTOs reuse fixture/team/pool identities without copying
registration answers or credentials. GET does not create sessions. Commands use
actor-scoped UUID request keys, payload hashes, expected revisions, transactional
locks and audit history. Retrying the same payload returns the original receipt;
a different payload with the same key or a stale revision returns a conflict.

If a save's network outcome is unknown, retry the same request before editing.
If another operator changed state, refresh and review the new state. Changed
fixture/round/pool/roster dependencies require explicit rechecking; prior steps
are never silently interpreted using new data. Workspaces with saved history
cannot be erased by deleting their fixture.

All demonstration policies, identities and games are synthetic. The S9 reference
sheet does not establish defaults for another edition. First-version Chinese
labels and the complete operator flow remain subject to organizer review.

For the dedicated local referee review database, `scripts/referee-preview.ts`
updates an existing, unplayed preview fixture with short fictional names, two
six-player teams, 3v3 BO9 rules, a 5/2/2/3/2/1 NM/HD/HR/DT/FM/TB pool and a
two-replay cap per map. It accepts the existing fixture UUID, requires the exact
loopback review database on port 55436, and refuses recorded play. It does not
truncate tables or alter production data. The authored names and beatmap metadata
are UI fixtures, not provider snapshots or approved tournament selections.

### 本地 IRC 与网站同步

右侧固定 IRC 控制台显示本地 oclr-irc（仓库 OCLR-dev/OCLR-ref-tools）投影的房间消息与指令状态。osu! IRC 专用密码和 socket 始终留在 Electron Main；网站 osu! OAuth 只用于 OCLR 身份授权，不能代替 IRC 登录。真实网络接口已实现，仍需用户本人授权并实测 Bancho 房间，合成测试不代表这一步通过。

1. 启动网站开发预览，再按桌面项目说明启动 oclr-irc。开发时使用 `OCLR_SERVER_ORIGIN=http://localhost:3001 npm run dev`，网站 `APP_URL` 必须使用完全相同的 origin；不读取或复制已有运行凭据。
2. 在桌面端使用自己的 IRC 专用密码登录、创建或加入 MP 房间，读取房间设置和裁判名单。网页不会远程开房，`!mp make` 留在桌面端。
3. 桌面端发起 OCLR 授权，在系统浏览器登录 osu!，核对校验码并明确同意三个读取 scope 和 `referee:relay`。授权使用单次 code、S256 和固定本地回调；access/refresh token 只交给桌面 Main，不进入页面、URL 或持久化浏览器存储。
4. 在桌面端选择本人获派的场次，将当前房间投影到网站。IRC 用户名必须匹配授权身份；Admin 的桌面范围同样限定本人获派场次。
5. 网页显示“IRC 已连接”后，可排队发送切图、Mods、计时、开赛等允许的命令。每次绑定仅有一个在途命令；发送、已发出、已确认和未知结果分别显示。地图 Bancho 回执经服务端再次核对，才幂等地记录 Ban/Pick。页面重试丢失的排队响应使用同一 requestKey，不创建第二条指令。
6. 在桌面端停止投影或网页“断开同步”会停用该连接；在 `/desktop/sessions` 可撤销自己的桌面授权。网站退出登录不会自动撤销独立桌面会话。断线/过期命令不会自动重送，需检查房间实际状态。

服务端 endpoint：浏览器同源 cookie 的 `GET/POST /api/admin/tournaments/{edition}/matches/{fixture}/referee/irc`；桌面 Bearer 的 `POST /api/referee/v1/fixtures/{fixture}/relay`。绑定与同步始终复查授权、本人指派和 edition；投影仅含绑定房间的有界消息。新增 `0060_desktop_irc_relay` 保存短期桌面授权、会话、哈希 token、房间绑定及指令状态；不存 IRC 密码或上游 osu! token。

目前仅匹配的后续 Bancho 地图回执和明确的中止/取消计时回执会自动确认；其他真实回覆仍显示，但不从 socket 写入推断成功。未知结果及执裁记录冲突必须人工检查。正式结果仍走既有 MP 审核发布流程。 地图回执兼容 `Beatmap changed to` 与 `Changed beatmap to` 两种已知措辞，仍须核对目标房间、BanchoBot、精确谱面 ID 和新投影消息；详见 [#575 验证记录](verification/issue-575/README.md)。

审核布局进一步收敛：赛前准备仅保留开房、规则、人员邀请与房间设置；切图通过 BP 图池，Mods、中止与计时/开赛使用 IRC 控制台。图池每行四个队伍操作横排，手机缩小按钮。执裁摘要最大固定宽度 48rem（小屏不超过容器），滚动至其位置后吸附在页头下方，只显示比分、BP 过程、重赛记录及胜局状态；长记录在各行内横向滚动。原有赛况录入和纠正功能保留在图池后的“记录与修正赛况”折叠区，不进入吸顶摘要。
