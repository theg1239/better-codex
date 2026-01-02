const FALLBACK_HUB_URL = 'http://127.0.0.1:7711'

export const HUB_URL =
  import.meta.env.VITE_CODEX_HUB_URL ?? FALLBACK_HUB_URL

let cachedToken: string | null = null

export const getHubToken = async (): Promise<string> => {
  const envToken = import.meta.env.VITE_CODEX_HUB_TOKEN
  if (envToken) {
    return envToken
  }

  if (!cachedToken) {
    try {
      const response = await fetch(`${HUB_URL}/config`)
      if (response.ok) {
        const data = (await response.json()) as { token?: string }
        cachedToken = data.token ?? ''
      }
    } catch {
      console.warn('Failed to fetch hub token from backend')
    }
  }

  return cachedToken ?? ''
}

export const HUB_TOKEN = import.meta.env.VITE_CODEX_HUB_TOKEN ?? ''
