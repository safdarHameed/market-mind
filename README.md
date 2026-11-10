# MarketMind

**An AI that thinks through the market for you — with proof.**

MarketMind researches public sources to surface emerging trends, unsolved problems, market gaps and business opportunities — and shows the evidence behind every one. Each opportunity can be challenged in an AI debate that searches for new evidence and admits uncertainty.

```
frontend/  Next.js 16 (App Router, TypeScript, Tailwind v4, Lucide) — UI, proxies /api/* to the backend
backend/   FastAPI + SQLAlchemy + PostgreSQL — research pipeline, debate AI, persistence
```

## Quick start

Prerequisites: Python 3.12+ with [uv](https://docs.astral.sh/uv/), Node 20+, PostgreSQL 14+.

```bash
# 1. Database
createdb signalhunter

# 2. Backend
cd backend
cp .env.example .env          # then add your keys (see below)
uv sync
uv run uvicorn app.main:app --port 8000 --reload

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local    # BACKEND_URL=http://127.0.0.1:8000
npm install
npm run dev                   # http://localhost:3000
```

Tables are created automatically on backend startup.

## Connecting an AI model

Open **Settings** in the app, then:

1. Choose a provider: Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, or any OpenAI-compatible server.
2. Paste your API key.
3. Click **Load models** and pick one. It must support tool/function calling.
4. Choose web search. Anthropic includes web search; with other providers, add a Tavily or Brave key (both have free tiers).
5. Click **Save**, then **Test connection**.

Keys are encrypted at rest (Fernet) and never sent back to the browser; the page only shows a hint like `sk-…a1b2`. Each guest workspace keeps its own settings. If a workspace has none, the server `.env` keys below are used.

## Environment variables

### backend/.env

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | e.g. `postgresql+psycopg://localhost:5432/signalhunter` |
| `ANTHROPIC_API_KEY` | optional | Server-default AI (used when a user hasn't connected their own in Settings) |
| `LLM_MODEL_SMART` | no | Default `claude-sonnet-5-5` (planning, opportunities, debate) |
| `LLM_MODEL_FAST` | no | Default `claude-haiku-5-5` (extraction, clustering — cost-conscious) |
| `SEARCH_PROVIDER` | no | `auto` (default), `tavily`, `brave`, `anthropic`, `none` |
| `TAVILY_API_KEY` | optional | Tavily search (preferred when set) |
| `BRAVE_API_KEY` | optional | Brave Search API |
| `ANTHROPIC_WEB_SEARCH_TOOL` | no | Claude web-search tool version, default `web_search_20250305` |
| `FRONTEND_ORIGIN` | no | CORS origin, default `http://localhost:3000` |
| `SECRET_KEY` | recommended | Encrypts user API keys. If unset, a key is generated into `backend/.secret_key` |
| `ALLOW_PRIVATE_BASE_URLS` | no | `true` lets users point "OpenAI-compatible" at localhost (e.g. Ollama). Keep `false` on shared servers |
| `RESEARCH_MAX_SOURCES` etc. | no | Research limits — see `.env.example` |

With `SEARCH_PROVIDER=auto`, the first available of Tavily → Brave → Claude web search is used. **Only `ANTHROPIC_API_KEY` is strictly needed** if Claude web search is enabled for your Anthropic organization.

### frontend/.env.local

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | Where the Next.js server proxies `/api/*` (server-side only) |

### Without keys

Nothing is simulated. The Discover page points to Settings, and **view a sample** loads a clearly labelled sample discovery (placeholder sources, links disabled, debate disabled) so you can explore the interface.

## How research works

`backend/app/research/pipeline.py`, one background task per discovery, with each stage's real result recorded for the progress UI:

1. **Plan:** the LLM turns the request into 4–6 focused queries, including competition and counter-evidence angles.
2. **Retrieve:** search through the provider abstraction (`app/search/`), deduplicated by canonical URL.
3. **Validate:** each page is fetched with SSRF protection, robots.txt respected, and size/time limits. Title, publisher and publication date come only from page metadata or the provider; relative dates are never guessed. Unreadable pages are kept as *snippet only* or excluded.
4. **Deduplicate:** identical or syndicated content is set aside and never counted as independent confirmation.
5. **Extract:** findings, each tied to exactly one source. Quotes are kept only if they appear verbatim in the page text.
6. **Cluster:** findings are grouped into signals.
7. **Generate & evaluate:** opportunities with supporting, contradicting and competitor evidence. Every reference is validated against real DB ids; invalid output is retried once with the errors, then the run fails rather than saving made-up data.
8. **Score:** dimension ratings from the LLM are combined by a transparent weighted formula (`app/research/scoring.py`) and **capped by the number of independent publishers**. Confidence is the lower of the model's view and what the evidence allows.

Web content is always fenced as untrusted data in prompts, and delimiter-like tags are stripped.

**Debate** (`app/chat/service.py`): an opportunity-scoped, streamed conversation with an optional mode (Explain / Challenge / Investigate / Build). It can call a `search_public_sources` tool, and new sources are stored and shown as *newly retrieved*. **Update assessment** re-scores using the debate plus classified new sources, and keeps the score history.

## Tests

```bash
cd backend && createdb signalhunter_test && uv run pytest
```

Covers: a successful run, duplicate and syndicated sources, missing and relative dates, unreachable and blocked pages, fabricated quotes, hallucinated finding ids, invalid structured output (retry, then fail), search provider failure, no provider configured, empty results, score caps, SSRF blocking and prompt-injection fencing. Test doubles live only in `tests/`.

## Known limitations / roadmap

- Guest workspaces are identified by an httpOnly cookie, so there are no accounts yet. `current_user` in `app/deps.py` is the single seam for adding auth.
- Background jobs run in-process. Interrupted runs are marked failed and can be retried; a job queue is the next step for scale.
- The watchlist is manual. Scheduled re-research and alerts are not implemented, and the UI says so.
- Schema is created with `create_all`; add Alembic before the first production migration.
