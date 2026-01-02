import { EventEmitter } from 'node:events'
import { CodexAppServer } from '../core/app-server'
import type { HubConfig } from '../config'
import type { Profile } from './profile-store'

type SupervisorEvents = {
  notification: (payload: {
    profileId: string
    method: string
    params?: unknown
  }) => void
  serverRequest: (payload: {
    profileId: string
    id: number
    method: string
    params?: unknown
  }) => void
  diagnostic: (payload: { profileId: string; message: string }) => void
  exit: (payload: { profileId: string; code: number | null }) => void
  error: (payload: { profileId: string; error: Error }) => void
}

export class CodexSupervisor extends EventEmitter {
  private readonly processes = new Map<string, CodexAppServer>()

  constructor(private readonly config: HubConfig) {
    super()
  }

  async start(profile: Profile): Promise<CodexAppServer> {
    const existing = this.processes.get(profile.id)
    if (existing) {
      return existing
    }

    const server = new CodexAppServer({
      codexBin: this.config.codexBin,
      codexArgs: this.config.codexArgs,
      appServerArgs: this.config.codexAppServerArgs,
      codexHome: profile.codexHome,
      clientInfo: this.config.clientInfo,
      cwd: this.config.defaultCwd,
    })

    server.on('notification', (message) => {
      this.emit('notification', {
        profileId: profile.id,
        method: message.method,
        params: message.params,
      })
    })
    server.on('serverRequest', (message) => {
      this.emit('serverRequest', {
        profileId: profile.id,
        id: message.id,
        method: message.method,
        params: message.params,
      })
    })
    server.on('stderr', (message) => {
      this.emit('diagnostic', { profileId: profile.id, message })
    })
    server.on('exit', (code) => {
      this.processes.delete(profile.id)
      this.emit('exit', { profileId: profile.id, code })
    })
    server.on('error', (error) => {
      this.emit('error', { profileId: profile.id, error })
    })

    await server.start()
    this.processes.set(profile.id, server)
    return server
  }

  async stop(profileId: string): Promise<void> {
    const server = this.processes.get(profileId)
    if (!server) {
      return
    }
    await server.stop()
    this.processes.delete(profileId)
  }

  async request(profileId: string, method: string, params?: unknown): Promise<unknown> {
    const server = this.processes.get(profileId)
    if (!server) {
      throw new Error('profile app-server not running')
    }
    return server.request(method, params)
  }

  respond(profileId: string, id: number, result?: unknown, error?: { code?: number; message: string }): void {
    const server = this.processes.get(profileId)
    if (!server) {
      return
    }
    server.respond(id, result, error)
  }
}

export type CodexSupervisorEventsMap = SupervisorEvents
