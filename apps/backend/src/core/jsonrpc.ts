import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'

export type JsonRpcError = {
  code?: number
  message: string
  data?: unknown
}

export type JsonRpcRequest = {
  id: number
  method: string
  params?: unknown
}

export type JsonRpcResponse = {
  id: number
  result?: unknown
  error?: JsonRpcError
}

export type JsonRpcNotification = {
  method: string
  params?: unknown
}

export type JsonRpcServerRequest = JsonRpcRequest

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: JsonRpcError) => void
}

type JsonRpcEvents = {
  notification: (message: JsonRpcNotification) => void
  serverRequest: (message: JsonRpcServerRequest) => void
  close: () => void
  error: (error: Error) => void
  stderr: (message: string) => void
}

export class JsonRpcConnection extends EventEmitter {
  private buffer = ''
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private readonly stdin: Writable

  constructor(
    stdin: Writable,
    stdout: NodeJS.ReadableStream,
    stderr?: NodeJS.ReadableStream
  ) {
    super()
    this.stdin = stdin

    stdout.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      this.handleChunk(text)
    })

    stdout.on('end', () => {
      this.rejectAllPending(new Error('connection closed'))
      this.emit('close')
    })

    stdout.on('error', (error) => {
      this.rejectAllPending(error)
      this.emit('error', error)
    })

    stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const trimmed = text.trim()
      if (trimmed) {
        this.emit('stderr', trimmed)
      }
    })
  }

  sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const message: JsonRpcRequest = { id, method, params }
    this.writeMessage(message)
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject: (error) => reject(new Error(error.message)),
      })
    })
  }

  sendNotification(method: string, params?: unknown): void {
    const message: JsonRpcNotification = { method, params }
    this.writeMessage(message)
  }

  sendResponse(id: number, result?: unknown, error?: JsonRpcError): void {
    const message: JsonRpcResponse = { id, result, error }
    this.writeMessage(message)
  }

  private handleChunk(text: string): void {
    this.buffer += text
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const raw = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (raw) {
        this.handleLine(raw)
      }
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let payload: unknown
    try {
      payload = JSON.parse(line)
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      return
    }

    if (!payload || typeof payload !== 'object') {
      return
    }

    const message = payload as Partial<
      JsonRpcRequest & JsonRpcResponse & JsonRpcNotification
    >

    if (typeof message.id === 'number' && message.method) {
      this.emit('serverRequest', {
        id: message.id,
        method: message.method,
        params: message.params,
      })
      return
    }

    if (typeof message.id === 'number' && !message.method) {
      const pending = this.pending.get(message.id)
      if (!pending) {
        return
      }
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(message.error)
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.method) {
      this.emit('notification', {
        method: message.method,
        params: message.params,
      })
    }
  }

  private writeMessage(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): void {
    this.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private rejectAllPending(error: Error): void {
    if (!this.pending.size) {
      return
    }
    const message = error.message || 'connection closed'
    for (const [, pending] of this.pending) {
      pending.reject({ message })
    }
    this.pending.clear()
  }
}

export type JsonRpcEventsMap = JsonRpcEvents
