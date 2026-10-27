# 樓梯與 Lift 登記

繁體中文的樓梯及 Lift 登記工具。程式由 GitHub 管理，網站及同步資料庫部署至自己的 Cloudflare Workers + D1；使用者不需要登入 ChatGPT 或 GitHub。

## 現有功能

- 樓梯 ST-01 至 ST-16、Lift LT1 至 LT16，兩類分開管理。
- 通 1/F 和通 2/F 可以同時勾選。
- 按「編輯」才可修改，減少誤觸。
- 座別 T1、T2、T3、T5；舊 T4 自動轉為 T5。
- 大樓 Lift、平台 Lift，獨立消防梯標記；點擊或長按編號開啟設定。
- 新增使用目前最大編號加一；空清單從 1 開始。刪除最高編號後，新增編號會跟隨更新。
- 刪除、已刪除記錄及還原；重用編號建立空白記錄，保留舊版本。同號現有記錄不會被還原操作覆蓋。
- 建立及加入共用項目、唯讀和編輯分享連結、跨裝置同步。
- 離線暫存及重連補交、JSON 匯出和匯入、座別及 Lift 分類篩選。

## 從 GitHub 部署

GitHub Pages 只有靜態託管，不能單獨支援本工具的同步 API。此儲存庫包含完整 Workers 後端，不需拆開網站和 API。

1. 準備自己的 Cloudflare 帳戶，在電腦安裝 Node.js 24。
2. 下載或 clone 此儲存庫，執行 `npm ci`。
3. 執行 `npx wrangler login`，再執行 `npm run db:create`。
4. 複製建立 D1 後顯示的 `database_id`。
5. 在 GitHub 儲存庫 **Settings → Secrets and variables → Actions** 加入以下 Secrets：

| 名稱 | 內容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 帳戶 ID |
| `CLOUDFLARE_D1_DATABASE_ID` | 第 4 步的資料庫 ID |
| `CLOUDFLARE_API_TOKEN` | 可部署 Workers 及存取此帳戶 D1 的 API Token |

API Token 需要帳戶層級 Workers Scripts Edit、D1 Edit；使用 workers.dev 時也需 Workers Subdomain Edit。只授權要部署的帳戶。不需要將密鑰提交至程式碼。

6. 到 **Actions → 部署網站 → Run workflow**。流程會測試、套用資料庫遷移，再部署。
7. 成功後從執行記錄取得 `https://…workers.dev` 網址。可在 Cloudflare 為 Worker 綁定自己的域名。

「驗證程式」會在 push / PR 自動執行；「部署網站」採手動執行，設定完成後可重複使用。一般使用者只需要新網站網址或項目分享連結。

### 電腦直接部署

將 `wrangler.jsonc` 的 `database_id` 改為自己的 D1 ID，然後：

```sh
npm ci
npm test
npx wrangler login
npm run db:migrate
npm run deploy
```

亦可透過 `CLOUDFLARE_D1_DATABASE_ID` 環境變數配合 `npm run configure` 寫入設定。

## 搬移原有記錄

程式搬移不會自動搬走舊網站的雲端資料。舊網站繼續保留，完成核對才轉用新網站。

1. 在原裝置開啟舊網站的項目，等候「已同步到雲端」。
2. 按「匯出 JSON 備份」。每個項目分別匯出，包括已刪除記錄。
3. 在新網站按「建立 / 加入項目」，輸入名稱並選擇該 JSON，再按「建立並同步」。
4. 核對樓梯、Lift、勾選、座別、分類、消防梯和已刪除記錄。
5. 按「分享 → 複製編輯連結」，在第二部裝置測試相同項目及雙向修改。
6. 改發新網站產生的唯讀 / 編輯連結。舊項目連結不會自動指向新網站。

JSON 匯入會建立新項目與新密鑰。若要保留原項目 ID 和密鑰，需另外進行完整 D1 資料庫搬移；本包不包含任何生產資料或密鑰。ChatGPT 舊版帳戶記錄須先在舊網站匯出，獨立網站不提供 ChatGPT 帳戶登入入口。

## 項目分享操作

第一次在有資料的裝置按「建立 / 加入項目」，保留「帶入目前畫面的記錄」，建立後按「分享」。自用跨裝置選「複製編輯連結」；只供查看選「複製唯讀連結」。新裝置直接打開完整分享連結即可。

請保存按分享按鈕取得的完整連結。載入後網址列會隱藏項目資訊，直接複製網址列可能只有首頁。持有編輯連結的人可以修改該項目。

## 本機驗證

```sh
npm ci
npm test
npm run build
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

測試使用 Node.js 內建 SQLite，涵蓋雙樓層、合併同步、項目隔離、唯讀權限、重試、T4 相容、編號重用及舊版本保護。

網站訪問不經 ChatGPT 域名；香港實際速度仍取決於網絡、域名和 Cloudflare 服務狀況。
