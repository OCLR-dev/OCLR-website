# Referee match and recovery acceptance (#525, #526)

This is an explicitly invoked cross-process rehearsal. It uses a production
website build, PostgreSQL, Chromium desktop/mobile, and the **actual pinned
OCLR IRC Main classes** (`OclrSession`, `OclrRelay`, `IrcSession` and the SQLite
creation journal) in a separate Node process. HTTP authorization/consent,
loopback callback, Bearer reads, relay requests and TCP IRC messages cross real
process boundaries. Only identities, provider responses and the IRC server are
synthetic. No live osu! consent, real Bancho room, Electron renderer or native
Windows/Linux lifecycle acceptance is implied.

## Reproduce

Use Node 24, `npm ci` in both checkouts, an explicitly isolated database with a
`test` name segment, and an installed Playwright Chromium or Chrome channel.
Migrate that database and build the website first. Do not use the persistent
preview database. The suite truncates **only its explicitly supplied test DB**
before each scenario; run it without other tests sharing that database.

```sh
export TEST_DATABASE_URL='postgresql://test-user@127.0.0.1:55481/oclr_acceptance_test'
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm run build
export OCLR_IRC_CHECKOUT='/absolute/path/to/OCLR-IRC'
export OCLR_IRC_EXPECTED_SHA='4e5afac132b3ad70ab70acb926664227c7d57bd5'
PLAYWRIGHT_CHANNEL=chrome npm run test:referee:acceptance
```

The runner rejects a different desktop SHA or modified Main/shared sources.
The suite owns `127.0.0.1:31475`, checks for port occupancy and refuses to reuse
an existing server. It starts/stops only its own website and desktop processes.
IRC and authorization callback ports are allocated by the OS on loopback.
The worker advances its test-only monotonic clock to exercise unsupported-command
acknowledgement timeouts without a 15-second wait for every invitation. It then
uses the real explicit operation-review entry point. Database timestamps are
backdated only for the expiry fault cases. Neither control exists in production.
Temporary SQLite/provider/server-log files are removed at teardown. Browser
traces and automatic screenshots are disabled so callback codes, tokens and cookies cannot
enter those artifacts. An explicit synthetic workspace screenshot is taken only
after authorization, never on a callback/consent page. Attachments contain scenario/commit/score/status evidence,
never credentials or authorization responses. Production host settings are not
changed. This suite is not added to ordinary push/PR CI.

## Match matrix (#525)

Both desktop and mobile run the same scenarios, using two teams of six saved
English identities, three active players per game, BO9 and
NM5 / HD2 / HR2 / DT3 / FM2 / TB1.

| Step                             | Assertion                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser consent and desktop read | Actual PKCE, one-time exchange, loopback callback and strict desktop response schemas; assigned fixture selected                                      |
| Website room creation            | One `!mp make` TCP write, verified room History and referee list, binding recovered after creation                                                    |
| Preparation                      | All twelve saved username invitations and saved rule command cross HTTP/TCP once each; unsupported replies remain unknown until explicit review       |
| Order                            | Same team may independently hold first Ban and first Pick; explicit Apply persists                                                                    |
| Ban/undo                         | Two Bans, reverse undo restores availability, original event retained, re-record succeeds                                                             |
| Pick and IRC                     | One saved selection per click; notice/map/Mods sequence has exact scoped receipts and never adds a second selection                                   |
| Replay and correction            | Aborted attempt, tied replay, valid second replay; third replay rejected without revision change; manual winner correction recomputes score           |
| Normal game                      | Bound MP polling updates the next completed game; provider read uses the real parser/scorer; FM/TB and replay remain manual                           |
| Early finish                     | 5:1, no more selections after completion                                                                                                              |
| Tiebreaker                       | 4:4 reaches the reserved TB, final 5:4                                                                                                                |
| Reload                           | Score and attempts restored without another TCP command                                                                                               |
| Saved MP review                  | Tied attempt in the first MP; completed series in a second MP; exact import/game/fingerprint links, no beatmap-only pairing                           |
| Publication                      | Referee submission remains private, Referee approval denied, Admin UI approve/publish required; public score and downstream winner resolve afterwards |

Multiple MP evidence here means the first tied attempt belongs to one room and
the full valid series after that replay belongs to the next room. It does not
claim that the existing single-source official-result submission can combine a
winning series split across separate MP rooms.

## Fault and handoff matrix (#526)

| Injection                                    | Expected recovery                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Browser queue response lost after commit     | Retry same key returns one command; changed payload conflicts; exactly one socket write                 |
| Command claim response lost after commit     | Desktop never receives command, no socket write; `sending` becomes `unknown`; no automatic replay       |
| Sent without Bancho response                 | Terminal `unknown` after deadline; unresolved local operation requires explicit review                  |
| Confirmation HTTP response lost after commit | Website preserves `confirmed`; reconnect cannot send the command again                                  |
| Queued command never claimed                 | `failed` after deadline even if desktop stops polling; saved-only GET does not write                    |
| Heartbeat expiry                             | Website reports disconnected and preserves saved ledger                                                 |
| Website unavailable and process restart      | Real HTTP fails while down; same database ledger and terminal statuses recover after restart            |
| Competing browsers                           | One in-flight command; one success and one revision conflict, no duplicate selection                    |
| Legacy intent changed after send             | Exact Bancho response yields `record_failed`, saved revision/score unchanged                            |
| Assignment/role/session revocation           | Subsequent control/read denied; old desktop clears private panel                                        |
| Successor                                    | New browser consent and explicit binding restore the saved ledger; old connection cannot regain control |
| Cross-edition / fixture switch               | Wrong edition denied; choosing another assigned fixture stops the previous relay                        |

## Defect found

Previously a saved-only IRC read exposed raw `queued`/`sending`/`sent` rows even
after their deadlines. If the desktop stopped polling, the UI could stay busy
forever. Receipt processing also preceded expiry, allowing an overdue receipt
to revive a command before the timeout check. Reads now derive expired status
without mutating storage; relay transactions persist expiry **before** handling
receipts. They do not retry IRC commands or overwrite a human BP decision.

The mobile rehearsal also reproduced the fixed IRC console intercepting the
Apply order button. Below 700px the console is now an ordinary grid row before
the workflow, with its existing bounded message scroll area. It no longer covers
workflow controls; desktop positioning stays fixed. The browser scenarios use
normal clicks, never forced clicks or script activation to bypass an overlay.

The rehearsal result and exact tested website commit are recorded in the PR and
issues; current CI status is separate. The parent #312/#317 retain their remaining
real-provider, platform and complete appearance/review gates.
