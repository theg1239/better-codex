import { AnalyticsStore, type AnalyticsEvent, deriveDateKey } from './store'

type RpcEvent = {
  profileId: string
  method: string
  params?: unknown
}

type RpcRequest = {
  profileId: string
  method: string
  params?: unknown
}

type RpcResponse = {
  profileId: string
  method?: string
  result?: unknown
  error?: string
}

type ServerRequest = {
  profileId: string
  id: number
  method: string
  params?: unknown
}

type ApprovalDecision = {
  decision?: string
  acceptSettings?: { forSession?: boolean }
}

const now = () => Date.now()

export class AnalyticsService {
  private readonly store: AnalyticsStore
  private readonly pendingApprovals = new Map<number, { type: string }>()

  constructor(store: AnalyticsStore) {
    this.store = store
  }

  init(): void {
    this.store.init()
  }

  getDailySeries(metric: string, profileId?: string, model?: string, days = 365) {
    return this.store.getDailySeries(metric, profileId, model, days)
  }

  trackRpcEvent(event: RpcEvent): void {
    const timestamp = now()
    const base: AnalyticsEvent = {
      occurredAt: timestamp,
      dateKey: deriveDateKey(timestamp),
      profileId: event.profileId,
      eventType: `rpc.event:${event.method}`,
      payload: event.params,
    }
    this.store.recordEvent(base)

    if (event.method === 'thread/started' && event.params && typeof event.params === 'object') {
      const { thread } = event.params as { thread?: { id?: string; modelProvider?: string; cwd?: string; createdAt?: number } }
      if (thread?.id) {
        this.store.upsertThreadMeta(thread.id, event.profileId, thread.modelProvider, thread.cwd, thread.createdAt ? thread.createdAt * 1000 : undefined)
        this.store.incrementDaily('threads_started', event.profileId, thread.modelProvider, timestamp)
      }
    }

    if (event.method === 'turn/started' && event.params && typeof event.params === 'object') {
      const { threadId, turn } = event.params as { threadId?: string; turn?: { id?: string } }
      if (threadId && turn?.id) {
        this.store.upsertTurnMeta(turn.id, threadId, event.profileId, undefined, timestamp)
        this.store.incrementDaily('turns_started', event.profileId, undefined, timestamp)
      }
    }

    if (event.method === 'turn/completed' && event.params && typeof event.params === 'object') {
      const { threadId, turn } = event.params as { threadId?: string; turn?: { id?: string; status?: string } }
      if (threadId && turn?.id) {
        this.store.upsertTurnMeta(turn.id, threadId, event.profileId, undefined, undefined, timestamp, turn.status)
        this.store.incrementDaily('turns_completed', event.profileId, undefined, timestamp)
        if (turn.status) {
          this.store.incrementDaily(`turns_${turn.status}`, event.profileId, undefined, timestamp)
        }
      }
    }

    if (event.method === 'item/started' && event.params && typeof event.params === 'object') {
      const { item } = event.params as { item?: { type?: string; id?: string } }
      const itemType = item?.type
      if (itemType) {
        this.store.incrementDaily(`items_${itemType}`, event.profileId, undefined, timestamp)
      }
    }

    if (event.method === 'item/completed' && event.params && typeof event.params === 'object') {
      const { item } = event.params as { item?: { type?: string; id?: string } }
      const itemType = item?.type
      if (itemType) {
        this.store.incrementDaily(`items_completed_${itemType}`, event.profileId, undefined, timestamp)
      }
    }

    if (event.method === 'thread/tokenUsage/updated' && event.params && typeof event.params === 'object') {
      const { threadId } = event.params as { threadId?: string }
      if (threadId) {
        this.store.recordTokenUsage(event.profileId, threadId, event.params, timestamp)
      }
    }
  }

