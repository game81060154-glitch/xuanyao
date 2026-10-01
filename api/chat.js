export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI backend is not configured." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON." });
  }

  const message = String(body.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message is required." });

  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const input = history
    .filter(x => x && (x.role === "user" || x.role === "system") && typeof x.text === "string")
    .map(x => ({ role: x.role, content: x.text }))
    .concat([{ role: "user", content: message }]);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions: "你是玄曜，使用繁體中文回答。先理解目標，再提供可執行方案；小型工作可直接處理。涉及付款、帳號變更、刪除、不可逆或重要外部操作時，先提醒使用者確認。",
      input,
      max_output_tokens: 1200
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status).json({ error: data?.error?.message || "AI provider error." });
  }

  const reply = data.output_text ||
    data.output?.flatMap(item => item.content || [])
      ?.map(part => part.text)
      ?.filter(Boolean)
      ?.join("") || "";

  return res.status(200).json({
    reply: reply || "玄曜已收到，但模型沒有回傳文字。",
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna"
  });
}
