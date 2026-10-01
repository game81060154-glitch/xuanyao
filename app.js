const KEY = "xuanyao.messages.v2";
const TASK_KEY = "xuanyao.tasks.v1";
const MEMORY_KEY = "xuanyao.memory.v1";
const CORE_VERSION = "1.44";
const BACKEND_HEALTH_KEY = "xuanyao.backendHealth.v1";
const MAINTENANCE_KEY = "xuanyao.maintenance.v1";
const AUTOMATION_KEY = "xuanyao.automation.v1";
const GATEWAY_KEY = "xuanyao.gateway.v1";
const APPROVAL_KEY = "xuanyao.approvals.v1";
const ACTIVITY_KEY = "xuanyao.activity.v1";
const DECISION_KEY = "xuanyao.decisions.v1";
const TOOL_RUN_KEY = "xuanyao.toolRuns.v1";
const RESEARCH_KEY = "xuanyao.research.v1";
const GOAL_KEY = "xuanyao.goal.v1";
const RECOVERY_KEY = "xuanyao.recovery.v1";

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
const goalInput = document.getElementById("goalInput");

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
let decisions = readJSON(DECISION_KEY, []);
let researchRecords = readJSON(RESEARCH_KEY, []);
let goalState = readJSON(GOAL_KEY, null);

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
  return deps.every(id => { const dep=tasks.find(t=>t.id===id); return Boolean(dep) && dep.done; });
}
function classifyTask(text){
  const s=String(text||"");
  if(/^查證：/.test(s)) return "research";
  if(/記住|記錄|保存|匯出|備份/.test(s)) return "local";
  if(/付款|購買|發布|刪除|登入|授權|寄送/.test(s)) return "external_confirm";
  if(/整理|分析|規劃|建立任務|檢查|比較/.test(s)) return "local";
  return "needs_ai";
}
function executeTaskLocally(task){
  if(!task) return {ok:false,reason:"找不到任務"};
  const type=classifyTask(task.text);
  if(type==="external_confirm") return {ok:false,blocked:true,reason:"此任務涉及外部、付款、授權或不可逆操作，需要確認"};
  if(type==="research") return {ok:false,blocked:true,reason:"研究任務需要啟動受控網路查證"};
  if(type==="needs_ai") return {ok:false,blocked:true,reason:"需要 AI 推理或外部能力，暫不冒充已執行"};
  return {ok:true,type,reason:"本機安全任務已完成初步執行判定"};
}
function replanBlockedTask(task, reason){
  if(!task) return null;
  const base=String(task.text||"");
  const replans=[
    "重新拆解："+base,
    "尋找低風險替代方案："+base
  ];
  const existing=new Set(tasks.filter(t=>!t.done&&!t.blocked).map(t=>t.text));
  const candidate=replans.find(x=>!existing.has(x));
  if(!candidate) return null;
  const created=createTask(candidate,task.id,[]);
  logActivity("自主改道",candidate+"｜原因："+reason);
  return created;
}
function auditSystemLocally(){
  const checks=[];
  const required=[
    ["自主判斷",typeof recordDecision==="function"],
    ["任務執行",typeof executeNextSafeTask==="function"],
    ["自主改道",typeof replanBlockedTask==="function"],
    ["目標管理",typeof manageGoalLocally==="function"],
    ["失敗恢復",typeof recoverFailedTask==="function"]
  ];
  required.forEach(([name,ok])=>checks.push({name,status:ok?"ok":"missing"}));
  const pending=tasks.filter(t=>!t.done&&!t.blocked).length;
  const blocked=tasks.filter(t=>!t.done&&t.blocked).length;
  const findings=[];
  if(checks.some(x=>x.status==="missing")) findings.push("核心能力存在缺口");
  if(blocked) findings.push("存在被安全停機的任務");
  if(!goalState||!goalState.goal) findings.push("尚未設定目標");
  const result={at:Date.now(),version:CORE_VERSION,checks,pending,blocked,findings};
  logActivity("系統自審",findings.length?findings.join("｜"):"核心能力檢查正常");
  return result;
}
function proposeSystemOptimization(audit){
  if(!audit) audit=auditSystemLocally();
  const proposals=[];
  if(audit.blocked>0) proposals.push({type:"review_blocked_tasks",risk:"low",reason:"檢查安全停機任務是否已有更合適替代路線"});
  if(audit.pending===0 && audit.findings.includes("尚未設定目標")) proposals.push({type:"goal_setup",risk:"low",reason:"需要使用者設定要達成的目標"});
  if(audit.checks.some(x=>x.status==="missing")) proposals.push({type:"core_repair",risk:"high",reason:"核心能力缺失，禁止自動修改核心程式"});
  if(!proposals.length) proposals.push({type:"maintenance_review",risk:"low",reason:"目前核心功能正常，維持現狀並等待新的目標"});
  return proposals;
}
function prioritizeOptimizations(proposals){
  return (Array.isArray(proposals)?proposals:[]).map((p,i)=>{
    const risk=String(p.risk||"low");
    const riskWeight=risk==="high"?0:risk==="controlled"?2:3;
    const impact=String(p.type||"").includes("core")?1:2;
    return {...p,priority:riskWeight+impact,order:i};
  }).sort((a,b)=>b.priority-a.priority||a.order-b.order);
}
function selectSafeOptimization(proposals){
  const ranked=prioritizeOptimizations(proposals);
  const selected=ranked.find(p=>p.risk!=="high");
  if(!selected) return {selected:null,ranked};
  logActivity("優化選擇","選定："+selected.type+"｜優先度："+selected.priority);
  return {selected,ranked};
}
function createAutonomySnapshot(orchestration){
  const snapshot={
    id:makeId("auto"),
    at:Date.now(),
    version:CORE_VERSION,
    mode:orchestration?.mode||"unknown",
    action:orchestration?.action||null,
    goal:goalState?.goal||null,
    pendingTasks:tasks.filter(t=>!t.done&&!t.blocked).length,
    blockedTasks:tasks.filter(t=>!t.done&&t.blocked).length
  };
  const key="xuanyao.autonomy.v1";
  const history=readJSON(key,[]);
  history.unshift(snapshot);
  writeJSON(key,history.slice(0,100));
  return snapshot;
}
function detectAutonomyLoop(){
  const history=readJSON("xuanyao.autonomy.v1",[]);
  if(history.length<3) return {loop:false};
  const recent=history.slice(0,3).map(x=>x.mode+"|"+(x.action?.id||x.action?.type||""));
  const loop=recent.length===3 && new Set(recent).size===1;
  if(loop) logActivity("自主循環偵測","最近 3 次自主決策完全重複，暫停原路徑。");
  return {loop,recent};
}
function recoverAutonomyLoop(){
  const key="xuanyao.autonomy.guard.v1";
  const guard=readJSON(key,{blocked:false});
  if(!guard.blocked) return {recovered:false,reason:"目前沒有循環鎖定"};
  guard.blocked=false;
  guard.recoveredAt=Date.now();
  guard.recoveryReason="已清除循環鎖，等待重新規劃";
  writeJSON(key,guard);
  logActivity("自主恢復","循環鎖已清除，允許重新規劃。");
  return {recovered:true};
}
function getAutonomyRecoveryState(){
  return readJSON("xuanyao.autonomy.guard.v1",{blocked:false});
}
function guardAutonomousLoop(){
  const detection=detectAutonomyLoop();
  if(!detection.loop) return {allowed:true};
  const key="xuanyao.autonomy.guard.v1";
  const guard=readJSON(key,{blocked:false,at:0});
  guard.blocked=true; guard.at=Date.now(); guard.reason="偵測到重複自主循環";
  writeJSON(key,guard);
  add("system","玄曜自主防護：偵測到重複決策循環，已暫停原路徑並要求重新規劃。");
  return {allowed:false,reason:guard.reason};
}
function evaluateActionGate(action={}) {
  const risk=String(action.risk||"low").toLowerCase();
  const external=action.external===true || risk==="high" || risk==="critical";
  const irreversible=action.irreversible===true;
  const needsConfirmation=external || irreversible;
  return {
    allowed: !needsConfirmation,
    needsConfirmation,
    risk,
    reason: needsConfirmation
      ? "此操作可能涉及外部權限、高風險或不可逆變更，玄曜先停在確認點。"
      : "低風險且可逆，可由玄曜繼續處理。"
  };
}

