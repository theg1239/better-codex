import { create } from 'zustand'
import type { Account, Thread, Message, ApprovalRequest, TabType, ModelInfo, ReasoningEffort, ReasoningSummary, ApprovalPolicy, QueuedMessage } from '../types'

interface AppState {
  accounts: Account[]
  selectedAccountId: string | null
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  
  threads: Thread[]
  selectedThreadId: string | null
  modelsByAccount: Record<string, ModelInfo[]>
  threadModels: Record<string, string>
  threadEfforts: Record<string, ReasoningEffort>
  threadSummaries: Record<string, ReasoningSummary>
  threadApprovals: Record<string, ApprovalPolicy>
  threadWebSearch: Record<string, boolean>
  threadTurnIds: Record<string, string>
  
  messages: Record<string, Message[]>
  queuedMessages: Record<string, QueuedMessage[]>
  
  approvals: ApprovalRequest[]
  
  activeTab: TabType
  isSidebarCollapsed: boolean
  
  setSelectedAccountId: (id: string | null) => void
  setAccounts: (accounts: Account[]) => void
  addAccount: (account: Account) => void
  removeAccount: (id: string) => void
  updateAccountStatus: (id: string, status: Account['status']) => void
  updateAccount: (id: string, updater: (account: Account) => Account) => void
  
  setSelectedThreadId: (id: string | null) => void
  setThreadsForAccount: (accountId: string, threads: Thread[]) => void
  addThread: (thread: Thread) => void
  removeThread: (id: string) => void
  updateThread: (id: string, updates: Partial<Thread>) => void
  setModelsForAccount: (accountId: string, models: ModelInfo[]) => void
  setThreadModel: (threadId: string, modelId: string) => void
  setThreadEffort: (threadId: string, effort: ReasoningEffort) => void
  setThreadSummary: (threadId: string, summary: ReasoningSummary) => void
  setThreadApproval: (threadId: string, approval: ApprovalPolicy) => void
  setThreadWebSearch: (threadId: string, enabled: boolean) => void
  setThreadTurnId: (threadId: string, turnId: string | null) => void
  
  addMessage: (threadId: string, message: Message) => void
  appendAgentDelta: (threadId: string, messageId: string, delta: string) => void
  appendMessageDelta: (threadId: string, messageId: string, delta: string) => void
  upsertMessage: (threadId: string, message: Message) => void
  ensureAssistantMessage: (threadId: string, messageId: string) => void
  setMessagesForThread: (threadId: string, messages: Message[]) => void
  clearMessages: (threadId: string) => void
  enqueueMessage: (threadId: string, message: QueuedMessage) => void
  shiftQueuedMessage: (threadId: string) => QueuedMessage | null
  clearQueuedMessages: (threadId: string) => void
  
  addApproval: (approval: ApprovalRequest) => void
  resolveApproval: (id: string, status: 'approved' | 'denied') => void
  
  setActiveTab: (tab: TabType) => void
  toggleSidebar: () => void
  setConnectionStatus: (status: AppState['connectionStatus']) => void
}

