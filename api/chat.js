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
      assessment: { type: "string" },
      options: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string" }, description: { type: "string" },
          risk: { type: "string" }, known: { type: "boolean" }
        },
        required: ["name", "description", "risk", "known"]
      }},
      decision: { type: "string" },
      reply: { type: "string" },
      memories: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { content: { type: "string" }, reason: { type: "string" } },
        required: ["content", "reason"]
      }},
      tasks: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { text: { type: "string" }, parentId: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } } },
        required: ["text", "parentId", "dependsOn"]
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
    required: ["assessment", "options", "decision", "reply", "memories", "tasks", "toolRequests"]
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
          text: { type: "string" }, parentId: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } }
        },
        required: ["text", "parentId", "dependsOn"], additionalProperties: false
      }, strict: true
    }
  ];

  const request = {
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions: "你是玄曜，使用繁體中文，具備自主判斷能力。不要只等待使用者給完整方案：先理解真正目標與限制，主動拆解、探索未知但合理的替代方案，指出已知與未知，評估風險，並自行選擇低風險且符合目標的下一步。未知方案可以提出與研究方向，但不可把未知當成已驗證事實。對不需要外部權限的規劃、整理、比較與本機安全工具，可主動推進。涉及外部帳號、付款、刪除、公開發布、不可逆、重大資料變更或高風險操作，不可直接執行，必須放入 toolRequests 並 requiresConfirmation=true。assessment 說明判斷依據，options 提供有價值的替代路徑，decision 說明目前選擇的低風險下一步。不要輸出隱藏推理過程，只提供精簡可驗證的結論與依據。普通聊天時陣列可為空。",
    input, tools,
    text: { format: { type: "json_schema", name: "xuanyao_response", strict: true, schema } },
    max_output_tokens: 1400,
    store: false
  };

  const toolActions = [];
  let response;

  for (let round = 0; round < 4; round++) {
    request.input = input;
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
          ? { accepted: true, action: "task.create", text: clean, parentId: String(args.parentId || ""), dependsOn: Array.isArray(args.dependsOn) ? args.dependsOn.slice(0,8) : [] }
          : { accepted: false, error: "empty_task" };
      }
      if (result.accepted) toolActions.push(result);
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }

  let parsed;
  try { parsed = JSON.parse(response?.output_text || "{}"); }
  catch {
    parsed = { assessment: "", options: [], decision: "", reply: response?.output_text || "玄曜已收到。", memories: [], tasks: [], toolRequests: [] };
  }

  return res.status(200).json({
    assessment: parsed.assessment || "",
    options: Array.isArray(parsed.options) ? parsed.options.slice(0, 5) : [],
    decision: parsed.decision || "",
    reply: parsed.reply || "玄曜已收到。",
    memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    toolRequests: Array.isArray(parsed.toolRequests) ? parsed.toolRequests : [],
    toolActions: toolActions.slice(0, 8),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna"
  });
}