const SELF_CODE_CYCLE_KEY="xuanyao.selfCodeCycle.v1";
function getSelfCodeCycle(){return readJSON(SELF_CODE_CYCLE_KEY,{status:"idle",branch:"",commitSha:"",target:"",failure:"",attempts:0,updatedAt:0});}
function saveSelfCodeCycle(v){writeJSON(SELF_CODE_CYCLE_KEY,v);}
function recordSelfCodeCycle(patch={}){const s={...getSelfCodeCycle(),...patch,updatedAt:Date.now()};saveSelfCodeCycle(s);return s;}
function dispatchSelfCodeRecovery(){
  const s=getSelfCodeCycle();
  if(s.status==="await_confirmation"||s.status==="safe_stop") return s;
  if(s.status==="failed"){
    const recovery=prepareSelfCodeReplan(s.failure,s.target);
    if(!recovery.ok){return recordSelfCodeCycle({status:"safe_stop",failure:recovery.reason});}
    return recordSelfCodeCycle({status:"replan_ready",attempts:recovery.attempt,target:recovery.target,failure:recovery.reason});
  }
  if(s.status==="candidate_failed"){
    return recordSelfCodeCycle({status:"failed",failure:s.failure});
  }
  return s;
}
function integrateSelfCodeCycle(base){
  const cycle=dispatchSelfCodeRecovery();
  if(cycle.status==="replan_ready") logActivity("自我修復調度","已產生下一輪受控重新規劃，不直接修改 main。");
  if(cycle.status==="safe_stop") logActivity("自我修復安全停止",cycle.failure||"已達安全限制。");
  return {...base,selfCodeCycle:cycle};
}

function autonomousOrchestrator(){
  const guard=guardAutonomousLoop();
  if(!guard.allowed) {
    const recovered=recoverAutonomyLoop();
    if (recovered.recovered) {
      logActivity("自主循環恢復","偵測到重複路徑後清除暫停狀態，重新進入安全決策流程。");
    } else {
      return {at:Date.now(),mode:"safe_stop",reason:guard.reason,action:null};
    }
  }
  const goal=manageGoalLocally();
  const system=autonomousSystemManagement();
  const taskState=getAutomationState();
  let mode="maintenance";
  let action=null;
  if(taskState.nextTask){
    mode="goal_execution";
    action={type:"task",id:taskState.nextTask.id,text:taskState.nextTask.text};
  }else if(system.selected){
    mode="system_optimization";
    action={type:"optimization",proposal:system.selected};
  }else if(goal.status==="blocked"){
    mode="safe_stop";
  }else{
    mode="review";
  }
  const result={at:Date.now(),mode,goal,system,action};
  const integrated=integrateSelfCodeCycle(result);
  const snapshot=createAutonomySnapshot(result);
  result.selfCodeCycle=integrated.selfCodeCycle;
  result.snapshotId=snapshot.id;
  logActivity("自主調度",mode+(action?.text?"｜"+action.text:""));
  return result;
}
function validateSelfOptimization(before, after) {
  const b=before || {};
  const a=after || {};
  const beforeFindings=Number(b.findingsCount||0);
  const afterFindings=Number(a.findingsCount||0);
  return {
    valid: afterFindings <= beforeFindings,
    beforeFindings,
    afterFindings,
    reason: afterFindings <= beforeFindings ? "改善後未增加已知問題。" : "改善後發現問題增加，暫不採用。"
  };
}

