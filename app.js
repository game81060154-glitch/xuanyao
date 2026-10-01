const KEY = "xuanyao.messages.v2";
const TASK_KEY = "xuanyao.tasks.v1";
const MEMORY_KEY = "xuanyao.memory.v1";
const CORE_VERSION = "1.10";
const GATEWAY_KEY = "xuanyao.gateway.v1";
const APPROVAL_KEY = "xuanyao.approvals.v1";
const ACTIVITY_KEY = "xuanyao.activity.v1";
const TOOL_RUN_KEY = "xuanyao.toolRuns.v1";

const chat = document.getElementById("chat");
const composer = document.getElementById("composer");
const message = document.getElementById("message");
const clearBtn = document.getElementById("clearBtn");
const coreState = document.getElementById("coreState");
const backendState = document.getElementById("backendState");
const dataSearch = document.getElementById("dataSearch");
const dataList = document.getElementById("dataList");
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");

const demoReplies = [
  "收到。玄曜已接管這項任務，先拆解目標，再把需要你決定的部分留給你。",
  "已分析需求。目前使用本機核心；接上安全後端後即可切換成真正的模型回應。",
  "玄曜已記錄這次對話。資料、任務與歷史紀錄會持續累積在本機。",
  "可以。小型整理可自動完成；涉及外部帳號、付款或不可逆操作時保留確認。"
];

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

let messages = readJSON(KEY, []);
let tasks = readJSON(TASK_KEY, []);
let memories = readJSON(MEMORY_KEY, []);
let approvals = readJSON(APPROVAL_KEY, []);
let activities = readJSON(ACTIVITY_KEY, []);

