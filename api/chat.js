/* Vercel serverless function: /api/chat
 *
 * One proxy, two providers, keys held server-side via env vars:
 *   provider "claude" -> Anthropic Messages API  (ANTHROPIC_API_KEY)
 *   provider "ollama" -> Ollama Cloud chat API    (OLLAMA_API_KEY)
 *
 * Optional: OLLAMA_HOST overrides the Ollama base URL (default https://ollama.com)
 * for self-hosted or proxied setups. The browser never sees any key.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { provider = "claude", model, system, messages, max_tokens } = body || {};

  try {
    if (provider === "ollama") {
      const key = process.env.OLLAMA_API_KEY;
      if (!key) {
        res.status(400).json({ error: "Set OLLAMA_API_KEY in your environment." });
        return;
      }
      const host = (process.env.OLLAMA_HOST || "https://ollama.com").replace(/\/+$/, "");
      const r = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model || "gpt-oss:120b-cloud",
          messages: [{ role: "system", content: system }, ...(messages || [])],
          stream: false,
          format: "json",
          options: { num_predict: max_tokens || 2000 },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.status(r.status).json({ error: data.error || "Ollama Cloud API error" });
        return;
      }
      res.status(200).json({ text: data.message?.content || "" });
      return;
    }

    // default: Claude (Anthropic Messages API)
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      res.status(400).json({ error: "Set ANTHROPIC_API_KEY in your environment." });
      return;
    }
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-6",
        system,
        messages,
        max_tokens: max_tokens || 2000,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(r.status).json({ error: data.error?.message || "Anthropic API error" });
      return;
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message || "Proxy error" });
  }
}
