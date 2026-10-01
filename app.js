const KEY = "xuanyao.messages.v2";
const TASK_KEY = "xuanyao.tasks.v1";
const CORE_VERSION = "1.2";

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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: clean, history: messages.slice(-20) })
    });
    if (!res.ok) throw new Error("backend");
    const data = await res.json();
    add("system", data.reply || "後端沒有提供回應。");
    backendState.textContent = "Connected";
  } catch {
    const reply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
    add("system", reply);
    backendState.textContent = "Demo";
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
  const payload = { version: CORE_VERSION, exportedAt: new Date().toISOString(), messages, tasks };
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