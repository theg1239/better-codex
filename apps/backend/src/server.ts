import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { mkdir } from 'node:fs/promises'
import { loadConfig } from './config'
import { CodexSupervisor } from './services/supervisor'
import { ProfileStore } from './services/profile-store'
import type { WsEvent, WsRequest, WsResponse } from './ws/messages'

const config = loadConfig()

const profileStore = new ProfileStore(config.dataDir, config.profilesDir)
await profileStore.init()
await profileStore.ensureDefault(config.defaultCodexHome)

const supervisor = new CodexSupervisor(config)

type WsClient = { send: (data: string) => void; id: string }

const clients = new Set<WsClient>()

const sendWsEvent = (event: WsEvent) => {
  const payload = JSON.stringify(event)
  clients.forEach((client) => client.send(payload))
}

const app = new Elysia()
  .use(cors({ origin: true }))
  .get('/health', () => ({ ok: true }))
  .get('/profiles', () => ({ profiles: profileStore.list() }))
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
        const response: WsResponse = {
          type: 'profile.stopped',
          profileId: payload.profileId,
        }
        ws.send(JSON.stringify(response))
        return
      }

      if (payload.type === 'rpc.request') {
        try {
          const result = await supervisor.request(
            payload.profileId,
            payload.method,
            payload.params
          )
          const response: WsResponse = {
            type: 'rpc.response',
            requestId: payload.requestId,
            result,
          }
          ws.send(JSON.stringify(response))
        } catch (error) {
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
        supervisor.respond(payload.profileId, payload.id, payload.result, payload.error)
      }
    },
  })

supervisor.on('notification', (event) => {
  const wsEvent: WsEvent = {
    type: 'rpc.event',
    profileId: event.profileId,
    method: event.method,
    params: event.params,
  }
  sendWsEvent(wsEvent)
})

supervisor.on('serverRequest', (event) => {
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
  const wsEvent: WsEvent = {
    type: 'profile.exit',
    profileId: event.profileId,
    code: event.code,
  }
  sendWsEvent(wsEvent)
})

supervisor.on('error', (event) => {
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
