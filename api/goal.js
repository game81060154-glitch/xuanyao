export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin",process.env.ALLOWED_ORIGIN||"*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"Method Not Allowed"});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return res.status(503).json({error:"AI backend is not configured."});
  let body; try{body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{});}catch{return res.status(400).json({error:"Invalid JSON."});}
  const goal=String(body.goal||"").trim().slice(0,1200);
  if(!goal) return res.status(400).json({error:"Goal is required."});
  const schema={type:"object",additionalProperties:false,properties:{
    status:{type:"string"},completion:{type:"number"},evidence:{type:"array",items:{type:"string"}},
    missing:{type:"array",items:{type:"string"}},nextStep:{type:"string"},goalRestated:{type:"string"}
  },required:["status","completion","evidence","missing","nextStep","goalRestated"]};
  const prompt=["你是玄曜的目標完成度引擎。","目標："+goal,
    "目前任務："+JSON.stringify(Array.isArray(body.tasks)?body.tasks.slice(0,30):[]),
    "研究證據："+JSON.stringify(Array.isArray(body.researchRecords)?body.researchRecords.slice(0,15):[]),
    "請只根據提供資料判斷，不要假裝已完成未知工作。",
    "completion 必須是 0 到 100 的數字。",
    "status 使用：未開始、進行中、接近完成、已達成、受阻。",
    "如果尚未達成，只提出一個最小、可執行且能真正推進目標的 nextStep。"
  ].join("\n");
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt,text:{format:{type:"json_schema",name:"xuanyao_goal_review",strict:true,schema}},max_output_tokens:900,store:false})});
  const data=await response.json();
  if(!response.ok)return res.status(response.status).json({error:data?.error?.message||"AI provider error."});
  let parsed;try{parsed=JSON.parse(data.output_text||"{}");}catch{parsed={status:"受阻",completion:0,evidence:[],missing:["無法解析完成度"],nextStep:"重新執行目標審查",goalRestated:goal};}
  return res.status(200).json({...parsed,reviewedAt:Date.now()});
}