function buildSelfCodeChangePlan(target, reason="") {
  return {
    id: makeId(),
    target: String(target||"").trim(),
    reason: String(reason||"").trim(),
    mode: "controlled",
    backupRequired: true,
    validationRequired: true,
    rollbackRequired: true,
    status: "planned",
    at: Date.now()
  };
}

function validateSelfCodeChangePlan(plan) {
  if (!plan || !plan.target) return {valid:false, reason:"缺少修改目標。"};
  if (!plan.backupRequired || !plan.validationRequired || !plan.rollbackRequired) {
    return {valid:false, reason:"缺少備份、驗證或回退條件。"};
  }
  return {valid:true, reason:"符合受控自我修改條件。"};
}

function executeControlledSelfCodeCycle(target, reason="", proposedChange="") {
  const plan=buildSelfCodeChangePlan(target, reason);
  const planCheck=validateSelfCodeChangePlan(plan);
  if(!planCheck.valid) return {status:"rejected",plan,planCheck};
  const gate=evaluateActionGate({risk:"controlled",external:false,irreversible:false});
  if(!gate.allowed) return {status:"await_confirmation",plan,gate};
  const change=String(proposedChange||"").trim();
  if(!change) return {status:"planned_only",plan,reason:"尚未提供具體修改內容，避免空修改。"};
  const backup={id:makeId(),target:plan.target,at:Date.now(),status:"ready"};
  const validation={syntax:"pending",behavior:"pending",rollback:"ready"};
  logActivity("受控自我修改","已建立備份與驗證閘門；修改需經驗證後才可保留。");
  return {status:"ready_for_validation",plan,backup,validation,change};
}

function selfEvolutionCycle() {
  const audit = auditSystemLocally();
  const proposals = prioritizeOptimizations(proposeSystemOptimization(audit));
  const selected = selectSafeOptimization(proposals);
  if (!selected) return {status:"no_safe_change", audit, proposals};
  const gate = evaluateActionGate(selected);
  if (!gate.allowed) return {status:"await_confirmation", audit, proposals, selected, gate};
  const before = { findingsCount: Number(audit.findings?.length || 0) };
  const simulatedAfter = { findingsCount: before.findingsCount };
  const validation = validateSelfOptimization(before, simulatedAfter);
  if (!validation.valid) return {status:"rejected", audit, selected, validation};
  logActivity("自我進化週期", "完成檢查、選擇與驗證；本輪未直接修改核心程式碼。");
  return {status:"validated_no_code_change", audit, selected, validation};
}

