# 樓梯與 Lift 登記

使用 GitHub Pages 開啟網頁，連接現有網站的同步 API 及資料庫。使用者不需要登入 ChatGPT 或 GitHub，也不需要建立 Cloudflare 帳戶。

網站網址：`https://leowang1571.github.io/stair-lift-register/`（啟用 Pages 後生效）。

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

## 啟用 GitHub Pages（一次設定）

1. 開啟儲存庫 **Settings → Pages**。
2. **Build and deployment → Source** 選 **Deploy from a branch**。
3. **Branch** 選 **main**，資料夾選 **/docs**，按 **Save**。
4. 等候 GitHub 的 Pages 部署完成，再開啟上方網站網址。

GitHub Free 帳戶需要公開儲存庫才能使用 Pages。若私人儲存庫顯示升級提示，可在 **Settings → General → Danger Zone → Change repository visibility** 改為 Public。這會公開程式碼；本儲存庫沒有登記資料、項目密鑰或部署憑證。GitHub Pro 等支援私人儲存庫的方案可保留 Private。

## 現有記錄及分享

新舊網頁連接同一個資料庫，毋須搬移已同步的項目或重建項目。

1. 在原網站有資料的裝置按「分享 → 複製編輯連結」。
2. 在 GitHub Pages 按「建立 / 加入項目」，將舊分享連結貼入「貼上項目分享連結」，按「加入項目」。
3. 項目載入後，兩個網站可查看及修改同一份記錄。新網站按分享會產生包含 `/stair-lift-register/` 的 GitHub Pages 連結。
4. 只供查看可使用「複製唯讀連結」；自用跨裝置請選「複製編輯連結」。

瀏覽器的本機記錄按網站網址分開保存。若原網站仍顯示「僅存此裝置」，請先在原網站建立共用項目並帶入目前記錄，或匯出 JSON 再在新網站匯入。不要在新網站誤建空白項目來取代舊項目。

請用「分享」按鈕複製連結；載入後網址列會隱藏項目資訊，直接複製網址列可能只得到首頁。持有編輯連結的人可以修改項目。

## 網站及同步的關係

GitHub Pages 提供網頁；現有 `stair-floor-register-cw26.leo1571.chatgpt.site` 提供同步。網頁不經 ChatGPT 登入；同步需要裝置能連接這個 API 網址。若網絡無法連接後端，修改會暫存在該瀏覽器，恢復連線後再同步。GitHub Pages 不會令後端變成 GitHub 服務。

後端只允許指定的 `https://leowang1571.github.io` 來源跨網站存取，仍需原有項目密鑰。唯讀連結不能寫入；跨網站請求不使用 ChatGPT 登入 Cookie。

## 修改及驗證

Node.js 24：

```sh
npm ci
npm test
npm run build:pages
```

修改 `register.html`、`public/app.js` 或 `public/register-model.mjs` 後，執行 `npm run build:pages`，將程式和 `docs/` 一起提交。GitHub Pages 會從 main 的 docs 發布。驗證流程會檢查 tests 及 docs 是否跟原始碼一致。

`lib/` 是後端原始碼的副本。修改 API 行為需要同步更新現有後端網站，僅修改 GitHub 儲存庫不會部署現有同步後端。

## 可選的完全獨立部署

`standalone/worker.mjs`、D1 遷移檔和 `部署網站` Actions 流程保留，供將來自建 Cloudflare Workers + D1 使用；目前 GitHub Pages 路線不需要執行它。此選項需要自己建立 D1，設定 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN` Secrets，並以 JSON 或完整資料庫搬移既有資料。