  trackRpcRequest(request: RpcRequest): void {
    const timestamp = now()
    const base: AnalyticsEvent = {
      occurredAt: timestamp,
      dateKey: deriveDateKey(timestamp),
      profileId: request.profileId,
      eventType: `rpc.request:${request.method}`,
      payload: request.params,
    }
    this.store.recordEvent(base)

    if (request.method === 'turn/start') {
      const params = (request.params ?? {}) as { model?: string; threadId?: string }
      if (params.threadId && params.model) {
        this.store.upsertThreadMeta(params.threadId, request.profileId, params.model)
      }
    }

    if (request.method === 'command/exec') {
      this.store.incrementDaily('command_exec', request.profileId, undefined, timestamp)
    }

    if (request.method === 'review/start') {
      this.store.incrementDaily('reviews_started', request.profileId, undefined, timestamp)
    }

    if (request.method === 'account/login/start') {
      const params = (request.params ?? {}) as { type?: string }
      if (params.type) {
        this.store.incrementDaily(`login_started_${params.type}`, request.profileId, undefined, timestamp)
      }
    }
  }

  trackRpcResponse(response: RpcResponse): void {
    const timestamp = now()
    const base: AnalyticsEvent = {
      occurredAt: timestamp,
      dateKey: deriveDateKey(timestamp),
      profileId: response.profileId,
      eventType: `rpc.response:${response.method ?? 'unknown'}`,
      status: response.error ? 'error' : 'ok',
      payload: response.error ?? response.result,
    }
    this.store.recordEvent(base)

    if (response.method === 'thread/start' && response.result && typeof response.result === 'object') {
      const { thread } = response.result as { thread?: { id?: string; modelProvider?: string; cwd?: string; createdAt?: number } }
      if (thread?.id) {
        this.store.upsertThreadMeta(thread.id, response.profileId, thread.modelProvider, thread.cwd, thread.createdAt ? thread.createdAt * 1000 : undefined)
      }
    }

    if (response.method === 'thread/resume' && response.result && typeof response.result === 'object') {
      const result = response.result as { thread?: { id?: string; modelProvider?: string; cwd?: string } }
      if (result.thread?.id) {
        this.store.upsertThreadMeta(result.thread.id, response.profileId, result.thread.modelProvider, result.thread.cwd)
      }
    }
  }

  trackServerRequest(request: ServerRequest): void {
    const timestamp = now()
    const base: AnalyticsEvent = {
      occurredAt: timestamp,
      dateKey: deriveDateKey(timestamp),
      profileId: request.profileId,
      eventType: `rpc.serverRequest:${request.method}`,
      payload: request.params,
    }
    this.store.recordEvent(base)

    if (request.method === 'item/commandExecution/requestApproval') {
      this.pendingApprovals.set(request.id, { type: 'command' })
      this.store.recordApprovalRequest(request.id, request.profileId, 'command', (request.params as { threadId?: string; itemId?: string })?.threadId, (request.params as { itemId?: string })?.itemId)
      this.store.incrementDaily('approvals_requested_command', request.profileId, undefined, timestamp)
    }

    if (request.method === 'item/fileChange/requestApproval') {
      this.pendingApprovals.set(request.id, { type: 'file' })
      this.store.recordApprovalRequest(request.id, request.profileId, 'file', (request.params as { threadId?: string; itemId?: string })?.threadId, (request.params as { itemId?: string })?.itemId)
      this.store.incrementDaily('approvals_requested_file', request.profileId, undefined, timestamp)
    }
  }

  trackApprovalDecision(profileId: string, requestId: number, result?: unknown, error?: { message: string } | null): void {
    const timestamp = now()
    const decisionPayload = result as ApprovalDecision | undefined
    const decision = error ? 'error' : decisionPayload?.decision ?? 'unknown'

    this.store.recordEvent({
      occurredAt: timestamp,
      dateKey: deriveDateKey(timestamp),
      profileId,
      eventType: 'approval.decision',
      status: decision,
      payload: result ?? error,
    })

    if (this.pendingApprovals.has(requestId)) {
      this.pendingApprovals.delete(requestId)
      this.store.recordApprovalDecision(requestId, decision)
      this.store.incrementDaily(`approvals_${decision}`, profileId, undefined, timestamp)
    }
  }
}
