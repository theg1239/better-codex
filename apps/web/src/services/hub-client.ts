import { HUB_TOKEN, HUB_URL } from '../config'

export type HubProfile = {
  id: string
  name: string
  codexHome: string
  createdAt: string
}

type WsEvent =
  | {
      type: 'rpc.event'
      profileId: string
      method: string
      params?: unknown
    }
  | {
      type: 'rpc.serverRequest'
      profileId: string
      id: number
      method: string
      params?: unknown
    }
  | {
      type: 'profile.exit'
      profileId: string
      code: number | null
    }
  | {
      type: 'profile.error'
      profileId: string
      message: string
    }
  | {
      type: 'profile.diagnostic'
      profileId: string
      message: string
    }

type WsResponse =
  | {
      type: 'rpc.response'
      requestId: string
      result?: unknown
      error?: string
    }
  | {
      type: 'profile.started'
      profileId: string
    }
  | {
      type: 'profile.stopped'
      profileId: string
    }
  | {
      type: 'error'
      message: string
    }

type WsRequest =
  | {
      type: 'rpc.request'
      requestId: string
      profileId: string
      method: string
      params?: unknown
    }
  | {
      type: 'rpc.response'
      profileId: string
      id: number
      result?: unknown
      error?: { code?: number; message: string }
    }

type EventListener = (event: WsEvent) => void

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

const toWsUrl = (baseUrl: string, token: string) => {
  const url = new URL('/ws', baseUrl)
  url.searchParams.set('token', token)
  return url.toString().replace(/^http/, 'ws')
}

class HubClient {
  private ws: WebSocket | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private readonly listeners = new Set<EventListener>()

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }
    if (!HUB_TOKEN) {
      throw new Error('Missing VITE_CODEX_HUB_TOKEN')
    }

    const ws = new WebSocket(toWsUrl(HUB_URL, HUB_TOKEN))
    this.ws = ws

    ws.onmessage = (event) => {
      const data = event.data
      if (typeof data === 'string') {
        this.handleMessage(data)
        return
      }
      if (data instanceof Blob) {
        data.text().then((text) => this.handleMessage(text))
        return
      }
      if (data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(data)
        this.handleMessage(text)
      }
    }

    ws.onclose = () => {
      this.ws = null
    }

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('WebSocket connection failed'))
    })
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }

  async listProfiles(): Promise<HubProfile[]> {
    const response = await fetch(`${HUB_URL}/profiles`)
    if (!response.ok) {
      throw new Error('Failed to load profiles')
    }
    const data = (await response.json()) as { profiles: HubProfile[] }
    return data.profiles ?? []
  }

  async createProfile(name?: string): Promise<HubProfile> {
    const response = await fetch(`${HUB_URL}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      throw new Error('Failed to create profile')
    }
    const data = (await response.json()) as { profile: HubProfile }
    return data.profile
  }

  async startProfile(profileId: string): Promise<void> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/start`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error('Failed to start profile')
    }
  }

  async stopProfile(profileId: string): Promise<void> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/stop`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error('Failed to stop profile')
    }
  }

  async deleteProfile(profileId: string): Promise<void> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error('Failed to remove profile')
    }
  }

  async request(profileId: string, method: string, params?: unknown): Promise<unknown> {
    if (!this.ws) {
      console.error('[HubClient] WebSocket not connected')
      throw new Error('WebSocket not connected')
    }
    const requestId = crypto.randomUUID()
    const payload: WsRequest = { type: 'rpc.request', requestId, profileId, method, params }
    // console.log('[HubClient] Sending request:', { profileId, method, requestId })
    this.ws.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId)
          console.error('[HubClient] Request timed out:', { profileId, method, requestId })
          reject(new Error('Request timed out'))
        }
      }, 15000)
      this.pending.set(requestId, {
        resolve: (value) => {
          window.clearTimeout(timeout)
          // console.log('[HubClient] Response received:', { profileId, method, requestId })
          resolve(value)
        },
        reject: (error) => {
          window.clearTimeout(timeout)
          console.error('[HubClient] Request error:', { profileId, method, requestId, error })
          reject(error)
        },
      })
    })
  }

  respond(profileId: string, id: number, result?: unknown, error?: { code?: number; message: string }) {
    if (!this.ws) {
      return
    }
    const payload: WsRequest = { type: 'rpc.response', profileId, id, result, error }
    this.ws.send(JSON.stringify(payload))
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private handleMessage(raw: string): void {
    let payload: WsEvent | WsResponse | null = null
    try {
      payload = JSON.parse(raw) as WsEvent | WsResponse
    } catch {
      return
    }

    if (!payload) {
      return
    }

    if (payload.type === 'rpc.response') {
      const pending = this.pending.get(payload.requestId)
      if (!pending) {
        return
      }
      this.pending.delete(payload.requestId)
      if (payload.error) {
        pending.reject(new Error(payload.error))
      } else {
        pending.resolve(payload.result)
      }
      return
    }

    if (payload.type === 'error') {
      console.error(payload.message)
      return
    }

    this.listeners.forEach((listener) => listener(payload as WsEvent))
  }
}

export const hubClient = new HubClient()
