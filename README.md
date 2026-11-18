# 客運順起來｜P0 歷史需求儀表板

南投客運 6670D 刷卡資料的決策輔助工具，第一版（P0）。依 `bus_website_handoff.md` v1.0 開發。

- 這是**歷史資料離線展示**，不是即時公車追蹤，也不是自動排班系統。
- 核心操作：選擇日期 → 查看旅次分布 → 查看資料限制 → 匯出討論資料。
- 介面繁體中文，時間採 Asia/Taipei。
- 前端 React＋TypeScript＋Vite＋ECharts，後端 FastAPI＋Pandas。正式環境由 FastAPI 同時提供 `/api/*` 與前端靜態檔。

## 完成與待完成

| 範圍 | 狀態 |
|---|---|
| P0 日期篩選（起訖、2024／2025／全部期間快捷、URL 還原、套用） | 完成 |
| P0 摘要列、每日趨勢、每小時分布、週一至週五／週末比較、每日明細（排序、分頁） | 完成 |
| P0 CSV 匯出（每日、每小時明細、小時分布，UTF-8 BOM） | 完成 |
| P0 資料品質頁（方向未分類、無紀錄日期、現有報告與新增規則、每月筆數、限制） | 完成 |
| 品質補強：乘車超過 6 小時、上下車同站（`scripts/quality_checks.py`） | 完成，結果 100／2,623 筆，重疊 30 筆 |
| 載入、成功、無資料、錯誤四種狀態；錯誤可重試 | 完成 |
| Dockerfile、`.env.example`、正式啟動 `python -m backend.serve` | 已撰寫；**本機無 Docker，映像尚未 build 驗證** |
| P1 分方向、預測、回測 | 未開始。導覽列不放；方向固定「全部方向（尚未分類）」 |
| P2 班次情境比較 | 未開始。導覽列不放 |
| GCP Cloud Run 部署、存取控制 | 未部署，待團隊提供 project ID、區域、存取對象與資料公開範圍 |

## 實際測試環境

| 項目 | 版本 |
|---|---|
| 作業系統 | Windows 11 Home |
| Python | 3.12.16（Miniconda `bus_forecast` 環境） |
| Node.js／npm | 26.13.0／11.20.0 |
| Vite／React／ECharts／TypeScript | 8.3.8／19.3.1／6.1.0／7.0 |
| FastAPI／uvicorn／pandas | 0.162.7／0.54.0／3.1.1 |

## 安裝

### 1. Python（Windows PowerShell）

```powershell
conda activate bus_forecast        # 沒有這個環境才先 conda create -n bus_forecast python=3.12 -y
python -m pip install -r requirements.txt        # 只跑網站
python -m pip install -r requirements-dev.txt    # 另外要跑測試或整理原始 Excel 時
```

### 2. 前端

```powershell
cd frontend
npm ci
```

### 3. 放入資料

把整理後的彙整檔放在 `data/prepared/`（本資料夾已附上 2026-11-14 這批，版本 `prep-374dddeb`）：

| 檔案 | 網站用途 | 必要 |
|---|---|---|
| `daily_trips.csv` | 每日旅次 | 必要 |
| `hourly_all_directions.csv` | 每小時旅次（兩方向合計） | 必要 |
| `dates_without_records.csv` | 無紀錄日期對帳 | 必要 |
| `quality_report.json` | 現有品質報告 | 必要 |
| `sheet_audit.csv` | 每月原始筆數 | 必要 |
| `station_mapping_review.csv` | 站序與站名核對 | 必要 |
| `hourly_by_direction.csv` | 計算方向未分類筆數 | 選用 |
| `direction_map_template.csv` | 方向對照表填寫進度 | 選用 |
| `quality_checks.json` | 新增品質規則結果 | 選用；缺少時品質頁顯示「新增規則待重算」 |

`cleaned_trips.csv`（84 萬筆逐筆資料）**不需要也不應該**放進網站資料夾；只有離線品質腳本會讀它。缺少必要檔時，API 回 503 並寫明缺哪個檔，畫面顯示錯誤與重試，不會用空資料或假資料代替。

## 啟動

### 開發模式（兩個終端機）

```powershell
# 終端機 1：後端（專案根目錄）
conda activate bus_forecast
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5000

# 終端機 2：前端
cd frontend
npm run dev
```

開啟 <http://127.0.0.1:5173>。Vite 會把 `/api` 代理到 5000；前端程式只用相對路徑 `/api`，沒有寫死 localhost。

### 正式模式（單一服務）

```powershell
cd frontend; npm run build; cd ..
$env:PORT = "5000"; python -m backend.serve
```

開啟 <http://127.0.0.1:5000>。`backend.serve` 監聽 `0.0.0.0` 與 `PORT`（預設 8080），不使用 `--reload`。環境變數見 `.env.example`；也可用 `python -m uvicorn backend.main:app --env-file .env` 載入。

