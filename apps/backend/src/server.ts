import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { loadConfig } from './config'
import { CodexSupervisor } from './services/supervisor'
import { ProfileStore } from './services/profile-store'
import { readProfileConfig, updateProfileMcpServers, writeProfileConfig, type McpServerConfig } from './services/codex-config'
import { AnalyticsStore } from './analytics/store'
import { AnalyticsService } from './analytics/service'
import { ThreadIndexStore } from './thread-index/store'
import { ThreadIndexService, type ThreadListItem } from './thread-index/service'
import { ThreadActivityService } from './thread-activity/service'
import { ReviewService } from './reviews/service'
import { ReviewStore } from './reviews/store'
import type { WsEvent, WsRequest, WsResponse } from './ws/messages'

const config = loadConfig()

const profileStore = new ProfileStore(config.dataDir, config.profilesDir)
await profileStore.init()
await profileStore.ensureDefault(config.defaultCodexHome)

const supervisor = new CodexSupervisor(config)
const analytics = new AnalyticsService(new AnalyticsStore(join(config.dataDir, 'analytics.sqlite')))
analytics.init()
const threadIndex = new ThreadIndexService(new ThreadIndexStore(join(config.dataDir, 'threads.sqlite')))
threadIndex.init()
const threadActivity = new ThreadActivityService()
const reviews = new ReviewService(new ReviewStore(join(config.dataDir, 'reviews.sqlite')))
reviews.init()

type WsClient = { send: (data: string) => void; id: string }

const clients = new Set<WsClient>()

const sendWsEvent = (event: WsEvent) => {
  const payload = JSON.stringify(event)
  clients.forEach((client) => client.send(payload))
}

