const KEY = "xuanyao.messages.v2";
const TASK_KEY = "xuanyao.tasks.v1";
const MEMORY_KEY = "xuanyao.memory.v1";
const CORE_VERSION = "1.4";
const GATEWAY_KEY = "xuanyao.gateway.v1";

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

function saveMemories() { memories = memories.slice(-500); writeJSON(MEMORY_KEY, memories); renderMemoryCount(); }
function renderMemoryCount() { const el=document.getElementById("memoryCount"); if(el) el.textContent=`記憶 ${memories.length}`; }
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
    add("system", data.reply || "後端沒有提供回應。");
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

dataSearch.addEventListener("input", renderData);

document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = { version: CORE_VERSION, exportedAt: new Date().toISOString(), messages, tasks, memories };
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
    saveMessages(); writeJSON(TASK_KEY, tasks);
    render(); renderData(); renderTasks();
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
    tasks = tasks.map(t => t.id === id ? {...t, done:!t.done} : t);
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
  saveMemories(); message.value=""; message.style.height="auto";
});
if(clearMemoryBtn) clearMemoryBtn.addEventListener("click",()=>{
  if(!confirm("確定清除玄曜本機記憶？")) return;
  memories=[]; saveMemories();
});
const planTaskBtn=document.getElementById("planTaskBtn");
if(planTaskBtn) planTaskBtn.addEventListener("click",()=>{
  const pending=tasks.filter(t=>!t.done).slice(0,5);
  if(!pending.length){ alert("目前沒有未完成任務。"); return; }
  const plan=pending.map((t,i)=>({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+i),text:"執行："+t.text,done:false,at:Date.now(),parentId:t.id}));
  tasks=[...plan,...tasks]; writeJSON(TASK_KEY,tasks); renderTasks();
  ask("請依照目前任務幫我安排執行順序與最省力的下一步。");
});
renderMemoryCount();
