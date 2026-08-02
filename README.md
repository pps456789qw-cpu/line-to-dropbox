# LINE 群組照片自動存到 Dropbox

這個小程式會接收 LINE 的 Webhook，只要公司群組裡有人傳圖片，就會自動下載並上傳到你的 Dropbox（依日期自動分資料夾，例如 `/line-photos/2026-08-02/`）。

## 你需要準備的東西

### 1. LINE Developers（你已經有帳號了）
1. 到 [LINE Developers Console](https://developers.line.biz/console/) 建立一個 **Provider**，再建立一個 **Messaging API channel**
2. 在該 channel 的設定頁面拿到：
   - **Channel secret**
   - **Channel access token**（要用「long-lived」那種，在 Messaging API 分頁下產生）
3. 把這個 channel 對應的 **LINE Official Account** 加入你的公司群組
   - ⚠️ 重要：LINE 官方帳號預設「不能」被邀進群組，除非你在 [Official Account Manager](https://manager.line.biz/) 把「加入群組聊天」的權限打開（設定 > Bot 設定 > 允許加入群組/多人聊天）
4. Webhook 網址設定完（下面部署完成後）要貼到 channel 設定的 **Webhook URL**，並把「Use webhook」打開

### 2. Dropbox
Dropbox 從 2020 年起，App Console 直接產生的 token 只能用 4 小時，所以我們用 **refresh token** 的方式，讓伺服器能自動換發新的 access token，長期都不會過期。

1. 到 [Dropbox App Console](https://www.dropbox.com/developers/apps) 建立一個新 App
   - Scoped access → App folder（比較安全，只會動到專屬資料夾）
2. 在 **Permissions** 分頁勾選 `files.content.write` 和 `files.content.read`，按 Submit
3. 在 **Settings** 分頁拿到 **App key** 和 **App secret**
4. 瀏覽器打開（把 `你的APP_KEY` 換成實際的 App key）：
   ```
   https://www.dropbox.com/oauth2/authorize?client_id=你的APP_KEY&token_access_type=offline&response_type=code
   ```
5. 授權後會拿到一組 authorization code，在終端機執行（PowerShell 用戶請用 `Invoke-RestMethod`，不要用 `curl` 別名）：
   ```powershell
   $body = @{
       code = "剛剛拿到的authorization_code"
       grant_type = "authorization_code"
       client_id = "你的App_key"
       client_secret = "你的App_secret"
   }
   Invoke-RestMethod -Uri "https://api.dropboxapi.com/oauth2/token" -Method Post -Body $body
   ```
6. 結果裡的 `refresh_token` 就是長期使用的金鑰，記下來

### 3. 部署 Webhook 伺服器
本機沒辦法讓 LINE 連到你的 webhook，需要部署到一個有公開網址的地方。最簡單的免費選項：

**Render.com（推薦，免費方案即可）**
1. 把這個資料夾推到你自己的 GitHub repo
2. 到 Render 建立 Web Service，連接該 repo
3. Build command: `npm install`　Start command: `node index.js`
4. 在 Render 的 Environment 分頁貼上 `.env.example` 裡的變數（換成你真實的值：LINE_CHANNEL_SECRET、LINE_CHANNEL_ACCESS_TOKEN、DROPBOX_APP_KEY、DROPBOX_APP_SECRET、DROPBOX_REFRESH_TOKEN）
5. 部署完成後會拿到一個網址，例如 `https://your-app.onrender.com`
6. Webhook URL 就填 `https://your-app.onrender.com/webhook`，回到 LINE Developers 貼上並按 Verify

也可以用 Railway、Fly.io、Zeabur 等平台，步驟大同小異。

## 本機測試
```bash
npm install
cp .env.example .env   # 填入真實的金鑰
node index.js
```
本機測試 webhook 需要用 [ngrok](https://ngrok.com/) 之類的工具開對外網址，例如 `ngrok http 3000`，再把 ngrok 給的網址 + `/webhook` 填到 LINE 後台。

## 之後想調整的地方
- 想存在 Dropbox 的哪個資料夾：改 `DROPBOX_FOLDER` 環境變數
- 只想抓特定群組的圖片：可以在 `index.js` 的 for 迴圈裡加一段判斷 `event.source.groupId === "你的群組ID"`（群組 ID 可以先把所有事件印到 console.log 觀察一次拿到）
- 除了圖片也想存影片：把 `event.message.type === "image"` 改成 `["image","video"].includes(event.message.type)` 即可，邏輯共用