export const useAppStore = create<AppState>((set) => ({
  accounts: [],
  selectedAccountId: null,
  connectionStatus: 'idle',
  threads: [],
  selectedThreadId: null,
  modelsByAccount: {},
  threadModels: {},
  threadEfforts: {},
  threadSummaries: {},
  threadApprovals: {},
  threadWebSearch: {},
  threadTurnIds: {},
  messages: {},
  queuedMessages: {},
  approvals: [],
  activeTab: 'sessions',
  isSidebarCollapsed: false,

  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  setAccounts: (accounts) => set({ accounts }),
  addAccount: (account) => set((state) => ({ accounts: [...state.accounts, account] })),
  removeAccount: (id) => set((state) => {
    const remainingThreads = state.threads.filter((thread) => thread.accountId !== id)
    const remainingThreadIds = new Set(remainingThreads.map((thread) => thread.id))
    const messages = Object.fromEntries(
      Object.entries(state.messages).filter(([threadId]) => remainingThreadIds.has(threadId))
    )
    const queuedMessages = Object.fromEntries(
      Object.entries(state.queuedMessages).filter(([threadId]) => remainingThreadIds.has(threadId))
    )
    const threadModels = Object.fromEntries(
      Object.entries(state.threadModels).filter(([threadId]) => remainingThreadIds.has(threadId))
    )
    const threadEfforts = Object.fromEntries(
      Object.entries(state.threadEfforts).filter(([threadId]) => remainingThreadIds.has(threadId))
    )
    const threadSummaries = Object.fromEntries(
      Object.entries(state.threadSummaries).filter(([threadId]) => remainingThreadIds.has(threadId))
    )
    const threadApprovals = Object.fromEntries(
      Object.entries(state.threadApprovals).filter(([threadId]) => remainingThreadIds.has(threadId))
    )
    const modelsByAccount = { ...state.modelsByAccount }
    delete modelsByAccount[id]

    return {
      accounts: state.accounts.filter((account) => account.id !== id),
      selectedAccountId: state.selectedAccountId === id ? null : state.selectedAccountId,
      selectedThreadId:
        state.selectedThreadId && remainingThreadIds.has(state.selectedThreadId)
          ? state.selectedThreadId
          : null,
      threads: remainingThreads,
      messages,
      queuedMessages,
      threadModels,
      threadEfforts,
      threadSummaries,
      threadApprovals,
      modelsByAccount,
      approvals: state.approvals.filter((approval) => approval.profileId !== id),
    }
  }),
  updateAccountStatus: (id, status) => set((state) => ({
    accounts: state.accounts.map((a) => a.id === id ? { ...a, status } : a),
  })),
  updateAccount: (id, updater) => set((state) => ({
    accounts: state.accounts.map((a) => (a.id === id ? updater(a) : a)),
  })),

  setSelectedThreadId: (id) => set({ selectedThreadId: id }),
  setThreadsForAccount: (accountId, threads) => set((state) => ({
    threads: [
      ...state.threads.filter((thread) => thread.accountId !== accountId),
      ...threads,
    ],
  })),
  addThread: (thread) => set((state) => ({
    threads: [thread, ...state.threads.filter((t) => t.id !== thread.id)],
  })),
  removeThread: (id) => set((state) => ({
    threads: state.threads.filter((t) => t.id !== id),
    selectedThreadId: state.selectedThreadId === id ? null : state.selectedThreadId,
    queuedMessages: Object.fromEntries(
      Object.entries(state.queuedMessages).filter(([threadId]) => threadId !== id)
    ),
    threadSummaries: Object.fromEntries(
      Object.entries(state.threadSummaries).filter(([threadId]) => threadId !== id)
    ),
  })),
  updateThread: (id, updates) => set((state) => {
    const exists = state.threads.some((t) => t.id === id)
    if (!exists) {
      return {
        threads: [
          {
            id,
            accountId: updates.accountId ?? '',
            title: updates.title ?? 'Untitled session',
            preview: updates.preview ?? '',
            model: updates.model ?? 'unknown',
            createdAt: updates.createdAt ?? '',
            status: updates.status ?? 'idle',
            messageCount: updates.messageCount ?? 0,
          },
          ...state.threads,
        ],
      }
    }
    return {
      threads: state.threads.map((t) => t.id === id ? { ...t, ...updates } : t),
    }
  }),
  setModelsForAccount: (accountId, models) => set((state) => ({
    modelsByAccount: {
      ...state.modelsByAccount,
      [accountId]: models,
    },
  })),
  setThreadModel: (threadId, modelId) => set((state) => ({
    threadModels: {
      ...state.threadModels,
      [threadId]: modelId,
    },
  })),
  setThreadEffort: (threadId, effort) => set((state) => ({
    threadEfforts: {
      ...state.threadEfforts,
      [threadId]: effort,
    },
  })),
  setThreadSummary: (threadId, summary) => set((state) => ({
    threadSummaries: {
      ...state.threadSummaries,
      [threadId]: summary,
    },
  })),
  setThreadApproval: (threadId, approval) => set((state) => ({
    threadApprovals: {
      ...state.threadApprovals,
      [threadId]: approval,
    },
  })),
  setThreadWebSearch: (threadId, enabled) => set((state) => ({
    threadWebSearch: {
      ...state.threadWebSearch,
      [threadId]: enabled,
    },
  })),
  setThreadTurnId: (threadId, turnId) => set((state) => {
    if (turnId === null) {
      const { [threadId]: _, ...rest } = state.threadTurnIds
      return { threadTurnIds: rest }
    }
    return {
      threadTurnIds: {
        ...state.threadTurnIds,
        [threadId]: turnId,
      },
    }
  }),

  addMessage: (threadId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [threadId]: [...(state.messages[threadId] || []), message],
    },
    threads: state.threads.map((thread) =>
      thread.id === threadId
        ? { ...thread, messageCount: thread.messageCount + 1 }
        : thread
    ),
  })),
  appendAgentDelta: (threadId, messageId, delta) => set((state) => {
    const existing = state.messages[threadId] || []
    const index = existing.findIndex((msg) => msg.id === messageId)
    if (index === -1) {
      return {
        messages: {
          ...state.messages,
          [threadId]: [
            ...existing,
            {
              id: messageId,
              role: 'assistant',
              content: delta,
              kind: 'chat',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        },
      }
    }
    const updated = [...existing]
    updated[index] = {
      ...updated[index],
      content: `${updated[index].content}${delta}`,
    }
    return {
      messages: {
        ...state.messages,
        [threadId]: updated,
      },
    }
  }),
  appendMessageDelta: (threadId, messageId, delta) => set((state) => {
    const existing = state.messages[threadId] || []
    const index = existing.findIndex((msg) => msg.id === messageId)
    if (index === -1) {
      return {
        messages: {
          ...state.messages,
          [threadId]: [
            ...existing,
            {
              id: messageId,
              role: 'assistant',
              content: delta,
              kind: 'chat',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        },
      }
    }
    const updated = [...existing]
    updated[index] = {
      ...updated[index],
      content: `${updated[index].content}${delta}`,
    }
    return {
      messages: {
        ...state.messages,
        [threadId]: updated,
      },
    }
  }),
  upsertMessage: (threadId, message) => set((state) => {
    const existing = state.messages[threadId] || []
    const index = existing.findIndex((msg) => msg.id === message.id)
    if (index === -1) {
      return {
        messages: {
          ...state.messages,
          [threadId]: [...existing, message],
        },
        threads: state.threads.map((thread) =>
          thread.id === threadId
            ? { ...thread, messageCount: thread.messageCount + 1 }
            : thread
        ),
      }
    }
    const updated = [...existing]
    updated[index] = { ...updated[index], ...message }
    return {
      messages: {
        ...state.messages,
        [threadId]: updated,
      },
    }
  }),
  ensureAssistantMessage: (threadId, messageId) => set((state) => {
    const existing = state.messages[threadId] || []
    if (existing.some((msg) => msg.id === messageId)) {
      return state
    }
    return {
      messages: {
        ...state.messages,
        [threadId]: [
          ...existing,
          {
            id: messageId,
            role: 'assistant',
            content: '',
            kind: 'chat',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      },
    }
  }),
  setMessagesForThread: (threadId, messages) => set((state) => ({
    messages: {
      ...state.messages,
      [threadId]: messages,
    },
    threads: state.threads.map((thread) =>
      thread.id === threadId
        ? { ...thread, messageCount: messages.length }
        : thread
    ),
  })),
  clearMessages: (threadId) => set((state) => ({
    messages: { ...state.messages, [threadId]: [] },
  })),
  enqueueMessage: (threadId, message) => set((state) => ({
    queuedMessages: {
      ...state.queuedMessages,
      [threadId]: [...(state.queuedMessages[threadId] || []), message],
    },
  })),
  shiftQueuedMessage: (threadId) => {
    let next: QueuedMessage | null = null
    set((state) => {
      const queue = state.queuedMessages[threadId] || []
      if (!queue.length) {
        return state
      }
      next = queue[0]
      const remaining = queue.slice(1)
      const queuedMessages = { ...state.queuedMessages }
      if (remaining.length) {
        queuedMessages[threadId] = remaining
      } else {
        delete queuedMessages[threadId]
      }
      return { queuedMessages }
    })
    return next
  },
  clearQueuedMessages: (threadId) => set((state) => {
    if (!state.queuedMessages[threadId]) {
      return state
    }
    const queuedMessages = { ...state.queuedMessages }
    delete queuedMessages[threadId]
    return { queuedMessages }
  }),

  addApproval: (approval) => set((state) => ({ approvals: [...state.approvals, approval] })),
  resolveApproval: (id, status) => set((state) => ({
    approvals: state.approvals.map((a) => a.id === id ? { ...a, status } : a),
  })),

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}))
