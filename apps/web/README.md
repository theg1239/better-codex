# Codex Hub Web UI

Frontend for the multi-account Codex hub. It connects to the local backend over
REST + WebSocket.

## Requirements

- Bun
- Codex Hub backend running locally

## Setup

1. Install dependencies
   ```bash
   bun install
   ```
2. Start the dev server
   ```bash
   bun run dev
   ```

## Environment variables

Create a `.env` file with (optional):

```bash
VITE_CODEX_HUB_URL=http://127.0.0.1:7711
VITE_CODEX_HUB_TOKEN=... # optional, fetched from /config when omitted
```

## Token flow

- If `VITE_CODEX_HUB_TOKEN` is set, the UI uses it directly.
- Otherwise it calls `GET /config` on the backend and reuses the returned token.
- For local development this is convenient, but do not expose the backend port publicly.

## Common issues

- "Missing hub token - backend may not be running": start the backend and verify `VITE_CODEX_HUB_URL` matches.
- WebSocket failures: confirm the backend token matches or clear the env token to re-fetch.
