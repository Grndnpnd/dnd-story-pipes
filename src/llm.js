/* Unified LLM layer.
 *
 *  Every call goes to /api/chat (a Vercel serverless function) which holds the
 *  keys and model defaults server-side and forwards to the chosen provider:
 *    claude -> https://api.anthropic.com/v1/messages   (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
 *    ollama -> https://ollama.com/api/chat              (OLLAMA_API_KEY, OLLAMA_MODEL)
 *
 *  Model is only sent when set in Settings; left blank, the server's env default
 *  is used. No keys ever touch the browser. Returns a plain assistant string.
 */

export const DEFAULT_SETTINGS = {
  provider: "ollama",   // "claude" | "ollama"
  claudeModel: "",      // blank -> server uses ANTHROPIC_MODEL
  ollamaModel: "",      // blank -> server uses OLLAMA_MODEL
};

export async function llmComplete({ system, messages, maxTokens = 2000 }, settings) {
  const provider = settings?.provider || DEFAULT_SETTINGS.provider;
  const model = (provider === "ollama" ? settings?.ollamaModel : settings?.claudeModel) || undefined;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, system, messages, max_tokens: maxTokens }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.text || "";
}