function autonomousSystemManagement(){
  const audit=auditSystemLocally();
  const proposals=proposeSystemOptimization(audit);
  const choice=selectSafeOptimization(proposals);
  return {audit,proposals:choice.ranked,selected:choice.selected};
}
function validateOptimization(before,after){
  const beforeFindings=Array.isArray(before?.findings)?before.findings:[];
  const afterFindings=Array.isArray(after?.findings)?after.findings:[];
  const improved=afterFindings.length<=beforeFindings.length;
  const result={ok:improved,before:beforeFindings.length,after:afterFindings.length,at:Date.now()};
  logActivity("優化驗證",improved?"優化後問題數未增加":"優化後問題數增加，暫停後續自動優化");
  return result;
}
function checkCoreVersionConsistency(){
  const version=String(CORE_VERSION||"");
  const result={version,valid:/^1\.\d+$/.test(version),at:Date.now()};
  if(!result.valid) logActivity("版本檢查","核心版本格式異常："+version);
  return result;
}
function selfOptimize(){
  const audit=auditSystemLocally();
  const proposals=proposeSystemOptimization(audit);
  proposals.forEach(p=>logActivity("自主優化建議",p.type+"｜風險："+p.risk+"｜"+p.reason));
  return {audit,proposals};
}
function assessGoalLocally(){
  if(!goalState||!goalState.goal) return {status:"no_goal",reason:"尚未設定目標"};
  const pending=tasks.filter(t=>!t.done&&!t.blocked);
  const blocked=tasks.filter(t=>!t.done&&t.blocked);
  if(pending.length) return {status:"progressing",pending:pending.length,blocked:blocked.length};
  if(blocked.length) return {status:"blocked",blocked:blocked.length,reason:"目前沒有可安全執行的待辦步驟"};
  return {status:"needs_review",reason:"目前沒有未完成任務，應重新檢查目標是否已達成或需要新步驟"};
}
function manageGoalLocally(){
  const assessment=assessGoalLocally();
  logActivity("目標管理",assessment.status+(assessment.reason?"｜"+assessment.reason:""));
  if(assessment.status==="needs_review"){
    add("system","玄曜目標管理：目前沒有未完成安全任務。下一步應重新審查目標完成度，而不是自行宣稱已完成。");
  }
  if(assessment.status==="blocked"){
    add("system","玄曜目標管理：目前路徑受阻，已停止盲目重試；需要重新規劃或外部確認。");
  }
  return assessment;
}
function autonomousGoalCycle(maxSteps=3){
  const limit=Math.max(1,Math.min(3,Number(maxSteps)||1));
  const trace=[];
  for(let i=0;i<limit;i++){
    runSafeAutomation();
    const state=getAutomationState();
    if(!state.nextTask){ trace.push({status:"idle"}); break; }
    const task=tasks.find(t=>t.id===state.nextTask.id);
    const result=executeNextSafeTask();
    trace.push({task:task?.text||state.nextTask.text,result});
    if(result.ok) continue;
    if(result.blocked){
      const replanned=replanBlockedTask(task,result.reason);
      if(!replanned) break;
      runSafeAutomation();
      continue;
    }
    break;
  }
  return {trace,nextTask:getAutomationState().nextTask||null};
}
function autonomousAdvance(maxSteps=3){
  const limit=Math.max(1,Math.min(3,Number(maxSteps)||1));
  const results=[];
  for(let i=0;i<limit;i++){
    runSafeAutomation();
    const state=getAutomationState();
    if(!state.nextTask){
      results.push({status:"idle",reason:"沒有可安全推進的下一步"});
      break;
    }
    const result=executeNextSafeTask();
    results.push({task:state.nextTask.text,result});
    if(!result.ok) break;
    const finished=tasks.find(t=>t.id===state.nextTask.id);
    if(finished && !finished.done){
      logActivity("自主推進","執行已完成，但任務尚未通過完成驗證，暫停避免假完成。");
      results.push({status:"validation_required"});
      break;
    }
  }
  const finalState=getAutomationState();
  logActivity("自主推進",results.map(x=>x.task||x.reason||x.status).join(" → "));
  return {results,nextTask:finalState.nextTask||null};
}
function executeNextSafeTask(){
  const state=getAutomationState();
  const next=state.nextTask;
  if(!next) return {ok:false,reason:"目前沒有可執行任務"};
  const task=tasks.find(t=>t.id===next.id);
  if(!task||task.done||task.blocked) return {ok:false,reason:"下一任務已不存在、完成或被阻擋"};
  const result=executeTaskLocally(task);
  if(result.ok){
    task.lastExecution={at:Date.now(),type:result.type,status:"success",detail:result.reason};
    writeJSON(TASK_KEY,tasks); renderTasks();
    logActivity("任務執行",task.text+"｜"+result.reason);
    return result;
  }
  task.lastExecution={at:Date.now(),status:result.blocked?"blocked":"failed",detail:result.reason};
  writeJSON(TASK_KEY,tasks); renderTasks();
  if(!result.blocked) recoverFailedTask(task.id,result.reason);
  logActivity(result.blocked?"任務暫停":"任務失敗",task.text+"｜"+result.reason);
  return result;
}
function recoverFailedTask(taskId, reason="未知失敗"){
  const state=readJSON(RECOVERY_KEY, {});
  const item=tasks.find(t=>t.id===taskId); if(!item)return;
  const key=String(taskId);
  const count=Number(state[key]?.attempts||0)+1;
  state[key]={attempts:count,lastReason:String(reason).slice(0,300),at:Date.now()};
  writeJSON(RECOVERY_KEY,state);
  if(count>=3){
    item.blocked=true; item.blockReason="同一任務已連續失敗 3 次，玄曜暫停自動重試。";
    writeJSON(TASK_KEY,tasks); renderTasks(); logActivity("安全停機",item.text+"｜"+item.blockReason); return;
  }
  item.blocked=false;
  writeJSON(TASK_KEY,tasks); renderTasks();
  logActivity("失敗恢復",item.text+"｜第 "+count+" 次嘗試｜原因："+reason+"｜改由玄曜重新規劃");
}
function completeTask(id) {
  const task=tasks.find(t=>t.id===id);
  if(!task) return;
  if(!canCompleteTask(task)){ logActivity("任務阻擋","尚有前置任務未完成｜"+task.text); return; }
  task.done=!task.done; task.completedAt=task.done?Date.now():null;
  writeJSON(TASK_KEY,tasks); renderTasks();
  if(task.done){ const state=readJSON(RECOVERY_KEY,{}); delete state[id]; writeJSON(RECOVERY_KEY,state); }
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
function recordDecision(data) {
  if (!data || (!data.assessment && !data.decision && !Array.isArray(data.options))) return;
  const item = {
    id: makeId(), at: Date.now(),
    assessment: String(data.assessment || ""),
    decision: String(data.decision || ""),
    options: Array.isArray(data.options) ? data.options.slice(0,5) : []
  };
  decisions.unshift(item);
  decisions = decisions.slice(0,50);
  writeJSON(DECISION_KEY, decisions);
  renderDecisions();
}
function renderDecisions() {
  const el=document.getElementById("decisionList");
  if(!el) return;
  el.innerHTML=decisions.slice(0,10).map(d =>
    `<div class="activity-item"><b>自主判斷</b><time>${new Date(d.at).toLocaleString()}</time><p>${escapeHTML(d.assessment || "已完成判斷")}</p><p>${escapeHTML(d.decision || "尚未形成明確決策")}</p></div>`
  ).join("") || "<div class='empty'>尚無自主判斷紀錄。</div>";
}
function saveResearchRecord(item) {
  const question=String(item?.question||"").trim();
  if(!question) return false;
  const now=Date.now();
  const record={id:String(item.id||makeId()),question,purpose:String(item.purpose||"").trim(),source:String(item.source||"user").trim(),summary:String(item.summary||"").trim(),confidence:String(item.confidence||"unknown").trim(),evidenceQuality:String(item.evidenceQuality||"unknown").trim(),conflictStatus:String(item.conflictStatus||"unknown").trim(),nextQuestion:String(item.nextQuestion||"").trim(),limitations:String(item.limitations||"").trim(),status:String(item.status||"pending").trim(),sources:Array.isArray(item.sources)?item.sources.slice(0,12):[],verifiedAt:item.verifiedAt||null,createdAt:item.createdAt||now,updatedAt:now};
  researchRecords.unshift(record);
  researchRecords=researchRecords.slice(0,200);
  writeJSON(RESEARCH_KEY,researchRecords);
  renderResearch();
  return true;
}
async function reviewGoal(){
  const goal=String(goalState?.goal||"").trim();
  if(!goal){ add("system","請先設定一個真正想達成的目標。"); return; }
  coreState.textContent="目標審查中｜玄曜正在判斷";
  try{
    const gateway=localStorage.getItem(GATEWAY_KEY)||"/api/chat";
    let endpoint="/api/goal";
    if(/^https?:\\/\\//i.test(gateway)){try{const u=new URL(gateway);if(/\\/api\\/chat\\/?$/.test(u.pathname))u.pathname=u.pathname.replace(/\\/api\\/chat\\/?$/,"/api/goal");endpoint=u.toString();}catch{}}
    const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({goal,tasks,researchRecords})});
    const data=await res.json(); if(!res.ok)throw new Error(data?.error||"goal review");
    goalState={...goalState,...data,goal}; writeJSON(GOAL_KEY,goalState); renderGoal();
    add("system","目標審查： "+data.status+"｜完成度 "+data.completion+"%\n"+(data.evidence||[]).map(x=>"• "+x).join("\n")+(data.missing?.length?"\n尚缺：\n"+data.missing.map(x=>"• "+x).join("\n"):"")+"\n下一步："+data.nextStep);
    logActivity("目標審查",goal+"｜"+data.status+"｜"+data.completion+"%");
    if(data.nextStep && data.status!=="已達成" && !tasks.some(t=>!t.done&&t.text===data.nextStep)) createTask(data.nextStep);
  }catch(err){logActivity("目標審查失敗",String(err?.message||err));}
  finally{coreState.textContent="待命中｜本機核心";}
}
function renderGoal(){
  const el=document.getElementById("goalState"); if(!el)return;
  if(!goalState?.goal){el.innerHTML="<div class='empty'>尚未設定目標。</div>";return;}
  el.innerHTML="<div class='activity-item'><b>"+escapeHTML(goalState.status||"待審查")+"｜"+escapeHTML(String(goalState.completion??0))+"%</b><p>"+escapeHTML(goalState.goal)+"</p><p>"+escapeHTML(goalState.nextStep||"尚無下一步")+"</p><button type='button' id='reviewGoalBtn'>重新審查</button></div>";
  const b=document.getElementById("reviewGoalBtn");if(b)b.addEventListener("click",reviewGoal);
}
function getResearchGateway(){
  const gateway=localStorage.getItem(GATEWAY_KEY)||"/api/chat";
  if(/^https?:\\/\\//i.test(gateway)){
    try{
      const url=new URL(gateway);
      if(/\\/api\\/chat\\/?$/.test(url.pathname)) url.pathname=url.pathname.replace(/\\/api\\/chat\\/?$/,"/api/research");
      return url.toString();
    }catch{}
  }
  return "/api/research";
}
async function executeResearch(id) {
  const record=researchRecords.find(r=>r.id===id);
  if(!record) return;
  record.status="researching"; record.updatedAt=Date.now(); writeJSON(RESEARCH_KEY,researchRecords); renderResearch();
  coreState.textContent="研究中｜玄曜正在查證";
  try {
    const res=await fetch(getResearchGateway(),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:record.question,purpose:record.purpose||record.source||"驗證未知資訊"})});
    const data=await res.json();
    if(!res.ok) throw new Error(data?.error||"research");
    record.purpose=data.purpose||record.purpose||"";
    record.summary=String(data.summary||"").trim();
    record.confidence=String(data.confidence||"unknown").trim();
    record.evidenceQuality=String(data.evidenceQuality||"unknown").trim();
    record.conflictStatus=String(data.conflictStatus||"unknown").trim();
    record.nextQuestion=String(data.nextQuestion||"").trim();
    record.limitations=String(data.limitations||"").trim();
    record.status=String(data.status||"unverified").trim();
    record.sources=Array.isArray(data.sources)?data.sources.slice(0,12):[];
    record.verifiedAt=data.verifiedAt||null;
    record.updatedAt=Date.now();
    writeJSON(RESEARCH_KEY,researchRecords);
    renderResearch();
    logActivity("研究完成",record.question+"｜"+record.status+"｜來源 "+record.sources.length+" 筆");
    add("system","玄曜查證完成：\n"+record.summary+(record.limitations?"\n限制："+record.limitations:"")+(record.sources.length?"\n來源："+record.sources.map(s=>s.title||s.url).slice(0,5).join("、"):""));
    const task=tasks.find(t=>!t.done && String(t.text||"").startsWith("查證："+record.question+"｜"));
    if(task) completeTask(task.id);
    if(record.nextQuestion && !researchRecords.some(r=>r.question===record.nextQuestion && r.status!=="failed")){
      saveResearchRecord({question:record.nextQuestion,purpose:"釐清目前證據不足之處",status:"planned",summary:"上一輪查證指出仍需最小化追查。",confidence:"unverified"});
      logActivity("最小追查","已建立下一個必要查證問題");
    }
    if(record.conflictStatus && /conflict|矛盾|衝突/i.test(record.conflictStatus)) logActivity("證據衝突","不同來源存在需要重新核對的資訊");
  } catch (err) {
    record.status="failed"; record.limitations=String(err?.message||"研究服務失敗"); record.updatedAt=Date.now();
    writeJSON(RESEARCH_KEY,researchRecords); renderResearch();
    logActivity("研究失敗",record.question+"｜"+record.limitations);
  } finally {
    coreState.textContent="待命中｜本機核心";
  }
}
function renderResearch() {
  const el=document.getElementById("researchList");
  if(!el) return;
  el.innerHTML=researchRecords.slice(0,20).map(r=>{
    const links=(Array.isArray(r.sources)?r.sources:[]).slice(0,4).map(s=>{
      const url=String(s?.url||"");
      if(!/^https?:\\/\\//i.test(url)) return "";
      return "<a href=\""+escapeHTML(url)+"\" target=\"_blank\" rel=\"noopener noreferrer\">"+escapeHTML(s.title||url)+"</a>";
    }).filter(Boolean).join(" · ");
    const action=(r.status==="verified")
      ? "<button type=\"button\" data-reassess=\""+escapeHTML(r.id)+"\">用證據再判斷</button>"
      : "<button type=\"button\" data-research=\""+escapeHTML(r.id)+"\">開始查證</button>";
    return "<div class=\"activity-item\"><b>"+escapeHTML(r.status||"pending")+"</b><time>"+new Date(r.updatedAt||r.createdAt).toLocaleString()+"</time><p>"+escapeHTML(r.question)+"</p><p>"+escapeHTML(r.summary||"尚無證據摘要")+"｜信心："+escapeHTML(r.confidence||"unknown")+"｜品質："+escapeHTML(r.evidenceQuality||"unknown")+"｜衝突："+escapeHTML(r.conflictStatus||"unknown")+"</p>"+(r.limitations?"<p>限制："+escapeHTML(r.limitations)+"</p>":"")+(links?"<p>來源："+links+"</p>":"")+"<div class=\"approval-actions\">"+action+"</div></div>";
  }).join("") || "<div class='empty'>尚無研究證據紀錄。</div>";
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
  recordDecision(data);
  if (Array.isArray(data.options)) {
    data.options.filter(o => o && o.known === false).slice(0, 5).forEach(o => {
      const name = String(o.name || "未知方案").trim();
      if (!name) return;
      const verifyTask = "驗證未知方案：「" + name + "」｜" + String(o.description || "確認可行性、成本與風險").trim();
      if (!tasks.some(t => !t.done && t.text === verifyTask)) createTask(verifyTask);
    });
  }
  if (data.assessment || data.decision || (Array.isArray(data.options) && data.options.length)) {
    const optionText = Array.isArray(data.options) ? data.options.slice(0,5).map(o =>
      "• " + (o.name || "未知方案") + "｜" + (o.description || "") + "｜風險：" + (o.risk || "未評估") + (o.known === false ? "｜未驗證" : "")
    ).join("\n") : "";
    const decisionText = data.decision ? "目前判斷：" + data.decision : "";
    const assessmentText = data.assessment ? "判斷摘要：" + data.assessment : "";
    if (assessmentText || optionText || decisionText) add("system", [assessmentText, optionText, decisionText].filter(Boolean).join("\n"));
  }
  executeToolActions(data.toolActions);
  const research = Array.isArray(data.research) ? data.research.slice(0, 6) : [];
  research.forEach(item => {
    saveResearchRecord({question:item?.question,purpose:item?.purpose,status:"planned",summary:"已建立查證問題，尚未取得外部證據。",confidence:"unverified"});
    const question = String(item?.question || "").trim();
    if (!question) return;
    const purpose = String(item?.purpose || "確認未知資訊").trim();
    const priority = String(item?.priority || "normal").trim();
    const taskText = "查證：" + question + "｜目的：" + purpose + "｜優先級：" + priority;
    if (!tasks.some(t => !t.done && t.text === taskText)) createTask(taskText);
  });
  if (research.length) {
    add("system", "玄曜研究佇列：\n" + research.map(x =>
      "• " + String(x.question || "") + "｜" + String(x.purpose || "查證") + "｜" + String(x.priority || "normal")
    ).join("\n"));
    logActivity("研究規劃", "已建立 " + research.length + " 項查證問題");
  }
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
function memoryScore(m, query="") {
  const text=String(m.content||"").toLowerCase();
  const q=String(query||"").toLowerCase().trim();
  let score=m.pinned?5:0;
  if(!q) return score + (m.updatedAt||m.createdAt||0)/1e13;
  q.split(/\s+/).filter(Boolean).forEach(word=>{ if(text.includes(word)) score+=3; });
  if(text.includes(q)) score+=8;
  return score + (m.updatedAt||m.createdAt||0)/1e13;
}
function searchMemories(query="", limit=10) {
  return memories.slice().sort((a,b)=>memoryScore(b,query)-memoryScore(a,query)).slice(0,limit);
}
function getTaskWorkflow() {
  const pending=tasks.filter(t=>!t.done&&!t.blocked);
  return pending.slice().sort((a,b)=>{
    const ad=(Array.isArray(a.dependsOn)?a.dependsOn:[]).length;
    const bd=(Array.isArray(b.dependsOn)?b.dependsOn:[]).length;
    const ar=canCompleteTask(a)?0:1;
    const br=canCompleteTask(b)?0:1;
    return ar-br || ad-bd || (a.at||0)-(b.at||0);
  });
}
function getAutomationState() {
  return readJSON(AUTOMATION_KEY, {enabled:true,lastRun:0,queue:[]});
}
function saveAutomationState(state) { writeJSON(AUTOMATION_KEY,state); }
function renderAutomationState() {
  const el=document.getElementById("automationState");
  if(!el) return;
  const state=getAutomationState();
  const ready=Array.isArray(state.queue)?state.queue.length:0;
  el.textContent=state.enabled ? "安全自動化｜就緒 "+ready : "安全自動化｜已停用";
}
function runSafeAutomation() {
  const state=getAutomationState();
  const workflow=getTaskWorkflow();
  const ready=workflow.filter(t=>canCompleteTask(t)).slice(0,8);
  state.enabled=true;
  state.lastRun=Date.now();
  state.queue=ready.map(t=>({taskId:t.id,text:t.text,readyAt:Date.now()}));
  state.nextTask=ready[0]?{id:ready[0].id,text:ready[0].text}:null;
  saveAutomationState(state);
  if(ready.length) logActivity("自動工作流","已整理可安全處理佇列："+ready.map(t=>t.text).join("｜"));
  else if(tasks.some(t=>!t.done)) logActivity("自動工作流","目前任務均受前置條件限制，未執行未知或外部操作");
  else logActivity("自動工作流","目前沒有待處理任務");
  renderAutomationState();
}
const SELF_REPLAN_KEY = "xuanyao.selfCodeReplan.v1";
function getSelfCodeReplanState(){ return readJSON(SELF_REPLAN_KEY,{attempts:0,last:null,blocked:false}); }
function saveSelfCodeReplanState(state){ writeJSON(SELF_REPLAN_KEY,state); }
function prepareSelfCodeReplan(failureReason="",target=""){
  const state=getSelfCodeReplanState();
  if(state.blocked) return {ok:false,reason:"自我修復已進入安全停止狀態。"};
  if(state.attempts>=3){
    state.blocked=true;
    state.last={at:Date.now(),reason:"連續自我修復達到 3 次上限。"};
    saveSelfCodeReplanState(state);
    logActivity("自我修復安全停止","連續失敗達到上限，暫停自動重新修改。");
    return {ok:false,reason:"連續自我修復達到 3 次上限。"};
  }
  state.attempts+=1;
  state.last={at:Date.now(),reason:String(failureReason||"驗證失敗"),target:String(target||"")};
  saveSelfCodeReplanState(state);
  logActivity("自我修復重新規劃","第 "+state.attempts+" 輪："+state.last.reason);
  return {ok:true,attempt:state.attempts,target:state.last.target,reason:state.last.reason};
}
function resetSelfCodeReplanState(){
  saveSelfCodeReplanState({attempts:0,last:null,blocked:false});
}

async function syncSelfCodeCycle(){
  const state=getSelfCodeCycle();
  if(!state.branch) return {status:"idle",reason:"尚無候選自我修改分支。"};
  const encoded=encodeURIComponent(state.branch);
  try{
    const res=await fetch("/api/self-code-status?branch="+encoded);
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data?.error||"self-code status");
    const validation=data.validation||{};
    const mapped=validation.state==="passed"?"candidate":validation.state==="failed"?"failed":validation.state==="running"?"validating":"waiting";
    const next={status:mapped,branch:state.branch,commitSha:data.commitSha||state.commitSha,target:state.target,failure:mapped==="failed"?(data.nextAction||"候選修改驗證失敗。"):"",attempts:state.attempts||0,validation,updatedAt:Date.now()};
    saveSelfCodeCycle(next);
    logActivity("自我修改狀態",state.branch+"｜"+mapped);
    if(mapped==="failed"){
      const replan=await fetch("/api/self-code-replan",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({branch:state.branch,target:state.target,previousPlan:{id:state.planId||"",target:state.target}})
      });
      const result=await replan.json().catch(()=>({}));
      if(replan.ok && result.status==="replan_ready"){
        recordSelfCodeCycle({status:"replan_ready",failure:result.failure?.reason||next.failure,replan:result.nextPlan||null,updatedAt:Date.now()});
        logActivity("自我修改重新規劃","已取得驗證失敗原因與下一輪受控方案；尚未修改程式碼。");
      }else if(result.status==="blocked"||result.status==="not_ready"){
        recordSelfCodeCycle({status:"failed",failure:result.reason||next.failure,updatedAt:Date.now()});
      }
    }
    return getSelfCodeCycle();
  }catch(error){
    logActivity("自我修改狀態查詢失敗",String(error?.message||error));
    return recordSelfCodeCycle({status:"status_unavailable",failure:String(error?.message||error)});
  }
}

