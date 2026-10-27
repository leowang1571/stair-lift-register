# 樓梯與 Lift 登記

網站：https://leowang1571.github.io/stair-lift-register/

網頁由 GitHub Pages 提供；同步服務及資料庫由擁有者的 Cloudflare Workers / D1 提供。訪客毋須登入 GitHub、Cloudflare 或 ChatGPT。網站執行及資料同步不依賴 ChatGPT 服務。

## 開始使用及跨裝置同步

1. 按「建立 / 加入項目」，輸入名稱並建立項目；可帶入目前畫面記錄，或選擇 JSON 備份匯入。
2. 按「分享」，複製編輯連結給自己或協作者。其他裝置直接開啟完整連結即可加入同一項目。
3. 如只供查看，請使用唯讀連結。編輯連結代表修改權限，請妥善保存；網址首頁本身不會自動開啟私人項目。
4. 按「編輯」後，才可以修改樓層、座別、Lift 分類和刪除記錄。閒置中的頁面約每五秒更新，也可按「立即同步」。
5. 可隨時匯出 JSON 備份。由舊版本遷移時，匯入備份建立新項目後，重新產生分享連結。

## 現有功能

- 樓梯 ST-01 及 Lift LT1 起始各 16 個；1/F、2/F 可同時勾選。
- 依現有最大編號新增；支援刪除及恢復，重用編號不會繼承已刪記錄。
- 座別 T1、T2、T3、T5；舊 T4 會轉為 T5。
- Lift 可標記大樓 Lift、平台 Lift、消防梯；支援長按編號設定。
- 編輯鎖、篩選、離線暫存、JSON 備份及多人同步。

## 開發及部署

使用 Node.js 24 或以上：

```sh
npm test
npm run build
```

GitHub Pages 使用 `main` 分支的 `/docs`，程式來源為 `register.html`、`public/` 和 `scripts/build-pages.mjs`。

同步服務：`https://stair-lift-register-sync.leo-e45.workers.dev`。後端原始碼、資料庫結構及 Cloudflare 部署流程保留在擁有者的私人 `stair-lift-register-data` 儲存庫。Cloudflare API Token 只用於私人儲存庫的 GitHub Actions Secrets，訪客不需要 Token，公開網頁亦不含部署憑證。

原有資料未自動搬入新的 Cloudflare 資料庫；舊版和既有 JSON 備份保留，請按上述方式匯入。
