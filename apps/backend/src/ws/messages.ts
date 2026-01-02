export type WsRequest =
  | {
      type: 'profile.start'
      profileId: string
    }
  | {
      type: 'profile.stop'
      profileId: string
    }
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

export type WsEvent =
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
      type: 'profile.diagnostic'
      profileId: string
      message: string
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

export type WsResponse =
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
