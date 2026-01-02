# Codex Hub Web UI

Frontend for the multi-account Codex hub. It connects to the local backend over
REST + WebSocket.

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

Create a `.env` file with:

```bash
VITE_CODEX_HUB_URL=http://127.0.0.1:7711
VITE_CODEX_HUB_TOKEN=... # printed by the backend on boot
```
