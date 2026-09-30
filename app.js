const KEY = "xuanyao.messages.v1";
const chat = document.getElementById("chat");
const composer = document.getElementById("composer");
const message = document.getElementById("message");
const clearBtn = document.getElementById("clearBtn");
const coreState = document.getElementById("coreState");
const backendState = document.getElementById("backendState");

const demoReplies = [
  "收到。玄曜已接管這項任務，先把目標拆成可執行的小步驟，再把需要你決定的部分留給你。",
  "已分析需求。現在是 Demo 模式，所以我先用本機核心模擬回應；之後接上後端 AI，就能把這裡換成真正的模型回應。",
  "玄曜核心已記錄這次對話。小型整理與介面操作可以自動完成，涉及外部帳號、付款或不可逆操作時則保留確認。",
  "可以。這個版本的架構已經把「對話、記憶、工具、AI 後端、手機安裝」分層，後續可以逐步升級，不必整個重做。"
];

function load(){
  try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return []}
}
let messages = load();

function save(){localStorage.setItem(KEY, JSON.stringify(messages.slice(-80)))}

function add(role,text,persist=true){
  const item=document.createElement("div");
  item.className="msg "+(role==="user"?"user":"system");
  const meta=document.createElement("span");
  meta.className="meta";
  meta.textContent=role==="user"?"你":"玄曜";
  item.append(meta,document.createTextNode(text));
  chat.appendChild(item);
  chat.scrollTop=chat.scrollHeight;
  if(persist){messages.push({role,text,at:Date.now()});save()}
}

function render(){
  chat.innerHTML="";
  if(!messages.length){
    add("system","玄曜已啟動。你可以直接說目標，例如：「幫我規劃玄曜下一階段」。");
    return;
  }
  messages.forEach(x=>add(x.role,x.text,false));
}

async function ask(text){
  const clean=text.trim();
  if(!clean)return;
  add("user",clean);
  coreState.textContent="處理中｜分析需求";
  try{
    const res=await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:clean,history:messages.slice(-20)})
    });
    if(!res.ok)throw new Error("backend");
    const data=await res.json();
    add("system",data.reply||"後端沒有提供回應。");
    backendState.textContent="Connected";
  }catch{
    const reply=demoReplies[Math.floor(Math.random()*demoReplies.length)];
    add("system",reply);
    backendState.textContent="Demo";
  }finally{
    coreState.textContent="待命中｜Demo 模式";
  }
}

composer.addEventListener("submit",e=>{
  e.preventDefault();
  const text=message.value;
  message.value="";
  message.style.height="auto";
  ask(text);
});

message.addEventListener("input",()=>{
  message.style.height="auto";
  message.style.height=Math.min(message.scrollHeight,140)+"px";
});

document.querySelectorAll("[data-prompt]").forEach(btn=>{
  btn.addEventListener("click",()=>ask(btn.dataset.prompt));
});

clearBtn.addEventListener("click",()=>{
  messages=[];
  save();
  render();
  coreState.textContent="待命中｜Demo 模式";
});

render();
