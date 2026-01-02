import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { JsonRpcConnection } from './jsonrpc'

type ClientInfo = {
  name: string
  title: string
  version: string
}

export type CodexAppServerOptions = {
  codexBin: string
  codexArgs: string[]
  appServerArgs: string[]
  codexHome: string
  clientInfo: ClientInfo
  cwd?: string
}

type CodexAppServerEvents = {
  notification: (message: { method: string; params?: unknown }) => void
  serverRequest: (message: { id: number; method: string; params?: unknown }) => void
  stderr: (message: string) => void
  exit: (code: number | null) => void
  error: (error: Error) => void
}

export class CodexAppServer extends EventEmitter {
  private process?: ChildProcessWithoutNullStreams
  private connection?: JsonRpcConnection
  private ready: Promise<void>
  private resolveReady?: () => void

  constructor(private readonly options: CodexAppServerOptions) {
    super()
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })
  }

  async start(): Promise<void> {
    if (this.process) {
      return
    }

    const args = [
      ...this.options.codexArgs,
      'app-server',
      ...this.options.appServerArgs,
    ]

    const child = spawn(this.options.codexBin, args, {
      env: {
        ...process.env,
        CODEX_HOME: this.options.codexHome,
      },
      cwd: this.options.cwd,
      stdio: 'pipe',
    })

    this.process = child
    this.connection = new JsonRpcConnection(
      child.stdin,
      child.stdout,
      child.stderr
    )

    this.connection.on('notification', (message) => {
      this.emit('notification', message)
    })
    this.connection.on('serverRequest', (message) => {
      this.emit('serverRequest', message)
    })
    this.connection.on('stderr', (message) => {
      this.emit('stderr', message)
    })
    this.connection.on('error', (error) => {
      this.emit('error', error)
    })
    child.on('exit', (code) => {
      this.emit('exit', code)
    })

    await this.initialize()
    this.resolveReady?.()
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.ready
    if (!this.connection) {
      throw new Error('app-server is not running')
    }
    return this.connection.sendRequest(method, params)
  }

  notify(method: string, params?: unknown): void {
    if (!this.connection) {
      return
    }
    this.connection.sendNotification(method, params)
  }

  respond(id: number, result?: unknown, error?: { code?: number; message: string }): void {
    if (!this.connection) {
      return
    }
    this.connection.sendResponse(id, result, error)
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return
    }
    this.process.kill()
    this.process = undefined
    this.connection = undefined
  }

  private async initialize(): Promise<void> {
    if (!this.connection) {
      throw new Error('missing JSON-RPC connection')
    }
    await this.connection.sendRequest('initialize', {
      clientInfo: this.options.clientInfo,
    })
    this.connection.sendNotification('initialized', {})
  }
}

export type CodexAppServerEventsMap = CodexAppServerEvents
