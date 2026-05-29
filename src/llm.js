/* Unified LLM layer.
 *
 *  Every call goes to /api/chat (a Vercel serverless function) which holds the
 *  keys server-side and forwards to the chosen provider:
 *    claude -> https://api.anthropic.com/v1/messages   (ANTHROPIC_API_KEY)
 *    ollama -> https://ollama.com/api/chat              (OLLAMA_API_KEY)
 *
 *  No keys ever touch the browser. Returns a plain assistant string;
 *  callers do their own JSON parsing.
 */

export const DEFAULT_SETTINGS = {
  provider: "ollama",                  // "claude" | "ollama"
  claudeModel: "claude-sonnet-4-6",    // any model your ANTHROPIC_API_KEY can reach
  ollamaModel: "gpt-oss:120b-cloud",   // any Ollama Cloud model
};

export async function llmComplete({ system, messages, maxTokens = 2000 }, settings) {
  const provider = settings?.provider || DEFAULT_SETTINGS.provider;
  const model =
    provider === "ollama"
      ? settings?.ollamaModel || DEFAULT_SETTINGS.ollamaModel
      : settings?.claudeModel || DEFAULT_SETTINGS.claudeModel;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, system, messages, max_tokens: maxTokens }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.text || "";
}
