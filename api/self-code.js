const ALLOWED_TARGETS = [
  /^app\.js$/,
  /^api\/[A-Za-z0-9._-]+\.js$/,
  /^config\/[A-Za-z0-9._-]+\.json$/,
  /^index\.html$/,
  /^style\.css$/,
  /^manifest\.webmanifest$/,
  /^sw\.js$/
];

function allowedTarget(target) {
  return ALLOWED_TARGETS.some(pattern => pattern.test(target));
}

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

function jsonBase64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Xuanyao-Approval");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON." });
  }

  const target = String(body.target || "").trim();
  const content = String(body.content ?? "");
  const reason = String(body.reason || "").trim();
  const confirmed = body.confirm === true || req.headers["x-xuanyao-approval"] === "confirmed";

  if (!confirmed) {
    return res.status(409).json({
      status: "await_confirmation",
      error: "This external repository change requires explicit confirmation."
    });
  }
  if (!target || !allowedTarget(target)) {
    return res.status(400).json({ status: "rejected", error: "Target is outside the controlled self-code allowlist." });
  }
  if (!content) return res.status(400).json({ status: "rejected", error: "Proposed content is empty." });
  if (content.length > 500000) return res.status(413).json({ status: "rejected", error: "Proposed file is too large." });

  const repo = process.env.GITHUB_REPO || "game81060154-glitch/xuanyao";
  const defaultBranch = process.env.GITHUB_BRANCH || "main";
  const safeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const branch = `xuanyao/self-change/${safeId}`;

  try {
    const ref = await github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
    const baseSha = ref.object.sha;
    const current = await github(`/repos/${repo}/contents/${target}?ref=${encodeURIComponent(defaultBranch)}`);

    await github(`/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha
      })
    });

    const updated = await github(`/repos/${repo}/contents/${target}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `xuanyao: controlled self-code change ${target}`,
        content: jsonBase64(content),
        sha: current.sha,
        branch
      })
    });

    return res.status(200).json({
      status: "changed_on_branch",
      repository: repo,
      baseBranch: defaultBranch,
      branch,
      target,
      reason,
      commitSha: updated.commit?.sha || "",
      backup: {
        type: "base_branch_snapshot",
        baseSha,
        originalSha: current.sha,
        available: true
      },
      validation: {
        required: true,
        workflow: ".github/workflows/validate.yml",
        status: "pending"
      },
      nextStep: "Wait for validation. Do not merge into main until validation passes."
    });
  } catch (error) {
    return res.status(Number(error.status) >= 400 ? Number(error.status) : 502).json({
      status: "failed",
      error: error.message || "Controlled self-code change failed."
    });
  }
}
