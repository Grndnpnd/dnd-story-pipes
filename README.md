# DnD Story Pipes

A node-and-pipe story mapper for tabletop campaigns, with an AI writing partner that reads the whole map and writes back into it. The main story is a trunk line; personal quests are tributaries that converge on it. The app flags where a player is about to feel forgotten, tells breath (*Ma*) apart from dead air using a per-beat tension curve, and proposes concrete, table-ready moves — flashbacks at convergence points, bridges for orphaned quests, scenes and read-aloud you can attach to a beat.

It runs on **Claude** (Anthropic API) or **Ollama Cloud**. Both are proxied through a single serverless function using server-side env vars, so no API key ever reaches the browser. Built with Vite + React, deploys to Vercel.

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # then fill in the key(s) you'll use

# Run the frontend + the /api function together (the app calls /api/chat):
npx vercel dev                  # http://localhost:3000
```

`npm run dev` runs only the frontend (no `/api`), so model calls won't work — use `vercel dev` locally.

Open the app, click the gear (Settings) to choose your provider and model, then **Example** to load a sample campaign or **Map campaign** to parse your own brief.

## Environment variables

| Var | Used by | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude | from console.anthropic.com |
| `ANTHROPIC_MODEL` | Claude | default model, e.g. `claude-sonnet-4-6` |
| `OLLAMA_API_KEY` | Ollama Cloud | ollama.com → account → API keys (or `ollama signin`) |
| `OLLAMA_MODEL` | Ollama Cloud | default model, e.g. `gpt-oss:120b-cloud` |
| `OLLAMA_HOST` | optional | defaults to `https://ollama.com`; override for self-hosted/proxied Ollama |

You only need the vars for the provider(s) you use. Set them in `.env.local` for local dev and in the Vercel dashboard for production. The model can also be set per-browser in Settings, which overrides the env default; leave Settings blank to use the env model.

## Providers (Settings → gear)

- **Claude** — set the model to anything your key can reach (default `claude-sonnet-4-6`).
- **Ollama Cloud** — set the model to any cloud model, e.g. `gpt-oss:120b-cloud`, `qwen3-coder:480b-cloud`, `deepseek-v3.1:671b-cloud`. Cloud models use the `-cloud` suffix; check ollama.com for the current list. The function forces JSON output for Ollama to keep structured responses reliable.

Model names move over time on both providers — if a call returns a 4xx, the first thing to check is that the model string in Settings is one your key can reach.

## Long parses / timeouts (504)

A large brief on a big model (e.g. a 120B Ollama Cloud model generating a full JSON graph) can run longer than a minute. A standard Vercel function caps at 60s on Hobby, so it returns `504 FUNCTION_INVOCATION_TIMEOUT`.

To allow up to 5 minutes:

1. In your Vercel project, **Settings → Functions → enable Fluid Compute**. This raises the max duration ceiling to 300s on Hobby (800s on Pro/Enterprise). It's free, and time spent waiting on the model counts as idle I/O, not billed CPU.
2. `vercel.json` already sets `api/chat.js` to `maxDuration: 300`. Redeploy.

Note: if Fluid Compute is **off**, a Hobby project will fail to build with a maxDuration error — turn it on first, or lower `maxDuration` to 60 in `vercel.json`.

The more durable fix for slowness is a faster model for parsing — Claude, or a smaller Ollama Cloud model — since a 120B model emitting thousands of tokens is the slow part. You can keep the big model for the writing partner and use a quicker one to parse.

## Deploy to Vercel

```bash
npx vercel            # first deploy / link
npx vercel --prod     # production
```

Or push to GitHub and import at vercel.com (zero-config — it detects Vite and the `api/` function). In **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` and/or `OLLAMA_API_KEY`, then redeploy.

## Using it

- **Map campaign** — paste a raw brief (plot, BBEG, twists, each PC and what they want; no stats) and the model parses it into cards and pipes.
- **Cards** — click any card to edit every field, add or sever pipes, and read attached writing. The richer a card's `summary`, the sharper the AI's output. **+ Card** adds one by hand.
- **Write tab** — chat with a partner that has the entire map as live context. It replies in prose and proposes changes (new cards, beat rewrites, new pipes) and written passages you apply with a click. Nothing changes until you approve it. Attached writing shows as a teal dot on a card.
- **Doctor tab** — automatic flags: cinematic candidates (convergence points), who's about to feel forgotten, *Ma* vs. dead air, and per-PC coverage. Each has a **Suggest moves** button for grounded, on-demand ideas.
- **Persistence** — the map auto-saves to your browser. **Export**/**Import** save a campaign to a JSON file you can reload or hand to someone; **New** clears the canvas.

## Project layout

```
api/chat.js        Serverless proxy — routes to Claude or Ollama Cloud by provider, keys from env
src/llm.js         Client helper — POSTs to /api/chat with the chosen provider/model
src/App.jsx        The app: map canvas, editor, writing partner, doctor
src/main.jsx       React entry
```

## Notes

- Map data and the provider/model choice live in `localStorage` (this browser only). Export for a portable copy or backup.
- The included sample campaign is just a starter — it only loads via **Example**, and never if you already have a saved map.