## 更新資料

1. 原始 Excel 放 `data/raw/`（不進 Git、不進容器）。
2. 產生彙整檔：
   ```powershell
   python scripts/prepare_bus_data.py --input-dir data/raw --output-dir data/prepared
   ```
3. 重算新增品質規則（必須在第 2 步之後，版本才會一致）：
   ```powershell
   python scripts/quality_checks.py --trips data/prepared/cleaned_trips.csv --prepared-dir data/prepared
   ```
   本次是用 `--trips ../prepared/cleaned_trips.csv` 指向交接資料夾中的逐筆檔產生。
4. 網站每 5 秒檢查一次彙整檔大小與修改時間，有變動才重新載入，不需要重啟；也不會在每次請求重讀檔案。

**資料版本**：`prep-` 加上 6 個必要彙整檔內容的 SHA-256 前 8 碼（`backend/services/versioning.py`）。品質腳本寫入同一個版本；網站發現版本不同或總筆數對不上時，把新增規則標為「待重算」，不顯示舊數字。

## API

所有日期 `YYYY-MM-DD`、兩端皆含；未知值為 `null`，不以 0 代替。互動文件在 `/api/docs`。

| API | 說明 |
|---|---|
| `GET /api/health` | 資料就緒回 200；資料缺漏回 503 |
| `GET /api/meta` | 路線、資料期間、版本、快捷期間、方向選項（只有 `all`） |
| `GET /api/history?start&end&route=6670D&direction=all` | `data_version`、`filters`、`status`、`summary`、`daily`、`hourly`、`weekday_summary`、`no_record_dates`、`warnings` |
| `GET /api/quality` | 方向、無紀錄日期、現有與新增檢查、每月筆數、站序對照、限制 |
| `GET /api/export?start&end&route&direction&kind` | `kind` = `daily`、`hourly`（日期×小時明細，只列有紀錄時段）、`hourly_summary`（期間各小時累計） |

錯誤格式 `{"detail": {"code", "message", "field"}}`：無效參數 422（`invalid_range`、`invalid_date`、`out_of_period`、`unsupported_route`、`unsupported_direction`、`unsupported_kind`、`missing_date`）；有效條件但無紀錄回 200 且 `status: "no_records"`；來源檔缺漏 503 `data_unavailable`。

瀏覽器只收到彙整後的數字；不傳送逐筆資料、卡號、司機編號或車號（有測試檢查）。品質範例只含上下車時間、站名、乘車時間與來源工作表列號。

## 遵守的資料定義

- `trips` 是刷卡旅次，不是獨立乘客、車上人數或沒搭上車的人。
- 無紀錄日回 `trips: null`、`status: no_record`；每日圖留缺口並以琥珀細帶標記，明細顯示「無紀錄，未補 0」。
- 每小時圖是「期間各小時累計」，不是平均每日需求；0 至 4 時在資料中從未出現，標為無紀錄（未區分非營運或零旅次）。
- 星期比較用「有紀錄日平均」並附樣本天數；週末只指週六、週日，不是國定假日。
- 方向全為 UNKNOWN，方向控制固定「全部方向（尚未分類）」，沒有可選但無作用的選項。
- 不刪除低運量日、尖峰、疑似重複或異常紀錄；異常只標記與彙總。兩項新增規則可能重疊（30 筆），不相加。

## 測試結果（2026-11-14）

```powershell
python -m pytest -q        # 24 passed
cd frontend; npm run build # tsc 與 vite build 通過
npm run lint               # oxlint 0 warning
```

測試涵蓋：全期間 840,431、2024 年 423,365（361 天）、2025 年 417,066（364 天）、每日與每小時加總一致、2024-07-24 單日回 `null` 而非 0、6 個無紀錄日期、0 至 4 時為 `null`、星期平均公式、7 種 422 參數錯誤、匯出 BOM／欄位／與篩選一致、品質頁數字（100、2,623）、工作表名稱保留 `2024.10`、回應不含車號等欄位、缺檔回 503、彙整檔變更後新增規則標為待重算、未知 API 回 404。

## 驗收清單

