async function github(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured.");
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json",...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data?.message||"GitHub API error.");e.status=response.status;throw e;}
  return data;
}
function branchName(value){const b=String(value||"").trim();return /^xuanyao\\/self-change\\/[A-Za-z0-9._-]+$/.test(b)?b:"";}
function extractFailure(run,jobs){
  const failedJobs=(jobs.jobs||[]).filter(j=>j.conclusion==="failure");
  return {runId:run?.id||null,workflow:run?.name||"Validate Xuanyao",conclusion:run?.conclusion||null,failedJobs:failedJobs.slice(0,5).map(j=>({id:j.id,name:j.name,htmlUrl:j.html_url})),reason:failedJobs.length?"驗證工作失敗："+failedJobs.map(j=>j.name).join("、"):"Validate Xuanyao 驗證未通過。"};
}
export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin",process.env.ALLOWED_ORIGIN||"*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, X-Xuanyao-Approval");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"Method Not Allowed"});
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const branch=branchName(body.branch);
  if(!branch) return res.status(400).json({status:"rejected",error:"Invalid self-change branch."});
  const repo=process.env.GITHUB_REPO||"game81060154-glitch/xuanyao";
  try{
    const encoded=encodeURIComponent(branch);
    const ref=await github(`/repos/${repo}/git/ref/heads/${encoded}`);
    const commitSha=ref.object?.sha||"";
    const runs=await github(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(commitSha)}&per_page=20`);
    const run=(runs.workflow_runs||[]).find(x=>x.name==="Validate Xuanyao");
    if(!run||run.status!=="completed"||run.conclusion==="success") return res.status(409).json({status:"not_ready",reason:"目前沒有可重新規劃的驗證失敗結果。",branch,commitSha});
    const jobs=await github(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=50`);
    const failure=extractFailure(run,jobs);
    const target=String(body.target||"").trim();
    if(!target) return res.status(200).json({status:"blocked",failure,reason:"缺少下一輪修改目標，暫停自動修改。"});
    const previousPlan=body.previousPlan||null;
    return res.status(200).json({status:"replan_ready",branch,failedCommitSha:commitSha,failure,previousPlanId:previousPlan?.id||null,strategy:["保留失敗候選分支","針對失敗原因做最小修改","建立新的 self-change 分支","重新驗證","連續失敗達上限則安全停止"],nextPlan:{target,mode:"controlled",backupRequired:true,validationRequired:true,rollbackRequired:true,newBranchRequired:true}});
  }catch(error){return res.status(Number(error.status)>=400?Number(error.status):502).json({status:"failed",error:error.message||"Unable to build replan."});}
}