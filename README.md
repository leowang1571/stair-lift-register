# 樓梯與 Lift 登記（只用 GitHub）

網頁及資料均使用 GitHub。網站：**https://leowang1571.github.io/stair-lift-register/**

- GitHub Pages 提供網頁；瀏覽器直接呼叫 GitHub REST API 讀寫私人資料儲存庫。
- 不連接 ChatGPT Sites、Cloudflare、Supabase 或其他同步服務。
- 讀寫需要 GitHub 授權；此模式不提供匿名多人修改。

## 保留功能

樓梯 ST-01 起、Lift LT1 起；1/F 和 2/F 可同時勾選；編輯防誤觸；T1、T2、T3、T5 座別；大樓 Lift、平台 Lift 及消防梯；篩選、新增、刪除、還原、JSON 備份及匯入。

新增跟隨目前最高編號加一，空清單從 1 開始；重用已刪除編號建立空白記錄，保留舊版本；還原不覆蓋現有同號記錄。

每次儲存先讀取最新 GitHub 檔案，再按操作合併並以檔案 SHA 寫入；遇到同時修改會重新讀取後重試，避免整份舊資料覆蓋新資料。修改會合批提交，顯示中的網頁約每 30 秒讀取一次；也可按「立即同步」。未同步修改會保留在該瀏覽器的本機快取。Token 過期或離線時不會顯示已同步。

## 第一次使用

1. 私人資料儲存庫預設為 `leowang1571/stair-lift-register-data`，與公開的網頁程式儲存庫分開。其他使用者可建立自己的私人儲存庫，勾選 Add README，並在建立項目時填寫自己的 `擁有人/名稱`。
2. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。
3. Repository access 選 **Only select repositories**，只選私人資料儲存庫；Repository permissions 的 **Contents** 選 **Read and write**。Token 設定合適的到期日。
4. 在網站按 **GitHub 設定**，貼入 Token，按 **套用授權**。Token 只放在目前頁面的記憶體，重新載入後需再輸入；不存入 localStorage、不寫入儲存庫，也不包含在分享連結內。
5. 按 **建立 / 加入項目**，輸入私人資料儲存庫及項目名稱，選擇帶入目前記錄或 JSON 備份，按 **建立並同步**。
6. 顯示 **已同步到 GitHub** 才代表已完成寫入。

請勿把 Token 發到對話、提交程式碼或分享給他人。Token 僅傳送至 `https://api.github.com`。GitHub Token 不能只限制到一個 JSON 檔案，因此請選獨立的私人資料儲存庫，避免授權其他專案。

## 跨裝置及協作

1. 原裝置按「分享 → 複製編輯連結」。
2. 新裝置開啟連結，按 GitHub 設定輸入自己的有效 Token。
3. 使用同一個 GitHub 帳戶的多部裝置可以授權同一個私人資料儲存庫；其他協作者必須先在 GitHub 獲授權存取該私人儲存庫，並使用自己的 Token。

分享連結只包含儲存庫、分支、項目檔案路徑和本頁開啟模式。唯讀連結鎖定頁面編輯，真正的權限仍由 GitHub 控制：唯讀使用者須使用 Contents **Read-only** Token；有寫入權限的人仍能在 GitHub 直接修改檔案。

每個項目儲存於私人儲存庫的 `projects/<隨機ID>.json`。檔案含項目名稱、記錄、已刪除記錄、修訂編號和已處理操作 ID，不含 Token。GitHub 提交歷史可保留舊版資料。

## 搬移舊同步項目

現有雲端項目已搬入 `leowang1571/stair-lift-register-data`。設定 Token 後，按「建立 / 加入項目 → 讀取此儲存庫的項目」，選擇名稱並開啟。原有樓層、座別、分類、消防梯及已刪除記錄均保留。

以下 JSON 方法供額外備份或搬移其他項目使用：

這個版本不會呼叫舊同步服務，舊的密鑰分享連結不能直接加入。

1. 在原網站開啟原項目，等待同步完成，按「匯出 JSON 備份」。每個項目分別匯出。
2. 在新版建立 GitHub 項目時選擇 JSON 備份，按「建立並同步」。
3. 核對樓梯、Lift、座別、樓層、分類、消防梯及已刪除記錄，再分享新的 GitHub 項目連結。

同一瀏覽器若有上一版本的活動項目快取，首次更新會保留其快取和待同步修改供帶入新項目；這不能代替從舊網站匯出最新雲端記錄。原同步網站和資料庫保留供你自行備份，這份網頁不再連接它。

## 限制

GitHub 是檔案及版本儲存服務，無法提供原先匿名密鑰分享的操作方式。每次同步寫入會產生提交；有 API 請求及寫入頻率限制。遇到限流時會暫停重試，修改仍留在本機。多人同時修改同一欄位，以最後成功提交的操作為準。

操作去重歷史隨使用量增加；當單檔接近 API 同步容量時，網站會保留本機修改並提示匯出備份，建立新項目，不會自動刪除歷史。

## 開發與發布

Node.js 24：

```sh
npm test
npm run build
```

不需安裝依賴。修改 `register.html`、`public/app.js`、`public/github-storage.mjs` 或 `public/register-model.mjs` 後，執行 build 並將原始碼及 `docs/` 一起提交。

GitHub Pages 設定為 **Deploy from a branch → main → /docs**。驗證流程會檢查合併、SHA 衝突重試、去重、權限、編號重用、限流及產物一致性。
