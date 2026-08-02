// index.js
// 功能：接收 LINE 群組訊息 webhook，遇到圖片就下載並自動上傳到 Dropbox
// 需要環境變數：
//   LINE_CHANNEL_SECRET       - LINE Developers > Messaging API > Channel secret
//   LINE_CHANNEL_ACCESS_TOKEN - LINE Developers > Messaging API > Channel access token (long-lived)
//   DROPBOX_APP_KEY           - Dropbox App Console > Settings > App key
//   DROPBOX_APP_SECRET        - Dropbox App Console > Settings > App secret
//   DROPBOX_REFRESH_TOKEN     - 用 OAuth 換來的 refresh token（長期有效，不會過期）
//   DROPBOX_FOLDER            - 選填，Dropbox 內要存放的資料夾路徑，預設 /line-photos

const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const { Dropbox } = require("dropbox");

const {
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,
  DROPBOX_APP_KEY,
  DROPBOX_APP_SECRET,
  DROPBOX_REFRESH_TOKEN,
  DROPBOX_FOLDER = "/line-photos",
  PORT = 3000,
} = process.env;

if (
  !LINE_CHANNEL_SECRET ||
  !LINE_CHANNEL_ACCESS_TOKEN ||
  !DROPBOX_APP_KEY ||
  !DROPBOX_APP_SECRET ||
  !DROPBOX_REFRESH_TOKEN
) {
  console.error("缺少必要環境變數，請檢查 .env 或部署平台的環境變數設定");
  process.exit(1);
}

// 用 refresh token 初始化，Dropbox SDK 會在 access token 過期時自動換發新的，
// 不需要自己管理 4 小時過期的問題。
const dbx = new Dropbox({
  clientId: DROPBOX_APP_KEY,
  clientSecret: DROPBOX_APP_SECRET,
  refreshToken: DROPBOX_REFRESH_TOKEN,
  fetch,
});

const app = express();

// LINE 要求 webhook 必須用原始 body 驗證簽章，所以這裡用 express.raw
app.use(express.raw({ type: "*/*" }));

function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;
  const hash = crypto
    .createHmac("SHA256", LINE_CHANNEL_SECRET)
    .update(req.body)
    .digest("base64");
  return hash === signature;
}

function todayFolder() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${DROPBOX_FOLDER}/${yyyy}-${mm}-${dd}`;
}

async function downloadLineImage(messageId) {
  const res = await axios.get(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
      responseType: "arraybuffer",
    }
  );
  return res.data; // Buffer
}

async function uploadToDropbox(buffer, messageId) {
  const folder = todayFolder();
  const filename = `${Date.now()}_${messageId}.jpg`;
  const path = `${folder}/${filename}`;
  await dbx.filesUpload({
    path,
    contents: buffer,
    mode: { ".tag": "add" },
    autorename: true,
  });
  console.log(`已上傳: ${path}`);
}

app.post("/webhook", async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send("invalid signature");
  }

  // 驗證通過後才 parse JSON
  let body;
  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch (e) {
    return res.status(400).send("bad request");
  }

  // 先回 200，避免 LINE 重送；圖片處理用非同步跑
  res.status(200).send("OK");

  const events = body.events || [];
  for (const event of events) {
    try {
      if (
        event.type === "message" &&
        event.message &&
        event.message.type === "image"
      ) {
        const messageId = event.message.id;
        const buffer = await downloadLineImage(messageId);
        await uploadToDropbox(buffer, messageId);
      }
    } catch (err) {
      console.error("處理訊息時發生錯誤：", err.message);
    }
  }
});

app.get("/", (req, res) => res.send("LINE to Dropbox webhook is running."));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
