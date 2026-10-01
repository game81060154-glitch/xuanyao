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
  if (!apiKey) return res.status(503).json({ error: "AI backend is not configured." });

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
    .filter(x => x && (x.role === "user" || x.role === "assistant") && typeof x.text === "string")
    .map(x => ({ role: x.role, content: x.text }))
    .concat([{ role: "user", content: message }]);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      memories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            content: { type: "string" },
            reason: { type: "string" }
          },
          required: ["content", "reason"]
        }
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            parentId: { type: "string" }
          },
          required: ["text", "parentId"]
        }
      },
      toolRequests: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            toolId: { type: "string" },
            reason: { type: "string" },
            requiresConfirmation: { type: "boolean" }
          },
          required: ["toolId", "reason", "requiresConfirmation"]
        }
      }
    },
    required: ["reply", "memories", "tasks", "toolRequests"]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions: "你是玄曜，使用繁體中文。先理解使用者目標，再給可執行回應。只把真正值得長期保留的偏好、事實或專案決策放入 memories；只建立清楚、可執行的待辦放入 tasks。parentId 若無對應任務就填空字串。toolRequests 只提出工具需求，不執行外部操作；任何外部、付費、帳號、刪除、不可逆或重要操作都必須 requiresConfirmation=true。一般聊天時三個陣列可為空。不要把普通回答重複成記憶。",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "xuanyao_response",
          strict: true,
          schema
        }
      },
      max_output_tokens: 1400
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status).json({ error: data?.error?.message || "AI provider error." });
  }

  let parsed;
  try {
    parsed = JSON.parse(data.output_text || "{}");
  } catch {
    parsed = {
      reply: data.output_text || "玄曜已收到，但模型沒有回傳可解析的結構化資料。",
      memories: [],
      tasks: [],
      toolRequests: []
    };
  }

  return res.status(200).json({
    reply: parsed.reply || "玄曜已收到。",
    memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    toolRequests: Array.isArray(parsed.toolRequests) ? parsed.toolRequests : [],
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna"
  });
}
