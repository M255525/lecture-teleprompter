# lecture-teleprompter — 講師現場提詞器

講台上給講師自己看的平板提詞器：排課（段落標題／分鐘／6 種類型／要點／講稿備註／可刪減）→ 上課（大字倒數、要點、下一段、表定時間清單、預計下課與落後分鐘燈號）→ 落後時建議刪減或壓縮、一鍵套用 → 課後時間報告（預計 vs 實際、建議、CSV、套回排課）。

2026-11-18 建立。使用者從「講師方向」清單挑第 8 項「講師現場提詞器」，規格由 Claude 決定；無序號。**2026-11-18 已上線** <https://m255525.github.io/lecture-teleprompter/>（使用者自己 `gh repo create … --push`；Claude 開 Pages、補 master 部署規則、workflow_dispatch 一次成功）。線上 `TP_BASE=https://m255525.github.io/lecture-teleprompter/ python tools/e2e_tp.py` 37 項全過。已加程式牆與 github-dashboard `REPO_META`、AI 工具導航（`teach`、`trainer` 情境）。本機預覽 port **8894**。上線改版要升 `service-worker.js` 的 `CACHE_NAME`。

## 檔案
- `data.js`：純函式引擎（`window.TP`，node 可 require），時間一律毫秒時間戳、`now` 由呼叫端傳入。
  - 排課：`schedule()`（時鐘時間、總長、和表定差）、`checks()`（超時／提早、連續講授 > `talkMax`、連續 > 120 分沒休息、空標題、建議標可刪減）、`parseOutline(text, hoursUnit)`（「標題 10」「｜20分」「1小時」；**hoursUnit 未指定時，所有沒單位的數字都 ≤ 8 就當小時**；`guessType` 依關鍵字猜類型）。
  - 上課：`startLive()`（**和表定開始差 > 30 分鐘就 `rel=true` 改用實際開始算表定下課**）、`status()`（剩餘、phase ok/warn/over、預計下課 `proj`、落後 `delta`、連續講授 `talkStreak` 往回累加 log 裡連續的講授段）、`next/prev/go`（`closeSeg` 寫 log，含暫停毫秒 `p`）、`togglePause`、`adjust`（最少 1 分）。
  - `suggestCuts(plan, live, late)`：後面的可刪減段落 ≤ 14 個時窮舉找「總和 ≥ 落後且最小」的組合；不夠就全刪再從後往前壓縮非講授段（`TYPES[].shrink` 比例上限、至少留 5 分）。講授不壓縮、目前這段不動。`applyCuts` 寫進 `live.skip`／`live.adj`。
  - `report()`／`reportCsv()`：每段實際時間（`actualMs` 每筆最少 0，防裝置時鐘倒退）、差異 ≥3 分給建議、刪減段落提示。
  - 3 個虛構範例（總長剛好、排課檢查零警告，測試會檢查）。
- `app.js`：畫面。localStorage `tp.` 前綴：`plan`、`plans`（30 個）、`live`（`{plan 快照, st}`，**重新整理會接著計時**）、`last`（報告來源）、`view`、`lfs`、`light`、`sound`、`note`、`fs`、`fold`、`warnSeen`、`marquee`。上課畫面 250ms `tick()` 只更新文字節點，換段才 `renderLive()`（**renderLive 要重設 `banKey`，否則新畫面的提示區是空的**）。鍵盤／簡報筆：PageDown/→/↓ 下一段、PageUp/←/↑ 上一段、`.`/B/空白 暫停、+/- 調時間，0.7 秒內連按只算一次。右側清單點兩下跳段。Wake Lock、全螢幕、Web Audio 提示音＋震動。
  - **⚠ 設定按鈕的 data 屬性不能叫 `data-fs`／`data-lfs`**：`<html>` 本身有 `data-fs`／`data-lfs`，click 事件 `closest()` 會一路找到 `<html>`，點畫面任何空白處都會開設定（2026-11-18 踩到，已改成 `data-ofs` 等）。
  - 「🎓 從講師型錄帶入」讀同源 `localStorage['ipc.state']`（[[instructor-profile-catalog]] 的課程大綱，小時單位），只有兩站都在 m255525.github.io 才看得到按鈕。
  - 測試掛鉤 `window._tp`：`skip(ms)` 快轉時間（不跨重新整理保留）、`resetNav()` 解除連按防呆。
- 畫面：後台舞台燈風（炭黑底、琥珀提示色、紅色 tally 燈、Roboto Mono 倒數數字）；上課畫面可切白底與三種字級。

## 驗證
- 改 `data.js` 跑 `node tools/test_engine.mjs`（58 項）。
- `python tools/e2e_tp.py [輸出資料夾]`（先開 8894；線上版設 `TP_BASE`）：警語、五件套、範例檢查、即時超時檢查、貼上大綱、存檔匯出、上課變黃變紅、落後刪減建議與套用、PageDown＋連按防呆、B 暫停、+ 調時間、講授提醒、重新整理接續、點兩下跳段、報告（刪減／未上到／建議／無負數）、CSV、套回排課、列印時間表、⚙、375px、點空白不開設定、無 console 錯誤。2026-11-18 全過（37 項）。
- 真實簡報筆、iPad Safari 的 Wake Lock／全螢幕、提示音實際音量未實測。

## 標準配備
跑馬燈（不可關）、⚙ 常用設定（收合：顯示、🔔 提示音與震動、⌨ 簡報筆與鍵盤、💾 我的課程、清除全部資料、關於本工具）、首訪警語＋頁面入口、`manual.html#creator`（改 `tools/manual_body.html` 後跑 `python tools/build_manual.py`）、PWA（`tools/make_icons.py`；上線改版升 `service-worker.js` 的 `CACHE_NAME`）、訪客計數器 `m255525.lectureteleprompter`。無序號。