const shouldLogRouteErrors =
  process.env.CODEX_HUB_DEBUG_ROUTES === '1' || process.env.NODE_ENV !== 'production'

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`
  }
  return String(error)
}

const app = new Elysia()
  .use(cors({ origin: true }))
  .onError(({ code, error, request }) => {
    if (!shouldLogRouteErrors || code === 'NOT_FOUND') {
      return
    }
    console.error(`[HubBackend] ${request.method} ${request.url} -> ${code}`)
    console.error(formatError(error))
  })
  .get('/health', () => ({ ok: true }))
  .get('/config', () => ({ token: config.authToken }))
  .get(
    '/analytics/daily',
    ({ query }) => {
      const metric = typeof query.metric === 'string' ? query.metric : 'turns_started'
      const profileId = typeof query.profileId === 'string' ? query.profileId : undefined
      const model = typeof query.model === 'string' ? query.model : undefined
      const days = Number(query.days ?? 365)
      const series = analytics.getDailySeries(metric, profileId, model, Number.isFinite(days) ? days : 365)
      return { metric, series }
    },
    {
      query: t.Object({
        metric: t.Optional(t.String()),
        profileId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        days: t.Optional(t.String()),
      }),
    }
  )
  .get('/profiles', () => ({ profiles: profileStore.list() }))
  .get(
    '/reviews',
    ({ query }) => {
      const profileId = typeof query.profileId === 'string' ? query.profileId : undefined
      const limit = Number(query.limit ?? 100)
      const offset = Number(query.offset ?? 0)
      return { sessions: reviews.list({ profileId, limit, offset }) }
    },
    {
      query: t.Object({
        profileId: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/profiles',
    async ({ body }) => {
      const profile = await profileStore.create(body?.name)
      return { profile }
    },
    {
      body: t.Optional(
        t.Object({
          name: t.Optional(t.String()),
        })
      ),
    }
  )
  .post(
    '/profiles/:profileId/start',
    async ({ params }) => {
      const profile = profileStore.get(params.profileId)
      if (!profile) {
        return new Response('Profile not found', { status: 404 })
      }
      await supervisor.start(profile)
      return { ok: true }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
    }
  )
  .post(
    '/profiles/:profileId/stop',
    async ({ params }) => {
      await supervisor.stop(params.profileId)
      return { ok: true }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
    }
  )
  .delete(
    '/profiles/:profileId',
    async ({ params }) => {
      if (params.profileId === 'default') {
        return new Response('Cannot remove default profile', { status: 400 })
      }
      await supervisor.stop(params.profileId)
      const removed = await profileStore.remove(params.profileId)
      if (!removed) {
        return new Response('Profile not found', { status: 404 })
      }
      return { ok: true }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
    }
  )
  .get(
    '/profiles/:profileId/prompts',
    async ({ params }) => {
      const profile = profileStore.get(params.profileId)
      if (!profile) {
        return new Response('Profile not found', { status: 404 })
      }
      const promptsDir = join(profile.codexHome, 'prompts')
      let entries: Array<string> = []
      try {
        entries = (await readdir(promptsDir)).filter((entry) => entry.endsWith('.md'))
      } catch {
        return { prompts: [] }
      }

      const prompts = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(promptsDir, entry)
          let description: string | undefined
          try {
            const raw = await readFile(fullPath, 'utf8')
            const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/)
            const frontmatterBody = frontmatterMatch?.[1]
            if (frontmatterBody !== undefined) {
              const lines = frontmatterBody.split('\n')
              const descLine = lines.find((line) => line.trim().startsWith('description:'))
              if (descLine) {
                description = descLine
                  .split(':')
                  .slice(1)
                  .join(':')
                  .trim()
                  .replace(/^\"|\"$/g, '')
              }
            }
          } catch {
            // ignore
          }
          const name = basename(entry, extname(entry))
          return { name, description }
        })
      )

      return { prompts }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
    }
  )
  .get(
    '/profiles/:profileId/prompts/:name',
    async ({ params }) => {
      const profile = profileStore.get(params.profileId)
      if (!profile) {
        return new Response('Profile not found', { status: 404 })
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(params.name)) {
        return new Response('Invalid prompt name', { status: 400 })
      }
      const promptsDir = join(profile.codexHome, 'prompts')
      const target = params.name.endsWith('.md') ? params.name : `${params.name}.md`
      const fullPath = join(promptsDir, target)
      try {
        const content = await readFile(fullPath, 'utf8')
        return { content }
      } catch {
        return new Response('Prompt not found', { status: 404 })
      }
    },
    {
      params: t.Object({
        profileId: t.String(),
        name: t.String(),
      }),
    }
  )
  .get(
    '/profiles/:profileId/config',
    async ({ params }) => {
      const profile = profileStore.get(params.profileId)
      if (!profile) {
        return new Response('Profile not found', { status: 404 })
      }
      const snapshot = await readProfileConfig(profile.codexHome)
      return {
        path: snapshot.path,
        codexHome: profile.codexHome,
        content: snapshot.content,
        mcpServers: snapshot.mcpServers,
      }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
    }
  )
  .put(
    '/profiles/:profileId/config',
    async ({ params, body }) => {
      const profile = profileStore.get(params.profileId)
      if (!profile) {
        return new Response('Profile not found', { status: 404 })
      }
      if (!body || typeof body !== 'object' || typeof (body as { content?: string }).content !== 'string') {
        return new Response('Invalid config payload', { status: 400 })
      }
      const snapshot = await writeProfileConfig(profile.codexHome, (body as { content: string }).content)
      return {
        ok: true,
        path: snapshot.path,
        codexHome: profile.codexHome,
        content: snapshot.content,
        mcpServers: snapshot.mcpServers,
      }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
      body: t.Object({
        content: t.String(),
      }),
    }
  )
  .put(
    '/profiles/:profileId/mcp-servers',
    async ({ params, body }) => {
      const profile = profileStore.get(params.profileId)
      if (!profile) {
        return new Response('Profile not found', { status: 404 })
      }
      if (!body || typeof body !== 'object' || !Array.isArray((body as { servers?: McpServerConfig[] }).servers)) {
        return new Response('Invalid MCP server payload', { status: 400 })
      }
      const servers = (body as { servers: McpServerConfig[] }).servers
      for (const server of servers) {
        if (!server?.name || !/^[a-zA-Z0-9._-]+$/.test(server.name)) {
          return new Response('Invalid MCP server name', { status: 400 })
        }
      }
      const snapshot = await updateProfileMcpServers(profile.codexHome, servers)
      return {
        ok: true,
        path: snapshot.path,
        codexHome: profile.codexHome,
        content: snapshot.content,
        mcpServers: snapshot.mcpServers,
      }
    },
    {
      params: t.Object({
        profileId: t.String(),
      }),
      body: t.Object({
        servers: t.Array(t.Any()),
      }),
    }
  )
  .get(
    '/threads/search',
    ({ query }) => {
      const q = typeof query.q === 'string' ? query.q : undefined
      const profileId = typeof query.profileId === 'string' ? query.profileId : undefined
      const model = typeof query.model === 'string' ? query.model : undefined
      const status = query.status === 'archived' ? 'archived' : query.status === 'active' ? 'active' : undefined
      const createdAfter = query.createdAfter ? Number(query.createdAfter) : undefined
      const createdBefore = query.createdBefore ? Number(query.createdBefore) : undefined
      const limit = query.limit ? Number(query.limit) : undefined
      const offset = query.offset ? Number(query.offset) : undefined
      const threads = threadIndex.search({
        query: q,
        profileId,
        model,
        status,
        createdAfter: Number.isFinite(createdAfter) ? createdAfter : undefined,
        createdBefore: Number.isFinite(createdBefore) ? createdBefore : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      })
      return { threads }
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        profileId: t.Optional(t.String()),
        model: t.Optional(t.String()),
        status: t.Optional(t.String()),
        createdAfter: t.Optional(t.String()),
        createdBefore: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  )
  .get(
    '/threads/active',
    ({ query }) => {
      const profileId = typeof query.profileId === 'string' ? query.profileId : undefined
      return { threads: threadActivity.list(profileId) }
    },
    {
      query: t.Object({
        profileId: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/threads/reindex',
    async ({ body }) => {
      const limit = typeof body?.limit === 'number' ? body.limit : 100
      const autoStart = body?.autoStart === true
      const targetProfileId = typeof body?.profileId === 'string' ? body.profileId : null
      const profiles = targetProfileId
        ? profileStore.list().filter((profile) => profile.id === targetProfileId)
        : profileStore.list()

      const results: Array<{ profileId: string; ok: boolean; error?: string }> = []
      for (const profile of profiles) {
        try {
          if (autoStart) {
            await supervisor.start(profile)
          }
          const response = await supervisor.request(profile.id, 'thread/list', { limit })
          const data = (response as { data?: ThreadListItem[] }).data ?? []
          threadIndex.recordThreadList(profile.id, data)
          results.push({ profileId: profile.id, ok: true })
        } catch (error) {
          results.push({ profileId: profile.id, ok: false, error: error instanceof Error ? error.message : 'failed' })
        }
      }

      return { ok: true, results }
    },
    {
      body: t.Optional(
        t.Object({
          profileId: t.Optional(t.String()),
          limit: t.Optional(t.Number()),
          autoStart: t.Optional(t.Boolean()),
        })
      ),
    }
  )
  .ws('/ws', {
    open(ws) {
      // Get token from query params via ws.data which contains the request context
      const token = ws.data.query?.token as string | undefined
      if (token !== config.authToken) {
        ws.close(1008, 'unauthorized')
        return
      }
      clients.add(ws)
    },
    close(ws) {
      clients.delete(ws)
    },
    async message(ws, message) {
      let payload: WsRequest | null = null
      try {
        if (typeof message === 'string') {
          payload = JSON.parse(message) as WsRequest
        } else if (message instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(message)
          payload = JSON.parse(text) as WsRequest
        } else if (ArrayBuffer.isView(message)) {
          const view = new Uint8Array(
            message.buffer,
            message.byteOffset,
            message.byteLength
          )
          const text = new TextDecoder().decode(view)
          payload = JSON.parse(text) as WsRequest
        } else if (message && typeof message === 'object') {
          payload = message as WsRequest
        }
      } catch {
        const response: WsResponse = { type: 'error', message: 'Invalid JSON' }
        ws.send(JSON.stringify(response))
        return
      }

      if (!payload) {
        return
      }

      if (payload.type === 'profile.start') {
        const profile = profileStore.get(payload.profileId)
        if (!profile) {
          const response: WsResponse = {
            type: 'error',
            message: 'Profile not found',
          }
          ws.send(JSON.stringify(response))
          return
        }
        await supervisor.start(profile)
        const response: WsResponse = {
          type: 'profile.started',
          profileId: profile.id,
        }
        ws.send(JSON.stringify(response))
        return
      }

      if (payload.type === 'profile.stop') {
        await supervisor.stop(payload.profileId)
        threadActivity.clearProfile(payload.profileId)
        const response: WsResponse = {
          type: 'profile.stopped',
          profileId: payload.profileId,
        }
        ws.send(JSON.stringify(response))
        return
      }

      if (payload.type === 'rpc.request') {
        try {
          analytics.trackRpcRequest({
            profileId: payload.profileId,
            method: payload.method,
            params: payload.params,
          })
          const result = await supervisor.request(
            payload.profileId,
            payload.method,
            payload.params
          )
          if (payload.method === 'thread/list') {
            const data = (result as { data?: ThreadListItem[] }).data ?? []
            threadIndex.recordThreadList(payload.profileId, data)
          }
          if (payload.method === 'thread/start') {
            const thread = (result as { thread?: ThreadListItem }).thread
            threadIndex.recordThreadStart(payload.profileId, thread)
          }
          if (payload.method === 'thread/resume') {
            const thread = (result as { thread?: ThreadListItem & { turns?: Array<{ id?: string; status?: string }> } }).thread
            threadIndex.recordThreadResume(payload.profileId, thread)
            if (thread?.id) {
              let activeTurnId: string | null = null
              if (Array.isArray(thread.turns)) {
                for (let index = thread.turns.length - 1; index >= 0; index -= 1) {
                  if (thread.turns[index]?.status === 'inProgress') {
                    activeTurnId = thread.turns[index]?.id ?? null
                    break
                  }
                }
              }
              if (activeTurnId) {
                threadActivity.markStarted(payload.profileId, thread.id, activeTurnId)
              } else {
                threadActivity.markCompleted(payload.profileId, thread.id)
              }
            }
          }
          if (payload.method === 'thread/archive') {
            const params = payload.params as { threadId?: string } | undefined
            if (params?.threadId) {
              threadIndex.recordThreadArchive(payload.profileId, params.threadId)
              threadActivity.markCompleted(payload.profileId, params.threadId)
            }
          }
          analytics.trackRpcResponse({
            profileId: payload.profileId,
            method: payload.method,
            result,
          })
          const response: WsResponse = {
            type: 'rpc.response',
            requestId: payload.requestId,
            result,
          }
          ws.send(JSON.stringify(response))
        } catch (error) {
          analytics.trackRpcResponse({
            profileId: payload.profileId,
            method: payload.method,
            error: error instanceof Error ? error.message : 'Request failed',
          })
          const response: WsResponse = {
            type: 'rpc.response',
            requestId: payload.requestId,
            error: error instanceof Error ? error.message : 'Request failed',
          }
          ws.send(JSON.stringify(response))
        }
        return
      }

      if (payload.type === 'rpc.response') {
        analytics.trackApprovalDecision(payload.profileId, payload.id, payload.result, payload.error ?? null)
        supervisor.respond(payload.profileId, payload.id, payload.result, payload.error)
      }
    },
  })

supervisor.on('notification', (event) => {
  if (event.method === 'turn/started' && event.params && typeof event.params === 'object') {
    const { threadId, turn } = event.params as { threadId?: string; turn?: { id?: string } }
    if (threadId) {
      threadActivity.markStarted(event.profileId, threadId, turn?.id ?? null)
    }
  }
  if (event.method === 'turn/completed' && event.params && typeof event.params === 'object') {
    const { threadId } = event.params as { threadId?: string }
    if (threadId) {
      threadActivity.markCompleted(event.profileId, threadId)
    }
  }
  if (event.method === 'item/started' && event.params && typeof event.params === 'object') {
    const { threadId, turnId, item } = event.params as {
      threadId?: string
      turnId?: string
      item?: { id?: string; type?: string; review?: string }
    }
    if (threadId && item?.type === 'enteredReviewMode') {
      const sessionId = turnId ?? item.id ?? `${threadId}-${Date.now()}`
      reviews.upsert({
        id: sessionId,
        threadId,
        profileId: event.profileId,
        label: typeof item.review === 'string' ? item.review : 'Review',
        status: 'running',
        startedAt: Date.now(),
        completedAt: null,
        model: null,
        cwd: null,
        review: null,
      })
    }
  }
  if (event.method === 'item/completed' && event.params && typeof event.params === 'object') {
    const { turnId, item } = event.params as {
      turnId?: string
      item?: { id?: string; type?: string; review?: string }
    }
    if (item?.type === 'exitedReviewMode') {
      const sessionId = turnId ?? item.id
      if (sessionId) {
        reviews.complete(sessionId, typeof item.review === 'string' ? item.review : null, Date.now())
      }
    }
  }
  if (event.method === 'thread/started') {
    const thread = (event.params as { thread?: ThreadListItem })?.thread
    threadIndex.recordThreadStart(event.profileId, thread)
  }
  analytics.trackRpcEvent({
    profileId: event.profileId,
    method: event.method,
    params: event.params,
  })
  const wsEvent: WsEvent = {
    type: 'rpc.event',
    profileId: event.profileId,
    method: event.method,
    params: event.params,
  }
  sendWsEvent(wsEvent)
})

supervisor.on('serverRequest', (event) => {
  analytics.trackServerRequest({
    profileId: event.profileId,
    id: event.id,
    method: event.method,
    params: event.params,
  })
  const wsEvent: WsEvent = {
    type: 'rpc.serverRequest',
    profileId: event.profileId,
    id: event.id,
    method: event.method,
    params: event.params,
  }
  sendWsEvent(wsEvent)
})

supervisor.on('diagnostic', (event) => {
  const wsEvent: WsEvent = {
    type: 'profile.diagnostic',
    profileId: event.profileId,
    message: event.message,
  }
  sendWsEvent(wsEvent)
})

supervisor.on('exit', (event) => {
  threadActivity.clearProfile(event.profileId)
  const wsEvent: WsEvent = {
    type: 'profile.exit',
    profileId: event.profileId,
    code: event.code,
  }
  sendWsEvent(wsEvent)
})

supervisor.on('error', (event) => {
  if (shouldLogRouteErrors) {
    console.error(`[HubBackend] profile ${event.profileId} error`)
    console.error(formatError(event.error))
  }
  const wsEvent: WsEvent = {
    type: 'profile.error',
    profileId: event.profileId,
    message: event.error.message,
  }
  sendWsEvent(wsEvent)
})

await mkdir(config.dataDir, { recursive: true })
app.listen({
  port: config.port,
  hostname: config.host,
})

console.log(
  `Codex Hub backend listening on http://${config.host}:${config.port}`
)
console.log(`WebSocket token: ${config.authToken}`)