function getMaintenanceState(){
  return readJSON(MAINTENANCE_KEY,{lastRun:0,lastStatus:"idle",lastFindingCount:0,consecutiveFailures:0,updatedAt:0});
}
function saveMaintenanceState(state){ writeJSON(MAINTENANCE_KEY,state); }
async function runMaintenanceAudit(){
  const state=getMaintenanceState();
  const now=Date.now();
  if(now-(state.lastRun||0)<30000) return state;
  const audit=auditSystemLocally();
  const proposals=proposeSystemOptimization(audit);
  const safe=selectSafeOptimization(proposals);
  const next={...state,lastRun:now,lastStatus:"audited",lastFindingCount:audit.findings.length,lastSelection:safe.selected?.type||null,updatedAt:now};
  saveMaintenanceState(next);
  logActivity("玄曜維護審查",audit.findings.length?audit.findings.join("｜"):"目前沒有新的核心缺口");
  return next;
}

async function checkBackendHealth(){
  const gateway=localStorage.getItem(GATEWAY_KEY)||"/api/chat";
  let base="";
  try{
    const url=new URL(gateway,window.location.origin);
    base=url.origin;
    const res=await fetch(base+"/api/health",{method:"GET",cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    const state={
      at:Date.now(),
      reachable:res.ok,
      status:res.ok?"connected":"unavailable",
      version:data.version||"",
      capabilities:data.capabilities||{},
      error:res.ok?"":(data.error||"HTTP "+res.status)
    };
    writeJSON(BACKEND_HEALTH_KEY,state);
    if(res.ok){
      backendState.textContent="Backend 已連線｜"+(data.version||"未知版本");
      logActivity("後端健康檢查","連線正常｜"+(data.version||"未知版本"));
    }else{
      backendState.textContent="Backend 不可用｜Demo";
      logActivity("後端健康檢查",state.error||"後端無法使用");
    }
    return state;
  }catch(error){
    const state={at:Date.now(),reachable:false,status:"unavailable",version:"",capabilities:{},error:String(error?.message||error)};
    writeJSON(BACKEND_HEALTH_KEY,state);
    backendState.textContent="Backend 未連線｜Demo";
    logActivity("後端健康檢查","目前使用本機 Demo｜"+state.error);
    return state;
  }
}

function startAutonomousMaintenance(){
  const last=Number(readJSON("xuanyao.selfCodeMaintenance.v1",{last:0}).last||0);
  const now=Date.now();
  if(now-last<30000) return;
  writeJSON("xuanyao.selfCodeMaintenance.v1",{last:now});
  syncSelfCodeCycle().catch(()=>{});
  runMaintenanceAudit().catch(()=>{});
}

function executeGoalLoopLocal(){
  runSafeAutomation();
  const result=executeNextSafeTask();
  if(!result.ok){
    const state=getAutomationState();
    if(state.nextTask){
      logActivity("目標循環","下一步未直接完成｜"+result.reason);
      add("system","玄曜目標循環：\n"+state.nextTask.text+"\n\n狀態："+result.reason);
    }else{
      logActivity("目標循環","目前沒有可安全執行的下一步。");
    }
    return;
  }
  runSafeAutomation();
  const next=getAutomationState().nextTask;
  logActivity("目標循環",next?"已完成本輪安全執行，下一步："+next.text:"本輪安全執行完成，等待新的任務。");
}
function renderMemoryTools() {
  const list = document.getElementById("memoryList");
  if (!list) return;
  const q = (dataSearch.value || "").trim().toLowerCase();
  const rows = searchMemories(q, 30);
  list.innerHTML = rows.length ? rows.map(m =>
    `<article class="data-item"><b>記憶</b><time>${new Date(m.updatedAt || m.createdAt).toLocaleString()}</time><p>${escapeHTML(m.content)}</p></article>`
  ).join("") : "<div class='empty'>目前沒有符合的記憶。</div>";
}
function renderTasks() {
  renderAutomationState();
  const workflow = getTaskWorkflow();
  taskList.innerHTML = workflow.length ? workflow.map(t =>
    `<div class="task ${t.done ? "done" : ""}"><button data-task="${t.id}" class="task-toggle" type="button">${t.done ? "✓" : "○"}</button><span>${escapeHTML(t.text)}${Array.isArray(t.dependsOn) && t.dependsOn.length && !canCompleteTask(t) ? "｜等待前置任務" : ""}</span><button data-delete="${t.id}" class="task-delete" type="button">刪除</button></div>`
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
      body: JSON.stringify({
        message: clean,
        history,
        context: {
          memories: searchMemories(clean, 12).map(m => ({ type: m.type, content: m.content, pinned: !!m.pinned })),
          researchRecords: researchRecords.slice(0, 10).map(r => ({ id:r.id, question:r.question, purpose:r.purpose||"", status:r.status, summary:r.summary, confidence:r.confidence, sources:Array.isArray(r.sources)?r.sources.slice(0,4):[], evidenceQuality:r.evidenceQuality||"unknown", conflictStatus:r.conflictStatus||"unknown", nextQuestion:r.nextQuestion||"" })),
          tasks: getTaskWorkflow().slice(0, 12).map(t => ({ id: t.id, text: t.text, done: !!t.done, dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [] })),
          pendingApprovals: approvals.filter(a => a.status === "pending").slice(0, 8).map(a => ({ toolId: a.toolId, reason: a.reason }))
        }
      })
    });
    if (!res.ok) throw new Error("backend");
    const data = await res.json();
    const reply = data.reply || "後端沒有提供回應。";
    add("system", reply);
    if (data.riskAlert) {
      const level = String(data.riskLevel || "unknown");
      const summary = String(data.riskSummary || "這個事項存在需要注意的風險。").trim();
      add("system", `風險提醒｜${level}｜${summary}`);
      if (Array.isArray(data.riskFactors) && data.riskFactors.length) add("system", "主要風險：" + data.riskFactors.slice(0, 5).join("；"));
      if (String(data.decisionSupport || "").trim()) add("system", "判斷依據：" + String(data.decisionSupport).trim());
      logActivity("主動風險告知", summary);
    }
    if (data.clarificationNeeded && String(data.clarificationQuestion || "").trim()) {
      add("system", "玄曜需要你確認：" + String(data.clarificationQuestion).trim());
      logActivity("主動澄清", String(data.clarificationQuestion).trim());
    }
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
  const payload = { version: CORE_VERSION, exportedAt: new Date().toISOString(), messages, tasks, memories, approvals, activities, decisions, researchRecords, automation: getAutomationState(), goalState };
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
    if (Array.isArray(payload.decisions)) decisions = payload.decisions;
    if (Array.isArray(payload.researchRecords)) researchRecords = payload.researchRecords;
    if (payload.goalState && typeof payload.goalState === "object") goalState = payload.goalState;
    if (payload.automation && typeof payload.automation === "object") saveAutomationState(payload.automation);
    saveMessages(); writeJSON(TASK_KEY, tasks); writeJSON(MEMORY_KEY, memories);
    writeJSON(APPROVAL_KEY, approvals); writeJSON(ACTIVITY_KEY, activities); writeJSON(DECISION_KEY, decisions); writeJSON(RESEARCH_KEY, researchRecords); writeJSON(GOAL_KEY, goalState);
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
const researchList=document.getElementById("researchList");
if(researchList) researchList.addEventListener("click", e => {
  const researchId=e.target.dataset.research||e.target.dataset.reassess;
  if(!researchId) return;
  if(e.target.dataset.research){ executeResearch(researchId); return; }
  if(e.target.dataset.reassess){
    const record=researchRecords.find(r=>r.id===researchId);
    if(record) ask("請根據玄曜研究證據重新判斷目前方案與下一步。研究問題："+record.question+"；摘要："+record.summary+"；信心："+record.confidence+"；限制："+(record.limitations||"無"));
  }
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
renderActivities(); renderDecisions(); renderResearch(); renderGoal();

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
const goalLoopBtn=document.getElementById("goalLoopBtn");
if(goalLoopBtn) goalLoopBtn.addEventListener("click",executeGoalLoopLocal);
if(planTaskBtn) planTaskBtn.addEventListener("click",()=>{
  const pending=tasks.filter(t=>!t.done).slice(0,8);
  if(!pending.length){ alert("目前沒有未完成任務。"); return; }
  ask("請直接分析目前未完成任務，安排最省力的執行順序；只有真正需要新增的下一步才建立任務，不要重複現有待辦。");
});
renderMemoryCount();
if(goalInput){goalInput.value=goalState?.goal||""; document.getElementById("saveGoalBtn")?.addEventListener("click",()=>{const g=goalInput.value.trim();if(!g)return;goalState={goal:g,status:"未審查",completion:0,evidence:[],missing:[],nextStep:"",reviewedAt:null};writeJSON(GOAL_KEY,goalState);renderGoal();reviewGoal();});}
runSafeAutomation();
checkBackendHealth().catch(()=>{});
runMaintenanceAudit().catch(()=>{});
startAutonomousMaintenance();
setInterval(startAutonomousMaintenance,60000);
