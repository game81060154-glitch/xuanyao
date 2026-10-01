export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI backend is not configured." });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: "Invalid JSON." }); }

  const message = String(body.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message is required." });

  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  let input = history
    .filter(x => x && (x.role === "user" || x.role === "assistant") && typeof x.text === "string")
    .map(x => ({ role: x.role, content: x.text }))
    .concat([{ role: "user", content: message }]);

  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      reply: { type: "string" },
      memories: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { content: { type: "string" }, reason: { type: "string" } },
        required: ["content", "reason"]
      }},
      tasks: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { text: { type: "string" }, parentId: { type: "string" } },
        required: ["text", "parentId"]
      }},
      toolRequests: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          toolId: { type: "string" }, reason: { type: "string" },
          requiresConfirmation: { type: "boolean" }
        },
        required: ["toolId", "reason", "requiresConfirmation"]
      }}
    },
    required: ["reply", "memories", "tasks", "toolRequests"]
  };

  const tools = [
    {
      type: "function", name: "xuanyao_save_memory",
      description: "保存真正值得長期保留的玄曜本機記憶。",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" }, reason: { type: "string" }
        },
        required: ["content", "reason"], additionalProperties: false
      }, strict: true
    },
    {
      type: "function", name: "xuanyao_create_task",
      description: "建立清楚、可執行的玄曜本機待辦。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" }, parentId: { type: "string" }
        },
        required: ["text", "parentId"], additionalProperties: false
      }, strict: true
    }
  ];

  const request = {
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions: "你是玄曜，使用繁體中文。先理解目標，再給可執行回應。只有真正有必要時才使用本機工具：保存長期記憶或建立待辦。外部、付費、帳號、刪除、不可逆或重要操作不可直接執行，必須放入 toolRequests 並 requiresConfirmation=true。普通聊天時各陣列可為空。",
    input, tools,
    text: { format: { type: "json_schema", name: "xuanyao_response", strict: true, schema } },
    max_output_tokens: 1400,
    store: false
  };

  const toolActions = [];
  let response;

  for (let round = 0; round < 4; round++) {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(request)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "AI provider error." });

    const calls = Array.isArray(data.output) ? data.output.filter(x => x && x.type === "function_call") : [];
    if (!calls.length) break;

    input = input.concat(data.output);
    for (const call of calls.slice(0, 6)) {
      let args = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch {}
      let result = { accepted: false, error: "unknown_tool" };

      if (call.name === "xuanyao_save_memory") {
        const clean = String(args.content || "").trim().slice(0, 500);
        result = clean
          ? { accepted: true, action: "memory.save", content: clean, reason: String(args.reason || "AI判定值得保存") }
          : { accepted: false, error: "empty_memory" };
      }
      if (call.name === "xuanyao_create_task") {
        const clean = String(args.text || "").trim().slice(0, 300);
        result = clean
          ? { accepted: true, action: "task.create", text: clean, parentId: String(args.parentId || "") }
          : { accepted: false, error: "empty_task" };
      }
      if (result.accepted) toolActions.push(result);
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }

  let parsed;
  try { parsed = JSON.parse(response?.output_text || "{}"); }
  catch {
    parsed = { reply: response?.output_text || "玄曜已收到。", memories: [], tasks: [], toolRequests: [] };
  }

  return res.status(200).json({
    reply: parsed.reply || "玄曜已收到。",
    memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    toolRequests: Array.isArray(parsed.toolRequests) ? parsed.toolRequests : [],
    toolActions: toolActions.slice(0, 8),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna"
  });
}