function saveMemories() { memories = memories.slice(-500); writeJSON(MEMORY_KEY, memories); renderMemoryCount(); renderMemoryTools(); }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()); }
function saveMemory(text, source="xuanyao") {
  const clean=String(text||"").trim();
  if(!clean) return false;
  memories.unshift({id:makeId(),type:"note",content:clean,source,createdAt:Date.now(),updatedAt:Date.now(),pinned:false});
  saveMemories(); return true;
}
function createTask(text, parentId=null, dependsOn=[]) {
  const clean=String(text||"").trim();
  if(!clean) return false;
  const deps=Array.isArray(dependsOn)?dependsOn.filter(Boolean).slice(0,8):[];
  tasks.unshift({id:makeId(),text:clean,done:false,at:Date.now(),parentId,dependsOn:deps});
  writeJSON(TASK_KEY,tasks); renderTasks(); return true;
}
function canCompleteTask(task) {
  const deps=Array.isArray(task.dependsOn)?task.dependsOn:[];
  return deps.every(id => { const dep=tasks.find(t=>t.id===id); return !dep || dep.done; });
}
function completeTask(id) {
  const task=tasks.find(t=>t.id===id);
  if(!task) return;
  if(!canCompleteTask(task)){ logActivity("任務阻擋","尚有前置任務未完成｜"+task.text); return; }
  task.done=!task.done; task.completedAt=task.done?Date.now():null;
  writeJSON(TASK_KEY,tasks); renderTasks();
  logActivity(task.done?"任務完成":"任務重開",task.text);
}
function routeLocalIntent(text, reply="") {
  const lower=String(text).toLowerCase();
  let changed=false;
  if(/記住|記錄|保存|存起來|記憶/.test(lower)) changed=saveMemory(text,"user")||changed;
  if(/建立任務|新增任務|提醒我|待辦|要做/.test(lower)) {
    changed=createTask(text)||changed;
  }
  if(/目前|現在|進度|專案/.test(lower) && reply) saveMemory("玄曜回應摘要："+reply,"xuanyao");
  return changed;
}
function logActivity(type, text) {
  activities.unshift({ id: makeId(), type, text: String(text || ""), at: Date.now() });
  activities = activities.slice(0, 100);
  writeJSON(ACTIVITY_KEY, activities);
  renderActivities();
}
function renderActivities() {
  const el = document.getElementById("activityList");
  if (!el) return;
  el.innerHTML = activities.length ? activities.slice(0, 30).map(a =>
    `<div class="activity-item"><b>${escapeHTML(a.type || "執行")}</b><time>${new Date(a.at).toLocaleString()}</time><p>${escapeHTML(a.text)}</p></div>`
  ).join("") : "<div class='empty'>尚無執行紀錄。</div>";
}
function renderApprovals() {
  const el = document.getElementById("approvalList");
  if (!el) return;
  const pending = approvals.filter(a => a.status === "pending");
  el.innerHTML = pending.length ? pending.map(a =>
    `<div class="approval-item"><b>${escapeHTML(a.toolId || "外部工具")}</b><p>${escapeHTML(a.reason || "玄曜提出外部操作需求。")}</p><div class="approval-actions"><button data-approve="${a.id}" type="button">確認</button><button data-reject="${a.id}" type="button">拒絕</button></div></div>`
  ).join("") : "<div class='empty'>目前沒有需要確認的外部操作。</div>";
}
function addApproval(item) {
  const approval = { id: makeId(), toolId: item.toolId || "external.request", reason: item.reason || "玄曜提出外部操作需求。", status: "pending", at: Date.now() };
  approvals.unshift(approval);
  approvals = approvals.slice(0, 50);
  writeJSON(APPROVAL_KEY, approvals);
  renderApprovals();
  logActivity("待確認", approval.toolId + "｜" + approval.reason);
}
function applyApproval(id, status) {
  const item = approvals.find(a => a.id === id);
  if (!item) return;
  item.status = status;
  item.resolvedAt = Date.now();
  writeJSON(APPROVAL_KEY, approvals);
  renderApprovals();
  logActivity(status === "approved" ? "已確認" : "已拒絕", item.toolId + "｜" + item.reason + (status === "approved" ? "｜等待對應外部工具執行" : ""));
}
function renderMemoryCount() { const el=document.getElementById("memoryCount"); if(el) el.textContent=`記憶 ${memories.length}`; }
function executeToolActions(toolActions) {
  if (!Array.isArray(toolActions) || !toolActions.length) return;
  const runKey = TOOL_RUN_KEY;
  const seen = readJSON(runKey, []);
  const seenSet = new Set(seen);
  let changed = false;

  function recordRun(action, status, detail, attempt) {
    const runs = readJSON("xuanyao.toolRuns.detail.v1", []);
    runs.unshift({ id: makeId(), action: action.action || "unknown", status, detail: String(detail || ""), attempt, at: Date.now() });
    writeJSON("xuanyao.toolRuns.detail.v1", runs.slice(0, 100));
  }

  function runOnce(action, attempt) {
    if (action.action === "memory.save" && action.content) {
      const ok = saveMemory(action.content, "xuanyao");
      const verified = ok && memories.some(m => m.content === String(action.content).trim());
      return { ok: verified, detail: verified ? "記憶已寫入並驗證" : "記憶寫入驗證失敗" };
    }
    if (action.action === "task.create" && action.text) {
      const before = tasks.length;
      createTask(action.text, action.parentId || null, action.dependsOn || []);
      const verified = tasks.length > before && tasks.some(t => t.text === String(action.text).trim() && !t.done);
      return { ok: verified, detail: verified ? "任務已建立並驗證" : "任務建立驗證失敗" };
    }
    return { ok: false, detail: "未知或缺少必要參數的工具動作" };
  }

  toolActions.slice(0, 8).forEach(action => {
    const fingerprint = JSON.stringify(action);
    if (seenSet.has(fingerprint)) return;

    let result = runOnce(action, 1);
    if (!result.ok && (action.action === "memory.save" || action.action === "task.create")) {
      result = runOnce(action, 2);
    }

    seenSet.add(fingerprint);
    changed = true;
    recordRun(action, result.ok ? "success" : "failed", result.detail, result.ok ? (result.detail.includes("驗證") ? 1 : 2) : 2);
    logActivity(result.ok ? "工具完成" : "工具失敗", action.action + "｜" + result.detail);
  });

  if (changed) writeJSON(runKey, Array.from(seenSet).slice(-100));
}
function applyStructuredActions(data, sourceText, reply) {
  executeToolActions(data.toolActions);
  const memoriesFromAI = Array.isArray(data.memories) ? data.memories : [];
  const tasksFromAI = Array.isArray(data.tasks) ? data.tasks : [];
  const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : [];

  memoriesFromAI.slice(0, 5).forEach(item => {
    if (item && item.content) saveMemory(item.content, "xuanyao");
  });

  tasksFromAI.slice(0, 8).forEach(item => {
    if (item && item.text && !tasks.some(t => !t.done && t.text === item.text)) createTask(item.text, item.parentId || null, item.dependsOn || []);
  });

  if (toolRequests.length) {
    const pending = toolRequests.slice(0, 5);
    pending.forEach(item => {
      if (item && item.requiresConfirmation !== false) addApproval(item);
      else logActivity("本機工具", (item.toolId || "未知工具") + "｜" + (item.reason || "已提出"));
    });
    const summary = pending.map(x =>
      "• " + (x.toolId || "未知工具") + "｜" + (x.reason || "需要工具處理") +
      (x.requiresConfirmation ? "｜已放入待確認" : "｜本機安全")
    ).join("\n");
    add("system", "玄曜工具提案：\n" + summary);
  }

  if (memoriesFromAI.length || tasksFromAI.length || toolRequests.length) {
    saveMemory("玄曜本次結構化處理：記憶 " + memoriesFromAI.length +
      "、任務 " + tasksFromAI.length + "、工具提案 " + toolRequests.length, "xuanyao");
  }
}
function saveMessages() {
  messages = messages.slice(-300);
  writeJSON(KEY, messages);
}
function add(role, text, persist = true) {
  const item = document.createElement("div");
  item.className = "msg " + (role === "user" ? "user" : "system");
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = role === "user" ? "你" : "玄曜";
  item.append(meta, document.createTextNode(text));
  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
  if (persist) {
    messages.push({ role, text, at: Date.now() });
    saveMessages();
    renderData();
  }
}
function render() {
  chat.innerHTML = "";
  if (!messages.length) {
    add("system", "玄曜已啟動。你可以直接說目標，例如：「幫我規劃玄曜下一階段」。", false);
    return;
  }
  messages.forEach(item => add(item.role, item.text, false));
}
function renderData() {
  const q = (dataSearch.value || "").trim().toLowerCase();
  const rows = messages.filter(x => !q || (x.text || "").toLowerCase().includes(q)).slice().reverse().slice(0, 60);
  dataList.innerHTML = rows.length ? rows.map(x =>
    `<article class="data-item"><b>${x.role === "user" ? "你" : "玄曜"}</b><time>${new Date(x.at).toLocaleString()}</time><p>${escapeHTML(x.text)}</p></article>`
  ).join("") : "<div class='empty'>目前沒有符合的資料。</div>";
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function renderMemoryTools() {
  const list = document.getElementById("memoryList");
  if (!list) return;
  const q = (dataSearch.value || "").trim().toLowerCase();
  const rows = memories.filter(m => !q || (m.content || "").toLowerCase().includes(q)).slice(0, 30);
  list.innerHTML = rows.length ? rows.map(m =>
    `<article class="data-item"><b>記憶</b><time>${new Date(m.updatedAt || m.createdAt).toLocaleString()}</time><p>${escapeHTML(m.content)}</p></article>`
  ).join("") : "<div class='empty'>目前沒有符合的記憶。</div>";
}
function renderTasks() {
  taskList.innerHTML = tasks.length ? tasks.map(t =>
    `<div class="task ${t.done ? "done" : ""}"><button data-task="${t.id}" class="task-toggle" type="button">${t.done ? "✓" : "○"}</button><span>${escapeHTML(t.text)}</span><button data-delete="${t.id}" class="task-delete" type="button">刪除</button></div>`
  ).join("") : "<div class='empty'>尚無任務。</div>";
}
async function ask(text) {
  const clean = text.trim();
  if (!clean) return;
  add("user", clean);
  coreState.textContent = "處理中｜分析需求";
  try {
    const gateway = localStorage.getItem(GATEWAY_KEY) || "/api/chat";
    const history = messages.slice(-12).map(x => ({
      role: x.role === "user" ? "user" : "assistant",
      text: x.text
    }));
    const res = await fetch(gateway, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: clean, history })
    });
    if (!res.ok) throw new Error("backend");
    const data = await res.json();
    const reply = data.reply || "後端沒有提供回應。";
    add("system", reply);
    applyStructuredActions(data, clean, reply);
    routeLocalIntent(clean, reply);
    backendState.textContent = "Connected";
  } catch {
    const reply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
    add("system", reply);
    backendState.textContent = "Demo｜後端未連線";
  } finally {
    coreState.textContent = "待命中｜本機核心";
  }
}