| 項目 | 結果 |
|---|---|
| 另一台電腦依 README 安裝、放資料並啟動 | 本機依本文件流程跑通；**尚未在第二台電腦驗證** |
| 全期間全方向總旅次 840,431 | 通過（API 測試＋畫面） |
| 2024／2025 為 423,365／417,066 | 通過 |
| 篩選後摘要、每日圖、小時圖、明細、匯出同一組條件 | 通過；匯出永遠使用已套用條件（URL 中的值） |
| 單選 2024-07-24 顯示無紀錄，不顯示零需求 | 通過，見 `docs/screenshots/desktop_2024-07-24_no_record.png` |
| 起日大於迄日、檔案不存在、API 失敗有明確處理 | 通過，見 `desktop_invalid_range.png`、`desktop_missing_data_error.png` |
| 不能選「往日月潭／往臺中」 | 通過，方向為固定值 |
| 週內比較用有紀錄日平均、附樣本日數 | 通過 |
| 舊品質報告零旗標不被說成「全部資料無異常」 | 通過，品質頁明寫「不代表資料完全無異常」 |
| 每張圖有期間、單位、tooltip；缺值不當 0 | 通過 |
| CSV 可在 Excel 讀中文、內容與篩選一致 | 檔案含 UTF-8 BOM 並經測試；**未實際用 Excel 開啟** |
| 桌面與 390px 手機可操作、鍵盤焦點可見 | 截圖確認 390px 無整頁橫向溢出（scrollWidth = 390）、表格在容器內捲動；所有互動元件有 `:focus-visible` 樣式，**未做完整鍵盤操作錄影** |
| 瀏覽器沒有收到逐筆資料、卡號、司機編號 | 通過（測試檢查回應內容） |
| 未完成功能沒有假結果；正式版沒有 localhost API | 通過；前端只用相對路徑 `/api` |

## 介面設計（Hallmark）

- 依交接文件使用 [Nutlope/Hallmark](https://github.com/Nutlope/hallmark) v2.0.0，commit `04977e15f3dfd6ee4b74c887dac3eb52665d6c92`（2026-11-11）。只閱讀其 `SKILL.md`、`references/flow.md` App screens 等文件作為設計指引；未安裝進專案，執行時也不依賴它。
- 範圍：app screen（操作型儀表板，不做行銷首頁的標語、照片與宣傳段落）。
- 主題：Wayfind（交通、站務、時刻表類），platform 淺色配色，手動選定（`deal: manual`，方向 A 淺色專業儀表板）。冷灰紙色底、深墨色字、單一鈷藍強調色（主要按鈕、資料序列、目前狀態）；琥珀色只用在墨色告示牌數字與「無紀錄」標記底色。字體 Chivo Mono（自帶於前端，不連外部字型服務），中文退回系統黑體；全部數字為等寬數字。
- 所有顏色、字體、間距集中在 `frontend/src/styles/tokens.css`；圖表顏色在執行時從 tokens 讀取，不寫死色碼。
- Hallmark 的 `sloplint.mjs` 與 `theme.mjs` 腳本**沒有執行**（本次工作環境不允許執行下載來的腳本）。Floor 規則改為人工逐條對照，並用 headless Chrome 截圖檢查桌面 1440px 與手機 390px。檢查紀錄寫在 `frontend/src/styles/app.css` 開頭的 stamp。

## 部署準備（GCP Cloud Run）

尚未部署。建議流程（需團隊先確認 project ID、區域、存取對象、資料是否可公開與預算通知）：

```powershell
docker build -t bus-dashboard .
docker run --rm -p 8080:8080 bus-dashboard     # 本機先驗收
# 確認後再推到 Artifact Registry 並部署 Cloud Run，預設不開放未驗證存取
```

- 映像只含彙整檔，原始 Excel 與 `cleaned_trips.csv` 由 `.dockerignore` 排除。
- Cloud Run 寫入的檔案不持久；網站目前只讀不寫。
- 健康檢查用 `/api/health`。試用金是否可抵扣依帳戶資格而定，不保證免費。
- 執行環境請對照 <https://cloud.google.com/run/docs/container-contract>。

## 檔案配置

```
backend/main.py              FastAPI app、API 路由、錯誤格式、正式靜態檔
backend/serve.py             正式啟動（0.0.0.0、PORT）
backend/config.py            環境變數
backend/services/            資料讀取與快取、歷史、品質、匯出、資料版本
scripts/prepare_bus_data.py  原始 Excel → 彙整檔（交接原檔，未修改）
scripts/quality_checks.py    新增品質規則（離線）
data/prepared/               彙整檔與 quality_checks.json
data/raw/                    原始 Excel（不進 Git）
tests/test_api.py            24 項 API 與資料測試
frontend/                    React 前端；tokens 在 src/styles/tokens.css
docs/screenshots/            桌面與 390px 手機截圖
```

## 已知限制與後續

- 方向對照表 194 組上下車站尚未填寫；2024 年有 37 個、2025 年有 18 個站序對應多個站名。
- 無紀錄日期的原因（停駛、未匯出等）待業者確認。
- 6 小時門檻是待查門檻，不是刪除規則。
- 前端 JavaScript 約 830 KB（gzip 275 KB），主要是 ECharts；之後如需加快首次載入可再分割。
- P1 預測請由分析端交付結果 CSV（欄位見交接文件 8.1），網站只負責呈現。
