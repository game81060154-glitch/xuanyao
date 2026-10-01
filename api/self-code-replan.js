function extractValidationFailure(validation = {}) {
  const conclusion = String(validation.conclusion || "").trim();
  const state = String(validation.state || "").trim();
  if (state !== "failed" && conclusion !== "failure") {
    return { hasFailure: false, reason: "目前沒有可供分析的驗證失敗結果。" };
  }
  return {
    hasFailure: true,
    reason: validation.reason || "Validate Xuanyao 驗證未通過。",
    workflow: validation.workflow || "Validate Xuanyao",
    runId: validation.runId || null,
    commitSha: validation.commitSha || null
  };
}

function buildSelfCodeReplan(failure = {}, target = "", previousPlan = null) {
  const parsed = extractValidationFailure(failure);
  if (!parsed.hasFailure) {
    return { status: "not_ready", reason: parsed.reason };
  }
  const cleanTarget = String(target || previousPlan?.target || "").trim();
  if (!cleanTarget) {
    return { status: "blocked", reason: "缺少下一輪修改目標，暫停自動修改。" };
  }
  return {
    status: "replan_ready",
    target: cleanTarget,
    basedOn: parsed,
    previousPlanId: previousPlan?.id || null,
    strategy: [
      "保留失敗候選分支作為診斷依據",
      "不要覆寫失敗候選分支",
      "針對驗證失敗原因提出最小必要修改",
      "建立新的 self-change 分支",
      "重新執行完整驗證",
      "連續失敗時停止自動重試並要求人工檢視"
    ],
    nextPlan: {
      mode: "controlled",
      backupRequired: true,
      validationRequired: true,
      rollbackRequired: true,
      newBranchRequired: true
    }
  };
}

export { extractValidationFailure, buildSelfCodeReplan };