composer.addEventListener("submit", e => {
  e.preventDefault();
  const text = message.value;
  message.value = "";
  message.style.height = "auto";
  ask(text);
});
message.addEventListener("input", () => {
  message.style.height = "auto";
  message.style.height = Math.min(message.scrollHeight, 140) + "px";
});
document.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => ask(b.dataset.prompt)));

clearBtn.addEventListener("click", () => {
  if (!confirm("確定清除全部對話紀錄？")) return;
  messages = [];
  saveMessages();
  render();
  renderData();
});

dataSearch.addEventListener("input", () => { renderData(); renderMemoryTools(); });

document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = { version: CORE_VERSION, exportedAt: new Date().toISOString(), messages, tasks, memories, approvals, activities };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `xuanyao-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (Array.isArray(payload.messages)) messages = payload.messages;
    if (Array.isArray(payload.tasks)) tasks = payload.tasks;
    if (Array.isArray(payload.memories)) memories = payload.memories;
    if (Array.isArray(payload.approvals)) approvals = payload.approvals;
    if (Array.isArray(payload.activities)) activities = payload.activities;
    saveMessages(); writeJSON(TASK_KEY, tasks); writeJSON(MEMORY_KEY, memories);
    writeJSON(APPROVAL_KEY, approvals); writeJSON(ACTIVITY_KEY, activities);
    render(); renderData(); renderTasks(); renderMemoryCount(); renderMemoryTools(); renderApprovals(); renderActivities();
  } catch { alert("匯入失敗：檔案不是有效的玄曜 JSON 備份。"); }
  e.target.value = "";
});

taskForm.addEventListener("submit", e => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text, done:false, at:Date.now() });
  writeJSON(TASK_KEY, tasks);
  taskInput.value = "";
  renderTasks();
});
taskList.addEventListener("click", e => {
  const id = e.target.dataset.task || e.target.dataset.delete;
  if (!id) return;
  if (e.target.dataset.task) {
    completeTask(id);
    return;
  } else {
    tasks = tasks.filter(t => t.id !== id);
  }
  writeJSON(TASK_KEY, tasks);
  renderTasks();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
render();
renderData();
renderTasks();
renderApprovals();
renderActivities();

const gatewayInput = document.getElementById("gatewayInput");
const saveGatewayBtn = document.getElementById("saveGatewayBtn");
if (gatewayInput && saveGatewayBtn) {
  gatewayInput.value = localStorage.getItem(GATEWAY_KEY) || "";
  saveGatewayBtn.addEventListener("click", () => {
    const value = gatewayInput.value.trim();
    if (!value) {
      localStorage.removeItem(GATEWAY_KEY);
      backendState.textContent = "Demo";
      return;
    }
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      localStorage.setItem(GATEWAY_KEY, value);
      backendState.textContent = "Gateway 已設定";
    } catch {
      alert("請輸入有效的 AI Gateway 網址。");
    }
  });
}


const saveMemoryBtn=document.getElementById("saveMemoryBtn");
const clearMemoryBtn=document.getElementById("clearMemoryBtn");
if(saveMemoryBtn) saveMemoryBtn.addEventListener("click",()=>{
  const text=(message.value||"").trim();
  if(!text){ alert("先在輸入框寫下要記住的內容。"); return; }
  memories.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),type:"note",content:text,source:"user",createdAt:Date.now(),updatedAt:Date.now(),pinned:false});
  saveMemories(); renderMemoryTools(); message.value=""; message.style.height="auto";
});
if(clearMemoryBtn) clearMemoryBtn.addEventListener("click",()=>{
  if(!confirm("確定清除玄曜本機記憶？")) return;
  memories=[]; saveMemories(); renderMemoryTools();
});
const planTaskBtn=document.getElementById("planTaskBtn");
if(planTaskBtn) planTaskBtn.addEventListener("click",()=>{
  const pending=tasks.filter(t=>!t.done).slice(0,8);
  if(!pending.length){ alert("目前沒有未完成任務。"); return; }
  ask("請直接分析目前未完成任務，安排最省力的執行順序；只有真正需要新增的下一步才建立任務，不要重複現有待辦。");
});
renderMemoryCount();
