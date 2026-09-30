# 玄曜 AI 後端規格

## 目的

前端只負責介面、短期本機記憶與請求；真正模型與秘密金鑰放在伺服器端。

## API

### POST /api/chat

Request:

```json
{
  "message": "使用者訊息",
  "history": [
    {"role": "user", "text": "上一則訊息"},
    {"role": "system", "text": "上一則回應"}
  ]
}
```

Response:

```json
{
  "reply": "玄曜回應",
  "model": "model-name"
}
```

## 後端原則

- 驗證輸入長度與格式
- 限制歷史訊息數量
- API 金鑰只使用伺服器環境變數
- 不把秘密回傳給瀏覽器
- 發生模型服務錯誤時回傳可理解的錯誤
- 未來工具呼叫統一由後端權限層管理

## 模型

目前採可插拔設計。部署時以環境變數指定模型，例如 `XUANYAO_MODEL`；不要把金鑰或私密設定寫入 Git。
