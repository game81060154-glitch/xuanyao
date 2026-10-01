# 玄曜 1.4｜AI 後端部署

目前 GitHub Pages 負責手機 Web 介面；真正的 AI 需要一個能執行 serverless function 的後端。

本專案已加入 Vercel 相容的 `/api/chat`，可與現有前端直接對接。

## 安全原則

- `OPENAI_API_KEY` 只放在後端環境變數。
- 不把 API 金鑰寫進 GitHub、HTML、JavaScript 或手機端。
- 前端只送出訊息與有限的對話歷史。
- 重要外部操作仍由玄曜要求使用者確認。

## 部署後端

1. 在 Vercel 建立專案並匯入 `game81060154-glitch/xuanyao`。
2. 在專案 Environment Variables 加入：
   - `OPENAI_API_KEY`：你的 API 金鑰
   - `OPENAI_MODEL`：可選，預設 `gpt-5.6-luna`
3. 部署後，取得 Vercel 網址，例如 `https://你的專案.vercel.app`。
4. 在玄曜 Web 版設定 AI Gateway URL 為：
   `https://你的專案.vercel.app/api/chat`

## 注意

GitHub Pages 本身仍可正常使用 Demo、本機資料中心與任務中心。
若尚未設定 Gateway，玄曜會自動回到 Demo 模式，不會把 API 金鑰暴露到手機端。

## 後續

- 玄曜記憶層
- 任務優先級與自動拆解
- 工具調用介面
- 外部操作確認閘門
