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
  private readonly startupTimeoutMs: number
  private readonly startupStderr: string[] = []
  private readonly maxStartupStderr = 20
  private startupComplete = false

  constructor(private readonly options: CodexAppServerOptions) {
    super()
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })
    const parsed = Number(process.env.CODEX_HUB_APP_SERVER_STARTUP_TIMEOUT_MS ?? 15000)
    this.startupTimeoutMs = Number.isFinite(parsed) ? Math.max(parsed, 0) : 15000
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
      if (!this.startupComplete) {
        this.startupStderr.push(message)
        if (this.startupStderr.length > this.maxStartupStderr) {
          this.startupStderr.shift()
        }
      }
      this.emit('stderr', message)
    })
    this.connection.on('error', (error) => {
      this.emit('error', error)
    })
    child.on('exit', (code) => {
      this.emit('exit', code)
    })

    try {
      await this.initializeWithTimeout()
      this.startupComplete = true
      this.resolveReady?.()
    } catch (error) {
      this.process?.kill()
      this.process = undefined
      this.connection = undefined
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
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

  private async initializeWithTimeout(): Promise<void> {
    if (this.startupTimeoutMs <= 0) {
      await this.initialize()
      return
    }
    if (!this.process) {
      throw new Error('missing app-server process')
    }
    let timeoutId: NodeJS.Timeout | null = null
    const cleanup: Array<() => void> = []
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`app-server startup timed out after ${this.startupTimeoutMs}ms`))
      }, this.startupTimeoutMs)
    })
    const exitPromise = new Promise<never>((_, reject) => {
      const onExit = (code: number | null) => {
        reject(new Error(`app-server exited before initialize${code !== null ? ` (code ${code})` : ''}`))
      }
      this.process?.once('exit', onExit)
      cleanup.push(() => this.process?.removeListener('exit', onExit))
    })
    const errorPromise = new Promise<never>((_, reject) => {
      const onError = (error: Error) => reject(error)
      this.process?.once('error', onError)
      cleanup.push(() => this.process?.removeListener('error', onError))
    })
    try {
      await Promise.race([this.initialize(), timeoutPromise, exitPromise, errorPromise])
    } catch (error) {
      if (error instanceof Error && error.message.includes('startup timed out')) {
        const stderr = this.startupStderr.join('\n')
        if (stderr) {
          throw new Error(`${error.message}\n\n${stderr}`)
        }
      }
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      cleanup.forEach((fn) => fn())
    }
  }
}

export type CodexAppServerEventsMap = CodexAppServerEvents
