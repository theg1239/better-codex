# better-codex

Consumer-friendly launcher for the Codex Hub web UI.

## Install

```bash
npm i -g better-codex
```

Requires Bun: https://bun.sh

## Run

```bash
better-codex
```

`better-codex web` works too (same command).

Options:
- `--root PATH` set the repo root (defaults to current dir or parent lookup).
- `--host 127.0.0.1` host for backend + UI.
- `--backend-port 7711` backend port.
- `--web-port 5173` UI port.
- `--open` open the UI in your browser after startup.
