export type AccountStatus = 'online' | 'degraded' | 'offline'
export type ThreadStatus = 'active' | 'idle' | 'archived'
export type MessageRole = 'user' | 'assistant'
export type MessageKind = 'chat' | 'reasoning' | 'command' | 'file' | 'tool'
export type TabType = 'sessions' | 'reviews' | 'archive'
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type ReasoningSummary = 'auto' | 'concise' | 'detailed' | 'none'
export type ApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'

export interface RateLimitWindow {
  usedPercent: number
  windowMinutes: number | null
  resetsAt: number | null
}

export interface CreditsSnapshot {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

export interface AccountUsage {
  primary: RateLimitWindow | null
  secondary: RateLimitWindow | null
  credits: CreditsSnapshot | null
  planType: string | null
}

export interface Account {
  id: string
  name: string
  email: string
  plan: string
  status: AccountStatus
  rateLimit: number
  usage?: AccountUsage
}

export interface Thread {
  id: string
  accountId: string
  title: string
  preview: string
  model: string
  createdAt: string
  status: ThreadStatus
  messageCount: number
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  kind?: MessageKind
  title?: string
  timestamp: string
}

export interface QueuedMessage {
  id: string
  text: string
  model?: string
  effort?: ReasoningEffort | null
  summary?: ReasoningSummary | null
  cwd?: string | null
  approvalPolicy?: ApprovalPolicy | null
  createdAt: number
}

export interface ModelInfo {
  id: string
  model: string
  displayName: string
  description: string
  supportedReasoningEfforts: Array<{
    reasoningEffort: ReasoningEffort
    description: string
  }>
  defaultReasoningEffort: ReasoningEffort
  isDefault: boolean
}

export interface ApprovalRequest {
  id: string
  requestId: number
  profileId: string
  threadId: string
  type: 'command' | 'file' | 'network'
  payload: string
  status: 'pending' | 'approved' | 'denied'
}
