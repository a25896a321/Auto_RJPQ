# Artale_RJPQ_oojump 輔助工具

> Romeo and Juliet Party Quest 多人即時同步標記輔助工具 (Firebase RTDB 版本)

---

## 📦 版本開發進度

| 版本 | 日期 | 說明 |
|------|------|------|
| v2.0.0 | 2026-03-22 | **架構轉型**：從 Cloudflare Durable Objects 遷移至 Firebase RTDB。 |
| v2.1.0 | 2026-03-22 | 建立 `firebase_seed.json` 用於初始化資料庫。 |
| v2.2.0 | 2026-03-22 | **補全與修復**：新增房名、密碼編輯、剔除玩家、刷新按鈕，修復建立卡死問題。 |
| v2.3.0 | 2026-03-23 | **統計邏輯重構**：改用 Firebase 節點監聽（`rooms` 與 `presence`）來準確計算活躍房間與在線人數。 |
| v2.4.0 | 2026-03-23 | **體驗優化**：新增房間內即時修改暱稱/顏色介面，移除重建按鈕，並實作自動分配預設顏色邏輯。 |
| v2.5.0 | 2026-03-23 | **統計與維護強化**：實作即時樹狀監控統計活躍房間數與總在線玩家數，新增空房間自動清理邏輯，提供安全規則建議。 |
| v2.6.0 | 2026-03-24 | **安全性更新**：實作金鑰管理機制，將 Firebase 設定移至外部檔案並透過 `.gitignore` 保護，新增環境變數佈署說明。 |
| v2.7.0 | 2026-03-24 | **效能優化**：重構地圖渲染邏輯（initGrid/updateGrid），改為局部更新，解決多人同時操作時的按鈕鎖死問題。 |





---

## 🕹️ 操作流程與介面說明

### 1. 登入頁 (Lobby)
- **填寫暱稱**：可選填，自定義代表色（左鍵標記）與文字顏色（右鍵標記）。
- **建立房間**：
  - **房間名稱**：自定義房間標題。
  - **房間密碼**：選填。
  - **格子順序** (1234 / 4321 / 不顯示)。
  - **進階功能**：自動推算、顯示成員、聊天室開關。
- **加入房間**：輸入 8 位房號，若有密碼則需輸入。

### 2. 房間介面
- **地圖標記**：
  - **左鍵**：標記正確格子（每層限 1）。
  - **右鍵**：標記錯誤格子（每層限 3）。
- **房主權力** (👑)：
  - **編輯密碼**：隨時更換房間密碼。
  - **剔除玩家**：將惡作劇或斷線玩家移出（列表成員旁 [X] 鈕）。
    - **清空標記** (🗑️)：僅清除地圖數據。
- **全局功能**：
  - **刷新** (🔄)：手動與雲端同步同步（通常為自動）。
  - **日誌**：顯示/隱藏系統更新日誌。

---

## 🛠️ 使用的程序與技術架構

- **前端**：HTML5, CSS3, JavaScript (Vanilla JS)。
- **資料庫**：Firebase Realtime Database (即時同步數據)。
- **即時通訊**：Firebase SDK 替代 WebSocket。

---

---

## 🔒 金鑰管理與安全性 (Firebase Configuration)

為了確保 Firebase 金鑰不被公開於 GitHub 等平台，本專案採用以下管理方式：

### 1. 本地開發 (Local Development)
- 敏感資訊已移出 `app_config.json`。
- 本地請建立 `firebase_config.json` 檔案（此檔案已加入 `.gitignore`），格式如下：
  ```json
  {
    "apiKey": "您的 API KEY",
    "authDomain": "...",
    "databaseURL": "...",
    "projectId": "...",
    "storageBucket": "...",
    "messagingSenderId": "...",
    "appId": "...",
    "measurementId": "..."
  }
  ```

### 2. 雲端佈署 (Cloudflare Pages)
在 Cloudflare Pages 佈署時，請按照以下步驟操作以安全地注入金鑰：

1. **進入專案設定**：在 Cloudflare Pages 儀表板，選擇您的專案 -> **Settings** -> **Environment variables**。
2. **新增環境變數**：
   - 名稱：`FIREBASE_CONFIG_JSON`
   - 數值：貼上完整的 Firebase JSON 內容（同上述本地開發格式）。
3. **修改佈署設定 (Build settings)**：
   - **Build command**：`echo $FIREBASE_CONFIG_JSON > firebase_config.json`
   - **Build output directory**：`/` (若專案在根目錄則保持預設)

---

## 🌐 串接步驟與說明 (Cloudflare Pages)

本專案建議佈署於 **Cloudflare Pages** 以獲得全球低延遲存取與環境變數支援。

### 1. 上傳至 GitHub
1. 在 GitHub 上建立儲存庫。
2. 推送代碼：
   ```bash
   git add .
   git commit -m "Security: implement key management"
   git push origin main
   ```

### 2. 串聯 Cloudflare Pages
1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 點擊 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
3. 選擇您的 GitHub 儲存庫。
4. **Build settings**：
   - Framework preset: `None`
   - Build command: `echo $FIREBASE_CONFIG_JSON > firebase_config.json`
   - Build output directory: `(空)` 或 `/`
5. 在 **Environment variables** 填入 `FIREBASE_CONFIG_JSON`。
6. 點擊 **Save and Deploy**。

---

## 📋 遊戲規則
- 每層限 1 格正確，3 格錯誤。
- 下方成員列表可顯示與管理目前房間玩家。
- 閒置超過 1 小時後，系統將提示並強制返回首頁。
