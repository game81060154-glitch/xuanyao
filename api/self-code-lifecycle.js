async function github(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured.");
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || "GitHub API error.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function validBranch(value) {
  const branch = String(value || "").trim();
  return /^xuanyao\/self-change\/[A-Za-z0-9._-]+$/.test(branch) ? branch : "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Xuanyao-Approval");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: "Invalid JSON." }); }

  const branch = validBranch(body.branch);
  const confirm = body.confirm === true || req.headers["x-xuanyao-approval"] === "confirmed";
  const action = String(body.action || "prepare").trim();
  const repo = process.env.GITHUB_REPO || "game81060154-glitch/xuanyao";
  if (!branch) return res.status(400).json({ status: "rejected", error: "Invalid self-change branch." });

  if (action === "prepare") {
    return res.status(200).json({
      status: "await_confirmation",
      lifecycle: "validated_candidate",
      branch,
      allowedNextActions: ["merge", "discard"],
      rule: "只有驗證通過的候選修改才能進入合併階段。"
    });
  }

  if (!confirm) {
    return res.status(409).json({
      status: "await_confirmation",
      lifecycle: "validated_candidate",
      branch,
      error: "This external repository action requires explicit confirmation."
    });
  }

  try {
    if (action === "merge") {
      const runs = await github(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(body.commitSha || "")}&per_page=20`);
      const validationRuns = Array.isArray(runs.workflow_runs)
        ? runs.workflow_runs.filter(run => run.name === "Validate Xuanyao")
        : [];
      const latest = validationRuns[0];
      if (!latest || latest.status !== "completed" || latest.conclusion !== "success") {
        return res.status(409).json({
          status: "blocked",
          lifecycle: "validation_required",
          branch,
          reason: "候選修改尚未取得成功的驗證結果，不允許合併。"
        });
      }

      const pull = await github(`/repos/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({
          title: `玄曜受控修改：${branch.split("/").pop()}`,
          head: branch,
          base: process.env.GITHUB_BRANCH || "main",
          body: "由玄曜受控自我修改流程建立。已通過 Validate Xuanyao，合併仍需明確確認。"
        })
      });

      return res.status(200).json({
        status: "ready_to_merge",
        lifecycle: "merge_confirmation",
        branch,
        pullRequestNumber: pull.number,
        pullRequestUrl: pull.html_url || "",
        validation: { runId: latest.id, conclusion: latest.conclusion }
      });
    }

    if (action === "discard") {
      return res.status(200).json({
        status: "discard_requested",
        lifecycle: "discarded_candidate",
        branch,
        note: "候選分支已標記為放棄；未對 main 做任何修改。"
      });
    }

    return res.status(400).json({ status: "rejected", error: "Unknown lifecycle action." });
  } catch (error) {
    return res.status(Number(error.status) >= 400 ? Number(error.status) : 502).json({
      status: "failed",
      lifecycle: "error",
      error: error.message || "Self-code lifecycle action failed."
    });
  }
}
