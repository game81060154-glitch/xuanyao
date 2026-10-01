# 玄曜 Web 版 1.18

## 研究閉環

1. 自主判斷發現資訊缺口。
2. 玄曜建立研究問題與查證任務。
3. 使用者在研究面板按「開始查證」，才啟動可能產生 API 費用的外部網路搜尋。
4. /api/research.js 使用 Responses API 的 hosted web_search 工具取得即時來源，並要求結構化的摘要、信心與限制。
5. 來源 URL、摘要、信心、狀態、查證時間與限制保存到瀏覽器本機研究資料。
6. 已驗證研究可按「用證據再判斷」，重新送入玄曜的自主判斷流程。
7. 原查證任務成功後會標記完成，讓任務工作流向下一步推進。

## 資料

研究紀錄可包含：

- question
- purpose
- source
- summary
- confidence
- limitations
- status
- sources[]
- verifiedAt
- createdAt
- updatedAt

既有 1.17 備份仍可匯入；新增欄位採向後相容方式處理。

## 安全與成本

網路查證屬外部服務操作。玄曜不在背景中自行大量搜尋；只有使用者主動按下查證按鈕才執行。API 金鑰只存在後端環境變數，不進入前端。

此版本使用 OpenAI Responses API 的 hosted web_search。官方文件目前建議新整合使用 `web_search`，並可透過 `include: ["web_search_call.action.sources"]` 取得完整來源清單。

## 後續

下一層可加入「證據衝突偵測、來源品質分層、目標完成度檢查、失敗後最小化重查詢」；任何付費、不可逆或外部權限操作仍受確認閘門控制。
