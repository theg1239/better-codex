# codex-backend

Local backend that supervises multiple `codex app-server` processes and exposes a
WebSocket bridge for the web UI.

## Setup

1. Install dependencies
   ```bash
   bun install
   ```
2. Run the server
   ```bash
   bun run dev
   ```

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
- `CODEX_BIN` (default: `codex`)
- `CODEX_FLAGS` (space-delimited)
- `CODEX_FLAGS_JSON` (JSON array, preferred)
- `CODEX_APP_SERVER_FLAGS`
- `CODEX_APP_SERVER_FLAGS_JSON`

## Endpoints

- `GET /health`
- `GET /profiles`
- `POST /profiles`
- `POST /profiles/:profileId/start`
- `POST /profiles/:profileId/stop`
- `WS /ws?token=...`
