# 網站第二版 PR 說明（草稿，隨進度更新）

依 `docs/handoff_web_v2.md` 開發。介面依 Hallmark 流程：app screen、Wayfind platform 淺色、只用 `tokens.css` 既有 token。

## 請確認

### 1. 情境頁平均需求的分母 D（開工前確認）

目前規劃：

- D = 選定期間、選定日別中「有紀錄的日數」（每日旅次不是 `null` 的日子）。
- `d_h` = 該小時旅次總和 ÷ D。
- 某小時在某個有紀錄日沒有出現：當作那天該小時 0 旅次，分子不加、分母照算。
- 某小時在整個期間的有紀錄日裡都沒出現：`d_h = null`，圖上留缺口，不當 0。

會受影響的時段（2025 年實際資料）：

| 日別 | D | 小時 | 出現天數 | ÷ D（目前規劃） | ÷ 出現天數（替代做法） |
|---|---|---|---|---|---|
| 平日 | 260 | 5 時 | 244 | 22.4 | 23.8 |
| 平日 | 260 | 21 時 | 250 | 25.2 | 26.2 |
| 平日 | 260 | 22 時 | 186 | 4.8 | 6.7 |
| 平日 | 260 | 23 時 | 3 | 0.0（3 次 ÷ 260） | 1.0 |
| 週末 | 104 | 5 時 | 101 | 17.0 | 17.5 |
| 週末 | 104 | 22 時 | 79 | 6.5 | 8.5 |

其餘時段差異小於 0.1。目前規劃的風險：沒出現可能是「當天沒開這班」而不是「有開但沒人搭」，會讓 22、23 時的需求偏低。替代做法則會高估冷門時段。請選一種。

### 2. 預測頁的尖峰低估率（第 4 段，請你和模型組確認）

尖峰低估率 = 在實際值 ≥ 期間 P90 的時段中，Σmax(0, y − ŷ) ÷ Σy。

待確認：P90 是對「valid／test 各自期間的所有 date×hour 實際值」計算，還是只取有營運的時段（實際值 > 0 或有紀錄）？目前規劃：各 split 分開算，只用有實際值的時段。

## 第 1 段：InfoTip 與現有頁面精簡（已完成）

- 新增 `frontend/src/components/InfoTip.tsx` 與 `frontend/src/styles/infotip.css`。
  - 觸發元素是 `<button type="button">`，`aria-describedby` 指向 `role="tooltip"` 的說明。
  - 鍵盤 focus 立即打開；滑鼠停留 800ms 打開（Hallmark gate 17：hover 與 focus 延遲不可相同）；觸控點一下開、點外面或再點一下關；Esc、失焦關閉。
  - 兩種外觀：方格裡一個「i」（Wayfind 的站牌資訊標誌，取代 ⓘ 字元，避免系統字型不一致）、包住術語的虛線底線。
  - 浮層掛在 `body`，不會被表格捲動容器裁切；依視窗邊緣上下翻轉、左右夾住。`z-index: var(--z-tooltip)`、最寬 32ch、`--text-sm`、淡入 `--dur-micro`，減少動態時不動畫。
  - 圖示 20px，`::before` 把觸控範圍放大到 44px。
- 新增 `frontend/src/components/Panel.tsx`（標題、一行副標、標題旁 InfoTip、右側圖例），歷史頁與品質頁共用。
- 歷史頁：副標改為「單位：次」「期間累計・次」「有紀錄日平均・次/日」；圖例「無紀錄」「灰底＝無紀錄」旁加 InfoTip；「週末」加虛線 InfoTip；最高／最低改成一行事實列；空狀態改成一行加「改看 2025 年」按鈕。
- 品質頁：限制條列每條一行，說明進 InfoTip；`/api/quality` 的 `limitations` 改為 `[{label, detail}]`。
- 頁尾只留「資料：南投客運 6670 刷卡資料 2024–2025・Asia/Taipei」，年份由 `/api/meta` 的資料期間產生；「刷卡資料」加 InfoTip「刷卡旅次不等於獨立乘客人數」。
- 錯誤狀態：標題、伺服器訊息一行、處理方式進 InfoTip、重試按鈕。

驗證：

- `python -m pytest -q`：24 passed。
- `npm run build`、`npm run lint`：無警告。
- Headless Chrome（puppeteer-core）檢查歷史頁 11 個、品質頁 21 個 InfoTip：每個都能用 Tab 打開且在視窗內、Esc 關閉、hover 800ms 才開、390px 點擊開關、點外面關閉、整頁 `scrollWidth = 390`。
- Hallmark `sloplint --scope app --render`（歷史頁、品質頁）：0 FAIL、0 WARN；waive 39b（20px 圖示加 44px 觸控範圍）、answered F25（寬表首欄固定）、dismissed F4（選中的期間格不是第二個主要按鈕）。另有 3 筆「waive 64 被拒」是 sloplint 把 `app.css` 的 waiver 套到 `.tsx` 檔時讀不到 tokens，`app.css` 本身接受。
