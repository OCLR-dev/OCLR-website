# Pick’em 玩家页文案（#1268）

> 由 `copy.mjs` 从 [wireframe.html](wireframe.html) 的 `COPY` 生成，请勿直接修改本文件。改动 `COPY` 后在仓库根目录执行 `node docs/design/pickem/copy.mjs`。

状态：提案，共 146 条新文案。中文用语交主办确认后才能进入 `messages/*.json`。术语取舍见 [README](README.md#术语)。

- `{name}` 是线框里的占位符。实作时以英文原文作为 `tr()` 来源，由 `npm run i18n:extract` 生成词条，占位符按现有目录写法改为 `{value0}` 等。
- 队名、轮次名与 osu! 名称保持原文，不翻译。时间由 `formatDate` 输出，不写进文案。

## 沿用现有词条

以下界面文字已在 `messages/*.json` 中，直接使用现有英文原文：

`Tournaments`、`Main page`、`Players`、`Teams`、`Draft results`、`Schedule`、`Pools`、`Statistics`、`Tournament navigation`、`Tournament menu`、`vs`、`Close`、`Round`、`All`、`Loading…`、`Retry`、`Sign in again`、`Continue with osu!`、`Points`、`Saving…`、`Saved`

## 导航与页首

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `nav_pickem` | 赛事预测 | 賽事預測 | Pick’em |
| `page_title` | 赛事预测 | 賽事預測 | Pick’em |
| `rules_link` | 玩法 | 玩法 | How it works |
| `intro` | 在截止前选出每场开放场次的胜方，猜中得 1 分。积分仅用于娱乐排名。 | 在截止前選出每場開放場次的勝方，猜中得 1 分。積分僅用於娛樂排名。 | Pick the winner of each open match before it closes. Each correct pick earns 1 point. Points are only for a fun ranking. |
| `tab_matches` | 本轮场次 | 本輪場次 | Matches |
| `tab_mine` | 我的预测 | 我的預測 | My picks |
| `tab_board` | 排行榜 | 排行榜 | Leaderboard |
| `filter_status` | 场次状态 | 場次狀態 | Match status |
| `filter_open` | 可预测 | 可預測 | Open |
| `filter_closed` | 已截止 | 已截止 | Closed |
| `filter_settled` | 已结算 | 已結算 | Settled |
| `picked_count` | 已预测 {picked}/{total} 场开放场次 | 已預測 {picked}/{total} 場開放場次 | {picked} of {total} open matches picked |
| `group_open` | 可预测 | 可預測 | Open for picks |
| `group_locked` | 已截止 | 已截止 | Closed |
| `group_done` | 已结算与作废 | 已結算與作廢 | Settled and voided |

## 玩法

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `rules_title` | 玩法 | 玩法 | How it works |
| `rules_more` | 查看全部规则 | 查看全部規則 | See all rules |
| `rules_1` | 在截止前选出开放场次的胜方，截止前可随时修改。 | 在截止前選出開放場次的勝方，截止前可隨時修改。 | Pick the winner of an open match. You can change your pick until it closes. |
| `rules_time` | 截止时间不晚于开赛时间。比赛提前时截止随之提前；比赛延后时截止时间不变。 | 截止時間不晚於開賽時間。比賽提前時截止隨之提前；比賽延後時截止時間不變。 | Picks close no later than the scheduled start. If a match moves earlier, picks close earlier too. If it moves later, the closing time stays the same. |
| `rules_2` | 允许平局的轮次才会出现平局选项。 | 允許平局的輪次才會出現平局選項。 | A draw option appears only in rounds that allow draws. |
| `rules_3` | 猜中得 1 分，猜错 0 分；同分并列。 | 猜中得 1 分，猜錯 0 分；同分並列。 | A correct pick earns 1 point and a wrong pick earns 0. Equal points share a rank. |
| `rules_4` | 只计算已审核并发布的官方赛果。赛果更正后重新计分；对局取消或对战组合变更的预测不计分。 | 只計算已審核並發布的官方賽果。賽果更正後重新計分；對局取消或對戰組合變更的預測不計分。 | Only reviewed and published official results count. Points are recalculated when a result is corrected. Picks for cancelled matches or changed matchups don’t count. |
| `rules_5` | 个人预测只有你自己能看到。截止后显示无记名的选择比例。 | 個人預測只有你自己能看到。截止後顯示無記名的選擇比例。 | Only you can see your picks. Anonymous totals appear after a match closes. |
| `rules_6` | 排行榜只显示选择加入的玩家。 | 排行榜只顯示選擇加入的玩家。 | The leaderboard only shows players who choose to appear on it. |

## 场次卡

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `starts_at` | 开赛 {time} | 開賽 {time} | Starts {time} |
| `closes_at` | 截止 {time} | 截止 {time} | Closes {time} |
| `closed_at` | 已于 {time} 截止 | 已於 {time} 截止 | Closed {time} |
| `time_left` | 还剩 {duration} | 還剩 {duration} | {duration} left |
| `dur_dh` | {d} 天 {h} 小时 | {d} 天 {h} 小時 | {d} d {h} hr |
| `dur_hm` | {h} 小时 {m} 分 | {h} 小時 {m} 分 | {h} hr {m} min |
| `dur_m` | {m} 分钟 | {m} 分鐘 | {m} min |
| `draw` | 平局 | 平局 | Draw |
| `options_legend` | 预测 {home} 对 {away} 的结果 | 預測 {home} 對 {away} 的結果 | Pick a result for {home} vs {away} |
| `status_open` | 可预测 | 可預測 | Open |
| `status_closing` | 截止确认中 | 截止確認中 | Closing |
| `status_closed` | 已截止 | 已截止 | Closed |
| `status_awaiting` | 待公布赛果 | 待公布賽果 | Awaiting result |
| `status_settled` | 已结算 | 已結算 | Settled |
| `status_voided` | 已作废 | 已作廢 | Voided |
| `status_saved` | 已保存 | 已儲存 | Saved |
| `save_pick` | 保存预测 | 儲存預測 | Save pick |
| `hint_choose` | 选择一支队伍后保存。 | 選擇一支隊伍後儲存。 | Choose a team, then save. |
| `hint_choose_draw` | 选择一个结果后保存。 | 選擇一個結果後儲存。 | Choose a result, then save. |
| `selected_unsaved` | 已选 {team}，尚未保存。 | 已選 {team}，尚未儲存。 | {team} selected. Not saved yet. |
| `changed_unsaved` | 已改选 {team}，尚未保存。目前保存的是 {saved}。 | 已改選 {team}，尚未儲存。目前儲存的是 {saved}。 | Changed to {team}. Not saved yet. Your saved pick is {saved}. |
| `receipt` | 你的预测：{team} · {time} 保存 | 你的預測：{team} · {time} 儲存 | Your pick: {team} · saved {time} |
| `editable_until` | {time} 前可修改。 | {time} 前可修改。 | You can change it until {time}. |
| `live_saving` | 正在保存预测… | 正在儲存預測… | Saving your pick… |
| `live_saved` | 预测已保存：{team} | 預測已儲存：{team} | Pick saved: {team} |
| `err_network` | 未能保存。你的选择仍保留，请重试。 | 未能儲存。你的選擇仍保留，請重試。 | Couldn’t save. Your choice is still selected. Try again. |
| `err_stale` | 此预测已在其他页面或设备上更新，目前保存的是 {saved}。请确认后重新保存。 | 此預測已在其他頁面或裝置上更新，目前儲存的是 {saved}。請確認後重新儲存。 | This pick was updated on another page or device. Your saved pick is {saved}. Check your choice and save again. |
| `err_closed` | 此场次已截止，本次选择未保存。 | 此場次已截止，本次選擇未儲存。 | This match closed before your pick was saved. |
| `err_session` | 登录已失效。重新登录后会回到本页，未保存的选择会保留。 | 登入已失效。重新登入後會回到本頁，未儲存的選擇會保留。 | Your session has expired. Sign in again to return to this page. Your unsaved choice will be kept. |
| `err_voided` | 此场次的预测已作废，本次选择未保存。 | 此場次的預測已作廢，本次選擇未儲存。 | Picks for this match were voided. Your choice wasn’t saved. |
| `closing_wait` | 已到截止时间，正在向服务器确认。 | 已到截止時間，正在向伺服器確認。 | Closing time reached. Confirming with the server. |
| `live_closed` | 此场次已截止。 | 此場次已截止。 | This match is now closed. |
| `dist_caption` | 共 {count} 人预测 · 截止后显示的无记名比例 | 共 {count} 人預測 · 截止後顯示的無記名比例 | {count} picks · anonymous totals shown after closing |
| `dist_zero` | 尚无预测 | 尚無預測 | No picks yet |
| `dist_zero_body` | 截止前没有人预测此场次。 | 截止前沒有人預測此場次。 | Nobody picked this match before it closed. |
| `dist_votes` | {count} 票 | {count} 票 | {count} picks |
| `your_pick` | 你的预测 | 你的預測 | Your pick |
| `no_pick` | 你未预测此场次。 | 你未預測此場次。 | You didn’t pick this match. |
| `awaiting_body` | 预测已锁定，正式赛果发布后计分。 | 預測已鎖定，正式賽果發布後計分。 | Picks are locked. Points are added after the official result is published. |
| `winner_tag` | 胜方 | 勝方 | Winner |
| `result_win` | 赛果：{team} 胜 {score} | 賽果：{team} 勝 {score} | Result: {team} won {score} |
| `result_draw` | 赛果：平局 {score} | 賽果：平局 {score} | Result: draw {score} |
| `pts_hit` | 猜中 +1 | 猜中 +1 | Correct +1 |
| `pts_miss` | 未猜中 0 | 未猜中 0 | Missed 0 |
| `pts_none` | 未预测 | 未預測 | No pick |
| `pts_void` | 不计分 | 不計分 | Not scored |
| `pts_pending` | 待计分 | 待計分 | Pending |
| `view_result` | 查看赛果 | 查看賽果 | View result |
| `view_match` | 查看对局 | 查看對局 | View match |
| `revised` | 赛果已更正，积分已重新计算。 | 賽果已更正，積分已重新計算。 | The result was corrected and points were recalculated. |
| `withdrawn` | 原赛果已撤回，积分暂时移除，等待有效赛果。 | 原賽果已撤回，積分暫時移除，等待有效賽果。 | The published result was withdrawn. Points are removed until a valid result is published. |
| `void_cancelled` | 对局已取消，此场次的预测不计分。 | 對局已取消，此場次的預測不計分。 | The match was cancelled. Picks for it don’t count. |
| `void_matchup` | 对战组合已变更，原预测不计分。如重新开放，需要重新预测。 | 對戰組合已變更，原預測不計分。如重新開放，需要重新預測。 | The matchup changed, so earlier picks don’t count. If the match reopens, you’ll need to pick again. |
| `void_no_outcome` | 正式赛果没有可计分的胜负，此场次不计分。 | 正式賽果沒有可計分的勝負，此場次不計分。 | The official result has no scorable outcome, so this match isn’t scored. |
| `resched_later` | 开赛时间已改为 {time}，截止时间保持 {close}。 | 開賽時間已改為 {time}，截止時間保持 {close}。 | The match moved to {time}. Picks still close at {close}. |
| `resched_earlier` | 比赛提前，截止时间已改为 {close}。 | 比賽提前，截止時間已改為 {close}。 | The match moved earlier. Picks now close at {close}. |
| `visitor_card_hint` | 登录后可预测 | 登入後可預測 | Sign in to pick |

## 侧栏：我的进度与榜单摘要

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `progress_title` | 我的进度 | 我的進度 | My progress |
| `round_points` | 本轮积分 | 本輪積分 | Round points |
| `season_points` | 全季积分 | 全季積分 | Season points |
| `hits` | 猜中 {hit}/{settled} 场 | 猜中 {hit}/{settled} 場 | {hit} of {settled} correct |
| `next_close` | 最近截止 {time} | 最近截止 {time} | Next closing {time} |
| `rank_round` | 本轮第 {rank} 名 | 本輪第 {rank} 名 | Round rank {rank} |
| `rank_round_tied` | 本轮并列第 {rank} 名 | 本輪並列第 {rank} 名 | Tied for {rank} this round |
| `not_listed` | 未加入排行榜 | 未加入排行榜 | Not on the leaderboard |
| `board_summary` | 本轮排行榜 | 本輪排行榜 | Round leaderboard |
| `full_board` | 查看完整排行榜 | 查看完整排行榜 | Full leaderboard |

## 我的预测

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `mine_match` | 场次 | 場次 | Match |
| `mine_pick` | 我的预测 | 我的預測 | My pick |
| `mine_result` | 赛果 | 賽果 | Result |
| `mine_points` | 得分 | 得分 | Points |
| `mine_status` | 状态 | 狀態 | Status |
| `mine_caption` | 只有你能看到这些预测。 | 只有你能看到這些預測。 | Only you can see these picks. |
| `mine_empty_title` | 你还没有预测 | 你還沒有預測 | You haven’t made any picks |
| `mine_empty_body` | 选择开放场次的胜方后，记录会显示在这里。 | 選擇開放場次的勝方後，紀錄會顯示在這裡。 | Your picks appear here after you choose winners for open matches. |
| `go_open` | 前往可预测场次 | 前往可預測場次 | Go to open matches |
| `result_pending` | 待公布 | 待公布 | Pending |
| `dash` | — | — | — |

## 排行榜与显示设置

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `scope_round` | 本轮 | 本輪 | This round |
| `scope_season` | 全季 | 全季 | Season |
| `scope_label` | 排行范围 | 排行範圍 | Leaderboard scope |
| `lb_rank` | 名次 | 名次 | Rank |
| `lb_player` | 玩家 | 玩家 | Player |
| `lb_hits` | 猜中 | 猜中 | Correct |
| `lb_tied` | 并列 | 並列 | Tied |
| `lb_tied_sr` | 并列第 {rank} 名 | 並列第 {rank} 名 | Tied for rank {rank} |
| `lb_you` | 你 | 你 | You |
| `lb_jump` | 定位到我 | 定位到我 | Jump to my rank |
| `lb_self` | 你的名次：第 {rank} 名 · {points} 分 | 你的名次：第 {rank} 名 · {points} 分 | Your rank: {rank} · {points} pts |
| `lb_self_tied` | 你的名次：并列第 {rank} 名 · {points} 分 | 你的名次：並列第 {rank} 名 · {points} 分 | Your rank: tied for {rank} · {points} pts |
| `lb_jumped` | 已显示你所在的位置：第 {rank} 名。 | 已顯示你所在的位置：第 {rank} 名。 | Showing your position: rank {rank}. |
| `lb_back_top` | 回到榜首 | 回到榜首 | Back to the top |
| `board_season` | 全季排行榜 | 全季排行榜 | Season leaderboard |
| `lb_settled_round` | {round} · 已结算 {settled}/{total} 场 | {round} · 已結算 {settled}/{total} 場 | {round} · {settled} of {total} matches settled |
| `lb_settled_season` | 全季已结算 {settled} 场 | 全季已結算 {settled} 場 | {settled} matches settled this season |
| `lb_load_more` | 加载更多 | 載入更多 | Load more |
| `lb_rule` | 至少有一场预测结算后才会进入排行榜。 | 至少有一場預測結算後才會進入排行榜。 | Players appear after at least one of their picks is settled. |
| `lb_empty_title` | 排行榜尚未开始 | 排行榜尚未開始 | No leaderboard yet |
| `lb_empty_body` | 第一场预测结算后会显示排行榜。 | 第一場預測結算後會顯示排行榜。 | The leaderboard appears after the first match is settled. |
| `lb_not_listed_row` | 你未加入排行榜。你的积分：本轮 {round} 分，全季 {season} 分。 | 你未加入排行榜。你的積分：本輪 {round} 分，全季 {season} 分。 | You’re not on the leaderboard. Your points: {round} this round, {season} this season. |
| `vis_title` | 在排行榜显示我 | 在排行榜顯示我 | Show me on the leaderboard |
| `vis_body` | 开启后，排行榜会显示你在本站的 osu! 公开名称（{name}）和积分。可以随时关闭，关闭后立即从排行榜移除；你仍能看到自己的积分。 | 開啟後，排行榜會顯示你在本站的 osu! 公開名稱（{name}）和積分。可以隨時關閉，關閉後立即從排行榜移除；你仍能看到自己的積分。 | When on, the leaderboard shows your public osu! name on this site ({name}) and your points. You can turn it off at any time to be removed right away. You can still see your own points. |
| `vis_on` | 已显示在排行榜 | 已顯示在排行榜 | Shown on the leaderboard |
| `vis_off` | 未显示在排行榜 | 未顯示在排行榜 | Not shown on the leaderboard |
| `vis_saving` | 正在更新… | 正在更新… | Updating… |
| `vis_conflict` | 此设置已在其他页面更改，已显示最新状态。 | 此設定已在其他頁面更改，已顯示最新狀態。 | This setting was changed on another page. The latest setting is shown. |
| `vis_failed` | 未能更新显示设置，请重试。 | 未能更新顯示設定，請重試。 | Couldn’t update this setting. Try again. |

## 访客

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `visitor_title` | 使用 osu! 登录后参与预测 | 使用 osu! 登入後參與預測 | Sign in with osu! to make picks |
| `visitor_body` | 登录后会回到本页。登录不会报名赛事。 | 登入後會回到本頁。登入不會報名賽事。 | You’ll return to this page after signing in. Signing in doesn’t register you for the tournament. |
| `visitor_open` | 开放中的场次 | 開放中的場次 | Open matches |
| `visitor_mine` | 登录后查看你的预测与积分。 | 登入後查看你的預測與積分。 | Sign in to see your picks and points. |
| `visitor_board` | 登录后查看完整排行榜。 | 登入後查看完整排行榜。 | Sign in to see the full leaderboard. |

## 页面级状态

| 键 | zh-Hans | zh-Hant | en |
| --- | --- | --- | --- |
| `empty_open_title` | 目前没有可预测的场次 | 目前沒有可預測的場次 | No matches are open for picks |
| `empty_open_body` | 新场次开放后会显示在这里。 | 新場次開放後會顯示在這裡。 | New matches appear here when they open. |
| `view_schedule` | 查看赛程 | 查看賽程 | View schedule |
| `empty_filter_title` | 此筛选下没有场次 | 此篩選下沒有場次 | No matches for this filter |
| `show_all` | 显示全部场次 | 顯示全部場次 | Show all matches |
| `load_failed_title` | 暂时无法加载预测数据 | 暫時無法載入預測資料 | Pick’em data couldn’t be loaded |
| `load_failed_body` | 请稍后重试。已保存的预测不受影响。 | 請稍後重試。已儲存的預測不受影響。 | Try again shortly. Saved picks are not affected. |
| `session_banner` | 登录已失效。请重新登录，完成后会回到本页。 | 登入已失效。請重新登入，完成後會回到本頁。 | Your session has expired. Sign in again to come back to this page. |
| `ineligible_banner` | 你可以查看场次与赛果，但暂不符合本届预测的参与资格。 | 你可以查看場次與賽果，但暫不符合本屆預測的參與資格。 | You can view matches and results, but you aren’t eligible to make picks in this edition. |
| `refreshed_banner` | 场次信息已更新。 | 場次資訊已更新。 | Match information was updated. |
