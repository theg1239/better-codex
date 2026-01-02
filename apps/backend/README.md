# codex-backend

Local backend that supervises multiple `codex app-server` processes and exposes a
WebSocket bridge for the web UI.

## Requirements

- Bun
- Codex CLI available in `PATH` (or configure `CODEX_BIN`)

## Setup

1. Install dependencies
   ```bash
   bun install
   ```
2. Run the server (hot reload)
   ```bash
   bun run dev
   ```
3. Or run a single instance
   ```bash
   bun run start
   ```

## Data locations

- Analytics, reviews, and thread index live in `CODEX_HUB_DATA_DIR` (defaults to `~/.codex-hub`).
- Profiles metadata stored at `CODEX_HUB_DATA_DIR/profiles.json`.
- Per-profile Codex homes are created under `CODEX_HUB_PROFILES_DIR` (defaults to `~/.codex/profiles`).

## Protocol types

Generate TypeScript bindings from the installed Codex CLI:

```bash
bun run generate:protocol
```

## Environment variables

- `CODEX_HUB_HOST` (default: `127.0.0.1`)
- `CODEX_HUB_PORT` (default: `7711`)
- `CODEX_HUB_TOKEN` (default: auto-generated at boot)
- `CODEX_HUB_DATA_DIR` (default: `~/.codex-hub`)
- `CODEX_HUB_PROFILES_DIR` (default: `~/.codex/profiles`)
- `CODEX_HUB_DEFAULT_CODEX_HOME` (default: `~/.codex`)
- `CODEX_HUB_DEFAULT_CWD` (default: workspace root or process `cwd`)
- `CODEX_DEFAULT_CWD` (fallback for default cwd)
- `CODEX_BIN` (default: `codex`)
- `CODEX_FLAGS` (space-delimited)
- `CODEX_FLAGS_JSON` (JSON array, preferred)
- `CODEX_APP_SERVER_FLAGS`
- `CODEX_APP_SERVER_FLAGS_JSON`
- `CODEX_HUB_APP_SERVER_STARTUP_TIMEOUT_MS` (default: `15000`)
- `CODEX_HUB_DEBUG_ROUTES=1` (log non-404 route errors)

Notes:
- Prefer `CODEX_FLAGS_JSON` and `CODEX_APP_SERVER_FLAGS_JSON` to avoid shell quoting issues.
- `CODEX_HUB_TOKEN` should be set if you want a stable token across restarts.

## Endpoints

- `GET /health`
- `GET /config` (returns `{ token }` for the web UI)
- `GET /analytics/daily?metric=turns_started&days=365&profileId=...&model=...`
- `GET /reviews?profileId=...&limit=100&offset=0`
- `GET /profiles`
- `POST /profiles` (optional `{ name }`)
- `POST /profiles/:profileId/start`
- `POST /profiles/:profileId/stop`
- `DELETE /profiles/:profileId`
- `GET /profiles/:profileId/prompts` (returns prompt names + optional descriptions)
- `GET /profiles/:profileId/prompts/:name` (returns file contents)
- `GET /profiles/:profileId/config` (returns config + parsed MCP servers)
- `PUT /profiles/:profileId/config` (body `{ content: string }`)
- `PUT /profiles/:profileId/mcp-servers` (body `{ servers: McpServerConfig[] }`)
- `GET /threads/search?q=...&profileId=...&model=...&status=active|archived&createdAfter=...&createdBefore=...&limit=...&offset=...`
- `GET /threads/active?profileId=...`
- `POST /threads/reindex` (body `{ profileId?, limit?, autoStart? }`)
- `WS /ws?token=...`

## Troubleshooting

- "Missing hub token" in the web UI: ensure the backend is running and `GET /config` is reachable.
- "app-server startup timed out": raise `CODEX_HUB_APP_SERVER_STARTUP_TIMEOUT_MS` or run the CLI once manually to warm caches.
- Profiles not starting: verify the Codex CLI is in `PATH` or set `CODEX_BIN`.
