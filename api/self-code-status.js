async function github(path) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured.");
  const response = await fetch("https://api.github.com" + path, {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
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

function branchName(value) {
  const branch = String(value || "").trim();
  return /^xuanyao\/self-change\/[A-Za-z0-9._-]+$/.test(branch) ? branch : "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const branch = branchName(req.query?.branch);
  if (!branch) return res.status(400).json({ status: "rejected", error: "Invalid self-change branch." });

  const repo = process.env.GITHUB_REPO || "game81060154-glitch/xuanyao";

  try {
    const encoded = encodeURIComponent(branch);
    const ref = await github(`/repos/${repo}/git/ref/heads/${encoded}`);
    const sha = ref.object?.sha || "";
    if (!sha) return res.status(404).json({ status: "not_found", branch });

    const runs = await github(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`);
    const relevant = Array.isArray(runs.workflow_runs)
      ? runs.workflow_runs.filter(run => run.name === "Validate Xuanyao")
      : [];

    const latest = relevant[0] || null;
    let state = "pending";
    if (latest) {
      if (latest.status !== "completed") state = "running";
      else if (latest.conclusion === "success") state = "passed";
      else state = "failed";
    }

    return res.status(200).json({
      status: "ok",
      repository: repo,
      branch,
      commitSha: sha,
      validation: {
        state,
        workflow: "Validate Xuanyao",
        runId: latest?.id || null,
        conclusion: latest?.conclusion || null,
        startedAt: latest?.run_started_at || null,
        updatedAt: latest?.updated_at || null
      },
      nextAction: state === "passed"
        ? "候選修改已通過驗證，可進入人工確認的合併階段。"
        : state === "failed"
          ? "候選修改未通過驗證，維持隔離，不進 main。"
          : "等待驗證結果，不進 main。"
    });
  } catch (error) {
    return res.status(Number(error.status) >= 400 ? Number(error.status) : 502).json({
      status: "failed",
      error: error.message || "Unable to inspect validation state."
    });
  }
}
