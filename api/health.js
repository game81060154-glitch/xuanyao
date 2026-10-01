export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ status: "error", error: "Method Not Allowed" });
  const hasGithubToken = Boolean(process.env.GITHUB_TOKEN);
  const configuredOrigin = Boolean(process.env.ALLOWED_ORIGIN);
  return res.status(200).json({
    status: "ok",
    service: "xuanyao",
    version: "1.45",
    runtime: "vercel",
    capabilities: {
      chat: true,
      research: true,
      goal: true,
      selfCode: hasGithubToken,
      selfCodeEnvironmentConfigured: hasGithubToken,
      corsOriginConfigured: configuredOrigin
    },
    timestamp: new Date().toISOString()
  });
}
