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
  - **重建房間** (🔨)：清空所有數據。
  - **清空標記** (🗑️)：僅清除地圖數據。
- **全局功能**：
  - **刷新** (🔄)：手動與雲端同步同步（通常為自動）。
  - **日誌**：顯示/隱藏系統更新日誌。

---

## 🛠️ 使用的程序與技術架構

- **前端**：HTML5, CSS3, JavaScript (Vanilla JS)。
- **資料庫**：Firebase Realtime Database (即時同步數據)。
- **託管**：Cloudflare Pages (全球 CDN 加速)。
- **即時通訊**：Firebase SDK 替代 WebSocket。

---

## 🌐 串接步驟與說明 (Cloudflare Pages + GitHub)

本專案建議部署於 Cloudflare Pages 並與 GitHub 存儲庫串聯，以實現自動部署。

### 1. 建立 GitHub 儲存庫
1. 在 GitHub 上建立一個新專案 `Artale_RJPQ_oojump`。
2. 在本地終端執行：
   ```bash
   git init
   git remote add origin https://github.com/您的帳號/Artale_RJPQ_oojump.git
   git add .
   git commit -m "Initial commit for Firebase version"
   git push -u origin main
   ```

### 2. 串聯 Cloudflare Pages
1. 登錄 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 導航至 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
3. 選擇您的 GitHub 儲存庫。
4. **Build settings**：
   - **Framework preset**: None (或是選擇 HTML if available)。
   - **Build command**: (保持空白，本專案為純靜態 HTML)。
   - **Build output directory**: `.` (本專案文件位於根目錄)。
5. 點擊 **Save and Deploy**。

---

## 📋 遊戲規則
- 每層限 1 格正確，3 格錯誤。
- 下方成員列表可顯示與管理目前房間玩家。
- 閒置超過 1 小時後，系統將提示並強制返回首頁。
