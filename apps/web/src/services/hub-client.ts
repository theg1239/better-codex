import { getHubToken, HUB_URL } from '../config'

export type HubProfile = {
  id: string
  name: string
  codexHome: string
  createdAt: string
}

export type PromptSummary = {
  name: string
  description?: string
}

export type McpServerConfig = {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  env_vars?: string[]
  cwd?: string
  url?: string
  bearer_token_env_var?: string
  http_headers?: Record<string, string>
  env_http_headers?: Record<string, string>
  enabled?: boolean
  startup_timeout_sec?: number
  startup_timeout_ms?: number
  tool_timeout_sec?: number
  enabled_tools?: string[]
  disabled_tools?: string[]
}

export type ProfileConfigSnapshot = {
  path: string
  codexHome: string
  content: string
  mcpServers: McpServerConfig[]
}

export type ThreadSearchResult = {
  threadId: string
  profileId: string
  preview: string | null
  modelProvider: string | null
  createdAt: number | null
  path: string | null
  cwd: string | null
  source: string | null
  cliVersion: string | null
  status: 'active' | 'archived'
  archivedAt: number | null
  lastSeenAt: number | null
}

export type ActiveThread = {
  threadId: string
  profileId: string
  turnId: string | null
  startedAt: number
}

export type ReviewSessionResult = {
  id: string
  threadId: string
  profileId: string
  label: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt: number | null
  model: string | null
  cwd: string | null
  review: string | null
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
    const token = await getHubToken({ forceRefresh: true })
    if (!token) {
      throw new Error('Missing hub token - backend may not be running')
    }

    const ws = new WebSocket(toWsUrl(HUB_URL, token))
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

  async listPrompts(profileId: string): Promise<PromptSummary[]> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/prompts`)
    if (!response.ok) {
      throw new Error('Failed to load prompts')
    }
    const data = (await response.json()) as { prompts: PromptSummary[] }
    return data.prompts ?? []
  }

  async readPrompt(profileId: string, name: string): Promise<string> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/prompts/${encodeURIComponent(name)}`)
    if (!response.ok) {
      throw new Error('Failed to load prompt')
    }
    const data = (await response.json()) as { content?: string }
    return data.content ?? ''
  }

  async getProfileConfig(profileId: string): Promise<ProfileConfigSnapshot> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/config`)
    if (!response.ok) {
      throw new Error('Failed to load config')
    }
    return (await response.json()) as ProfileConfigSnapshot
  }

  async saveProfileConfig(profileId: string, content: string): Promise<ProfileConfigSnapshot> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!response.ok) {
      throw new Error('Failed to save config')
    }
    const data = (await response.json()) as { content?: string } & ProfileConfigSnapshot
    return data
  }

  async saveMcpServers(profileId: string, servers: McpServerConfig[]): Promise<ProfileConfigSnapshot> {
    const response = await fetch(`${HUB_URL}/profiles/${profileId}/mcp-servers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers }),
    })
    if (!response.ok) {
      throw new Error('Failed to save MCP servers')
    }
    const data = (await response.json()) as ProfileConfigSnapshot
    return data
  }

  async searchThreads(params: {
    query?: string
    profileId?: string
    model?: string
    status?: 'active' | 'archived'
    createdAfter?: number
    createdBefore?: number
    limit?: number
    offset?: number
  }): Promise<ThreadSearchResult[]> {
    const url = new URL('/threads/search', HUB_URL)
    if (params.query) url.searchParams.set('q', params.query)
    if (params.profileId) url.searchParams.set('profileId', params.profileId)
    if (params.model) url.searchParams.set('model', params.model)
    if (params.status) url.searchParams.set('status', params.status)
    if (params.createdAfter) url.searchParams.set('createdAfter', String(params.createdAfter))
    if (params.createdBefore) url.searchParams.set('createdBefore', String(params.createdBefore))
    if (params.limit) url.searchParams.set('limit', String(params.limit))
    if (params.offset) url.searchParams.set('offset', String(params.offset))
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error('Failed to search threads')
    }
    const data = (await response.json()) as { threads?: ThreadSearchResult[] }
    return data.threads ?? []
  }

  async listActiveThreads(params?: { profileId?: string }): Promise<ActiveThread[]> {
    const url = new URL('/threads/active', HUB_URL)
    if (params?.profileId) url.searchParams.set('profileId', params.profileId)
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error('Failed to load active threads')
    }
    const data = (await response.json()) as { threads?: ActiveThread[] }
    return data.threads ?? []
  }

  async clearActiveThread(params: { profileId: string; threadId: string }): Promise<void> {
    const url = new URL(`/threads/active/${params.threadId}`, HUB_URL)
    url.searchParams.set('profileId', params.profileId)
    const response = await fetch(url.toString(), { method: 'DELETE' })
    if (!response.ok) {
      throw new Error('Failed to clear active thread')
    }
  }

  async listReviews(params?: { profileId?: string; limit?: number; offset?: number }): Promise<ReviewSessionResult[]> {
    const url = new URL('/reviews', HUB_URL)
    if (params?.profileId) url.searchParams.set('profileId', params.profileId)
    if (params?.limit) url.searchParams.set('limit', String(params.limit))
    if (params?.offset) url.searchParams.set('offset', String(params.offset))
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error('Failed to load reviews')
    }
    const data = (await response.json()) as { sessions?: ReviewSessionResult[] }
    return data.sessions ?? []
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private async sendRequest(profileId: string, method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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

  async request(profileId: string, method: string, params?: unknown): Promise<unknown> {
    try {
      return await this.sendRequest(profileId, method, params)
    } catch (error) {
      if (this.isProfileNotRunning(error)) {
        await this.startProfile(profileId)
        return await this.sendRequest(profileId, method, params)
      }
      throw error
    }
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

  private isProfileNotRunning(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }
    return error instanceof Error && error.message.includes('profile app-server not running')
  }
}

export const hubClient = new HubClient()
