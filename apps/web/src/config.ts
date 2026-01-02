const FALLBACK_HUB_URL = 'http://127.0.0.1:7711'

export const HUB_URL =
  import.meta.env.VITE_CODEX_HUB_URL ?? FALLBACK_HUB_URL
export const HUB_TOKEN = import.meta.env.VITE_CODEX_HUB_TOKEN ?? ''
