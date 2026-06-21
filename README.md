# 旅行手帳 App — 部署到 Vercel

## 檔案結構

```
.
├── index.html          ← 整個 App（前端，單一 HTML 檔案）
├── api/
│   └── weather.js      ← Vercel Serverless Function，代理 Open-Meteo 天氣查詢
├── package.json         ← 專案描述與基本指令
├── vercel.json          ← Vercel 部署設定（明確指定 function 行為）
├── .gitignore           ← 避免把 node_modules、.vercel 等本機檔案上傳到 GitHub
└── README.md            ← 這份文件
```

這是一個完整、可以直接上傳到 GitHub 或部署到 Vercel 的專案，沒有省略任何檔案。

前端**不會**直接呼叫 `open-meteo.com`。所有天氣查詢都先打到自己的 `/api/weather`，
由這支 serverless function 在伺服器端呼叫 Open-Meteo 的地理編碼與天氣 API，
再把結果回傳給前端。這樣可以避開瀏覽器端的 CORS／沙盒限制
（例如直接雙擊 HTML 檔案時的 `file://` 限制，或在某些預覽視窗裡執行時的限制）。

## 上傳到 GitHub

```bash
cd 這個資料夾
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的帳號/你的repo名稱.git
git push -u origin main
```

`.gitignore` 已經設定好會排除 `node_modules/`、`.vercel/` 等不該上傳的檔案，
直接 `git add .` 不用擔心誤傳。

## 部署步驟（Vercel）

### 方法一：用 Vercel CLI（推薦，最快，不需要先上傳 GitHub）

```bash
npm install -g vercel
cd 這個資料夾
vercel
```

依照提示操作（第一次會問要不要建立新專案，直接選預設值即可），
完成後 Vercel 會給你一個網址，例如 `https://你的專案名稱.vercel.app`。

之後若要正式上線（而不是預覽網址），執行：

```bash
vercel --prod
```

### 方法二：用 Vercel 網站介面（先上傳 GitHub 後用這個方式）

1. 先依照上面「上傳到 GitHub」的步驟，把整個資料夾推上 GitHub
2. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入
3. 點「Add New... → Project」，選剛剛建立的 repository
4. 其他設定保持預設（Vercel 會自動偵測到 `vercel.json` 與 `api/weather.js`，
   並把 `weather.js` 部署成 serverless function），直接點「Deploy」
5. 部署完成後會拿到一個 `https://....vercel.app` 的網址

## 部署後驗證天氣功能是否正常

部署完成後，可以先直接用瀏覽器或 `curl` 測試 API 本身有沒有正常運作，
不需要打開整個 App：

```bash
curl "https://你的網址.vercel.app/api/weather?destination=東京"
```

如果一切正常，應該會看到類似這樣的回應：

```json
{"ok":true,"destination":"東京","resolvedName":"東京","latitude":35.6895,"longitude":139.6917,"temperature":18,"code":3}
```

確認 API 沒問題後，再用瀏覽器打開 `https://你的網址.vercel.app/`，
首頁卡片上的天氣欄位應該會在約 1 秒內從「🌤️ 天氣載入中」變成實際溫度，
例如「18°C ☁️」。

## 關於資料保存（重要）

這個 App 目前用瀏覽器的 `localStorage` 模擬「自動儲存」，**不是真正的雲端帳號系統**。
這代表：

- 編輯的旅行資料只會保存在「同一台裝置、同一個瀏覽器」，換裝置或清除瀏覽器資料就會遺失
- 在某些受限的預覽／沙盒環境中（例如 Claude 聊天介面裡的 Artifact 預覽視窗）
  `localStorage` 可能完全無法使用或會被清空，這種情況下 App 會在畫面上方顯示
  明確警告「目前環境無法保存，重新整理會遺失變更」，而不是假裝保存成功
- 一般瀏覽器分頁（包含部署到 Vercel 後用瀏覽器開啟正式網址）都不會有這個問題

如果未來需要真正的「登入帳號、跨裝置同步、私人/分享權限」，需要額外的後端
（資料庫＋驗證系統），這不在目前這份前端專案的範圍內。

## 如果天氣還是顯示「無法取得天氣」

打開瀏覽器開發者工具的 Console，會看到詳細的錯誤訊息（這個 App 已經把每一層
失敗原因都印出來了）。常見情況：

- **`/api/weather` 回傳 404 或不是合法 JSON**：通常代表 `api/weather.js` 沒有被
  Vercel 正確辨識成 serverless function。確認檔案路徑是 `api/weather.js`（資料夾
  名稱必須是 `api`），且專案根目錄有這個資料夾。
- **`destination_not_found`**：目的地名稱地理編碼查不到對應地點，可以換成更
  通用的城市名稱測試（例如先用「Tokyo」而不是特殊拼法）。
- **網路層失敗（網路相關錯誤）**：理論上不應該發生，因為 serverless function
  是伺服器對伺服器的請求，沒有瀏覽器層級的 CORS 限制；如果真的發生，
  代表 Vercel 的伺服器本身連不到 Open-Meteo，需要查看 Vercel 的 Function Logs
  （在 Vercel 專案頁面的 "Logs" 分頁）確認實際錯誤。

## 已經測試過的部分

由於目前環境的網路存取限制，無法在這裡直接連到 `open-meteo.com` 驗證，
但已經用「模擬 Open-Meteo 回應＋真實 HTTP 伺服器＋真實瀏覽器」的方式完整測試過
以下情境，確認程式邏輯本身正確：

- ✅ 城市名稱查詢（東京 → 26°C 🌤️ 大致晴朗）
- ✅ 國家名稱自動轉換成主要城市（越南 → 胡志明市 → 32°C 🌦️ 短暫陣雨）
- ✅ 查無此地點時回傳清楚的錯誤訊息（404 + destination_not_found）
- ✅ 缺少 destination 參數時回傳清楚的錯誤訊息（400 + missing_destination）
- ✅ 前端確認沒有任何直接呼叫 open-meteo.com 的請求，全部都經過 `/api/weather`
- ✅ 切換不同旅行會正確查詢對應目的地的天氣，並各自快取 30 分鐘
- ✅ localStorage 不可用時會誠實顯示警告，不會假裝保存成功

部署到 Vercel 後，因為是真實的伺服器對伺服器請求，理論上會直接成功；
如果有任何問題，請依照上面的除錯步驟查看 Console 與 Vercel Function Logs。

