export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed." });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI backend is not configured." });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: "Invalid JSON." }); }

  const question = String(body.question || "").trim().slice(0, 1000);
  const purpose = String(body.purpose || "驗證未知資訊").trim().slice(0, 600);
  if (!question) return res.status(400).json({ error: "Research question is required." });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      confidence: { type: "string" },
      evidenceQuality: { type: "string" },
      conflictStatus: { type: "string" },
      nextQuestion: { type: "string" },
      limitations: { type: "string" }
    },
    required: ["summary", "confidence", "evidenceQuality", "conflictStatus", "nextQuestion", "limitations"]
  };

  const input = [
    "請研究以下問題，使用繁體中文回答。",
    "研究問題：" + question,
    "研究目的：" + purpose,
    "",
    "規則：",
    "1. 優先使用官方、原始資料、學術或高可信來源。",
    "2. 清楚區分已確認、仍有不確定性的資訊。",
    "3. 不要把搜尋到的內容擴大推論成沒有證據支持的結論。",
    "4. 回傳精簡證據摘要、信心程度、證據品質與主要限制。",
    "5. 判斷不同來源是否存在明顯矛盾；若有，標記 conflictStatus。",
    "6. 若證據不足以完成判斷，提出一個最小且具體的 nextQuestion；足夠時留空。",
    "7. 搜尋完成後保留來源資訊，供玄曜後續重新判斷。"
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-5.5",
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      input,
      text: { format: { type: "json_schema", name: "xuanyao_research", strict: true, schema } },
      max_output_tokens: 1000,
      store: false
    })
  });

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Research provider error." });

  const sources = [];
  const outputs = Array.isArray(data.output) ? data.output : [];
  outputs.filter(x => x && x.type === "web_search_call").forEach(call => {
    const list = call?.action?.sources;
    if (!Array.isArray(list)) return;
    list.forEach(s => {
      if (!s || typeof s.url !== "string" || !/^https?:\\/\\//i.test(s.url)) return;
      sources.push({
        url: s.url,
        title: String(s.title || "").slice(0, 240),
        publishedAt: s.published_at || s.publish_date || null
      });
    });
  });

  let parsed;
  try { parsed = JSON.parse(data.output_text || "{}"); }
  catch { parsed = { summary: data.output_text || "已完成搜尋，但未取得結構化摘要。", confidence: "unknown", evidenceQuality: "unknown", conflictStatus: "unknown", nextQuestion: "", limitations: "結構化解析失敗。" }; }

  const unique = [];
  const seen = new Set();
  sources.forEach(s => { if (!seen.has(s.url)) { seen.add(s.url); unique.push(s); } });

  return res.status(200).json({
    question,
    purpose,
    summary: parsed.summary || "尚無摘要。",
    confidence: parsed.confidence || "unknown",
    evidenceQuality: parsed.evidenceQuality || "unknown",
    conflictStatus: parsed.conflictStatus || "unknown",
    nextQuestion: parsed.nextQuestion || "",
    limitations: parsed.limitations || "",
    status: unique.length ? "verified" : "unverified",
    verifiedAt: unique.length ? Date.now() : null,
    sources: unique.slice(0, 12),
    model: process.env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-5.5"
  });
}
